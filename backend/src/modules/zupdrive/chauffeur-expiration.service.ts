import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { emitNotification } from "../realtime/socket";
import { EmailService } from "../notifications/email.service";
import { notifierPlateforme } from "../notifications/notification.service";
import { libelleDeLaPiece } from "./chauffeur-onboarding.service";

/**
 * Les pièces des chauffeurs ZupDrive qui arrivent à échéance (assurance,
 * contrôle technique, licence…).
 *
 * Personne ne clique le jour où une assurance expire : il faut aller voir.
 * Le chauffeur est relancé deux fois, 30 puis 10 jours avant, dans son espace
 * et par courriel. Le jour venu, la pièce passe « expirée » et l'équipe
 * ZupDrive l'apprend ; le chauffeur n'est pas suspendu d'office — c'est à
 * l'équipe d'en décider.
 *
 * Chaque relance est posée par une écriture conditionnelle (« seulement si
 * elle n'a pas déjà été envoyée ») avant tout envoi : deux passages
 * simultanés, un redémarrage ou un courriel en échec ne relancent jamais deux
 * fois. Une pièce déposée à 8 jours de l'échéance ne reçoit que la relance
 * des 10 jours.
 */

export const RELANCES_JOURS = [30, 10] as const;
const JOUR_MS = 24 * 3600 * 1000;

/** Seules les pièces encore valables comptent : une pièce refusée est déjà à refaire. */
const STATUTS_SUIVIS = ["APPROVED", "PENDING"];

const echapper = (texte: string) =>
  texte.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export class ChauffeurExpirationService {
  static async surveiller(maintenant = new Date()) {
    let rappels = 0;

    // La relance la plus proche d'abord : une pièce à 8 jours ne reçoit que
    // celle des 10 jours, et plus jamais celle des 30.
    for (const jours of [...RELANCES_JOURS].sort((a, b) => a - b)) {
      const champ = jours === 30 ? "rappel30JoursLe" : "rappel10JoursLe";
      const horizon = new Date(maintenant.getTime() + jours * JOUR_MS);

      const candidates = await db.documentChauffeurDrive.findMany({
        where: {
          statut: { in: STATUTS_SUIVIS },
          [champ]: null,
          dateExpiration: { gt: maintenant, lte: horizon },
        },
        select: { id: true, chauffeurId: true, type: true, dateExpiration: true },
      });

      for (const piece of candidates) {
        const { count } = await db.documentChauffeurDrive.updateMany({
          where: { id: piece.id, [champ]: null },
          data: { [champ]: maintenant },
        });
        if (count !== 1) continue;
        // La relance des 10 jours rend celle des 30 sans objet.
        if (jours === 10) {
          await db.documentChauffeurDrive.updateMany({
            where: { id: piece.id, rappel30JoursLe: null },
            data: { rappel30JoursLe: maintenant },
          });
        }

        const restant = Math.max(1, Math.ceil((piece.dateExpiration!.getTime() - maintenant.getTime()) / JOUR_MS));
        const libelle = libelleDeLaPiece(piece.type);
        await this.prevenirLeChauffeur(
          piece.chauffeurId,
          `${libelle} : expire dans ${restant} jour${restant > 1 ? "s" : ""}`,
          `Votre document expire le ${piece.dateExpiration!.toLocaleDateString("fr-FR")}. ` +
            "Déposez-en une version à jour depuis votre dossier chauffeur avant cette date."
        );
        rappels++;
      }
    }

    const echues = await db.documentChauffeurDrive.findMany({
      where: { statut: { in: STATUTS_SUIVIS }, dateExpiration: { lte: maintenant } },
      select: { id: true, chauffeurId: true, type: true, chauffeur: { select: { nomComplet: true } } },
    });

    let expirees = 0;
    for (const piece of echues) {
      const { count } = await db.documentChauffeurDrive.updateMany({
        where: { id: piece.id, statut: { in: STATUTS_SUIVIS } },
        data: { statut: "EXPIRED" },
      });
      if (count !== 1) continue;
      expirees++;

      const libelle = libelleDeLaPiece(piece.type);
      await this.prevenirLeChauffeur(
        piece.chauffeurId,
        `${libelle} : document expiré`,
        "Votre document a expiré. Déposez-en une version à jour depuis votre dossier chauffeur."
      );
      await notifierPlateforme(
        `Pièce expirée — chauffeur ${piece.chauffeur.nomComplet}`,
        `${libelle} a expiré. Le chauffeur n'est pas suspendu d'office : à vous de décider de la suite.`,
        `/superowner/zupdrive/chauffeurs/${piece.chauffeurId}`
      );
    }

    return { rappels, expirees };
  }

  /**
   * Dans son espace et par courriel : une échéance s'annonce des semaines à
   * l'avance, il ne consulte pas forcément son dossier d'ici là. Un envoi en
   * échec ne défait pas la relance, déjà enregistrée.
   */
  private static async prevenirLeChauffeur(chauffeurId: string, titre: string, message: string) {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: { nomComplet: true, user: { select: { email: true } } },
      });
      const email = chauffeur?.user.email;
      if (!email) return;

      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: titre,
          message,
          recipientEmail: email,
          link: "/chauffeur",
          priority: "HIGH",
        },
      });
      emitNotification(email, notification);

      await EmailService.sendEmail({
        to: email,
        subject: `ZupDrive — ${titre}`,
        html: `<p>Bonjour ${echapper(chauffeur.nomComplet)},</p><p>${echapper(message)}</p>`,
        text: `Bonjour ${chauffeur.nomComplet},\n\n${message}`,
      });
    } catch (err) {
      logger.warn("ZupDrive chauffeur expiry reminder failed", {
        chauffeurId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }
}
