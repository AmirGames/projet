import { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { EmailService } from "../notifications/email.service";
import { notifierPlateforme } from "../notifications/notification.service";
import { CourseDriveService } from "./course-drive.service";
import { ZupDriveSupportService } from "./zupdrive-support.service";

/**
 * L'alerte SOS d'un passager ZupDrive pendant un trajet.
 *
 * L'alerte est enregistrée AVANT tout envoi : un échec d'e-mail ou de
 * notification ne l'annule pas, et `equipePrevenueLe` / `contactPrevenuLe`
 * disent ce qui est réellement parti. Une alerte par course : rejouer l'appel
 * (double appui, réseau coupé) rend la même alerte et ne renvoie rien deux fois.
 * ZupDrive ne promet aucune intervention sur place : l'application renvoie le
 * passager vers le 17 et le 112.
 */

/** Seul un trajet avec un chauffeur en route ou à bord a un sens pour une alerte. */
export const STATUTS_SOS = ["ACCEPTEE", "ARRIVEE", "EN_COURS"];

export interface PositionSos {
  latitude: number;
  longitude: number;
}

const echapper = (texte: string) =>
  texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const lienCarte = (p: PositionSos) => `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`;

const choixAlerte = { id: true, courseId: true, equipePrevenueLe: true, contactPrevenuLe: true, createdAt: true } as const;

export class SosDriveService {
  // ── Contact de confiance ────────────────────────────────────────────────

  static lireContact(userId: string) {
    return db.contactConfianceDrive.findUnique({ where: { userId }, select: { nom: true, email: true, consentementLe: true } });
  }

  /** Le consentement est exigé par la route : le contact est prévenu de ce que le passager lui a annoncé. */
  static enregistrerContact(userId: string, contact: { nom: string; email: string }) {
    const maintenant = new Date();
    return db.contactConfianceDrive.upsert({
      where: { userId },
      create: { userId, ...contact, consentementLe: maintenant },
      update: { ...contact, consentementLe: maintenant },
      select: { nom: true, email: true, consentementLe: true },
    });
  }

  static async supprimerContact(userId: string) {
    await db.contactConfianceDrive.deleteMany({ where: { userId } });
  }

  // ── Alerte ──────────────────────────────────────────────────────────────

  static async declencher(passagerId: string, courseId: string, position?: PositionSos) {
    // 404 si la course n'est pas celle du compte, comme une course inexistante.
    const course = await CourseDriveService.maCourse(passagerId, courseId);
    if (!STATUTS_SOS.includes(course.statut)) {
      throw new ApiError(409, "L'alerte n'est possible que pendant un trajet avec un chauffeur", "SOS_NOT_AVAILABLE");
    }

    let alerte = await db.alerteSosDrive.findUnique({ where: { courseId }, select: choixAlerte });
    if (!alerte) {
      try {
        alerte = await db.alerteSosDrive.create({
          data: { courseId, passagerId, latitude: position?.latitude ?? null, longitude: position?.longitude ?? null },
          select: choixAlerte,
        });
        logger.warn("Alerte SOS ZupDrive déclenchée", { courseId, alerteId: alerte.id });
      } catch (err) {
        // Deux appuis simultanés : l'autre a créé l'alerte, on la reprend.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
        alerte = await db.alerteSosDrive.findUnique({ where: { courseId }, select: choixAlerte });
      }
    } else if (position) {
      await db.alerteSosDrive.update({ where: { courseId }, data: { latitude: position.latitude, longitude: position.longitude } });
    }
    if (!alerte) throw new ApiError(500, "Alerte introuvable", "SOS_FAILED");

    await this.prevenir(alerte.id, passagerId, course, position);
    return db.alerteSosDrive.findUniqueOrThrow({ where: { id: alerte.id }, select: choixAlerte });
  }

  /**
   * Les envois, après l'écriture. Chaque canal se « réserve » avant d'envoyer
   * (updateMany conditionnel) : deux appels simultanés n'envoient pas deux fois ;
   * un envoi qui échoue libère la réservation pour qu'un nouvel appui le retente.
   */
  private static async prevenir(
    alerteId: string,
    passagerId: string,
    course: Awaited<ReturnType<typeof CourseDriveService.maCourse>>,
    position?: PositionSos
  ) {
    const passager = await db.user.findUnique({ where: { id: passagerId }, select: { name: true, email: true } });
    const nom = passager?.name?.trim() || "Un passager";
    const posRetenue = position ?? (await db.alerteSosDrive.findUnique({ where: { id: alerteId }, select: { latitude: true, longitude: true } }).then((a) => (a?.latitude != null && a.longitude != null ? { latitude: a.latitude, longitude: a.longitude } : undefined)));
    const chauffeur = course.chauffeur ? [course.chauffeur.prenom, course.chauffeur.vehicule, course.chauffeur.plaque].filter(Boolean).join(" · ") : "inconnu";
    const resume = [
      `Trajet ${course.id} (${course.statut})`,
      `Départ : ${course.departAdresse}`,
      `Arrivée : ${course.arriveeAdresse}`,
      `Chauffeur : ${chauffeur}`,
      posRetenue ? `Position du passager : ${lienCarte(posRetenue)}` : "Position du passager : non communiquée",
    ];

    // 1. L'équipe ZupDrive : ticket CRITIQUE (support) + cloche de l'administration.
    const equipe = await db.alerteSosDrive.updateMany({ where: { id: alerteId, equipePrevenueLe: null }, data: { equipePrevenueLe: new Date() } });
    if (equipe.count === 1) {
      try {
        const ticket = await ZupDriveSupportService.createTicket({
          category: "AUTRE",
          priority: "CRITIQUE",
          subject: `SOS passager — trajet ${course.id}`,
          description: [`${nom} (${passager?.email ?? "compte supprimé"}) a déclenché une alerte SOS.`, ...resume].join("\n"),
          reporterId: passagerId,
          reporterType: "PASSAGER",
        });
        await db.alerteSosDrive.update({ where: { id: alerteId }, data: { ticketNumber: ticket.ticketNumber } });
        await notifierPlateforme("SOS passager ZupDrive", `${nom} a déclenché une alerte pendant le trajet ${course.id}.`, "/superowner/zupdrive/support");
      } catch (err) {
        logger.error("Alerte SOS : équipe non prévenue", { alerteId, error: err instanceof Error ? err.message : err });
        await db.alerteSosDrive.update({ where: { id: alerteId }, data: { equipePrevenueLe: null } });
      }
    }

    // 2. La personne de confiance, si le passager en a enregistré une.
    const contact = await db.contactConfianceDrive.findUnique({ where: { userId: passagerId }, select: { nom: true, email: true } });
    if (!contact) return;
    const reserve = await db.alerteSosDrive.updateMany({ where: { id: alerteId, contactPrevenuLe: null }, data: { contactPrevenuLe: new Date() } });
    if (reserve.count !== 1) return;
    try {
      const lignes = resume.filter((l) => !l.startsWith("Trajet "));
      await EmailService.sendEmail({
        to: contact.email,
        subject: `Alerte de sécurité de ${nom} pendant un trajet ZupDrive`,
        text: [
          `Bonjour ${contact.nom},`,
          `${nom} vous a désigné comme personne de confiance et vient de déclencher une alerte de sécurité pendant un trajet ZupDrive.`,
          ...lignes,
          "Essayez de la joindre. Si vous pensez qu'elle est en danger, appelez le 17 (police) ou le 112 sans attendre. ZupDrive ne peut pas intervenir sur place.",
        ].join("\n"),
        html: [
          `<p>Bonjour ${echapper(contact.nom)},</p>`,
          `<p>${echapper(nom)} vous a désigné comme personne de confiance et vient de déclencher une <strong>alerte de sécurité</strong> pendant un trajet ZupDrive.</p>`,
          `<ul>${lignes.map((l) => `<li>${echapper(l)}</li>`).join("")}</ul>`,
          `<p>Essayez de la joindre. Si vous pensez qu'elle est en danger, appelez le <strong>17</strong> (police) ou le <strong>112</strong> sans attendre. ZupDrive ne peut pas intervenir sur place.</p>`,
        ].join(""),
      });
    } catch (err) {
      logger.error("Alerte SOS : contact de confiance non prévenu", { alerteId, error: err instanceof Error ? err.message : err });
      await db.alerteSosDrive.update({ where: { id: alerteId }, data: { contactPrevenuLe: null } });
    }
  }
}

