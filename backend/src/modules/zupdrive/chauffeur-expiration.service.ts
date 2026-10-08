import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { emitNotification } from "../realtime/socket";
import { EmailService } from "../notifications/email.service";
import { notifierPlateforme } from "../notifications/notification.service";
import {
  libelleDeLaPiece,
  piecesExigees,
  piecesExigeesSociete,
  piecesExigeesVehicule,
} from "./chauffeur-onboarding.service";
import { SocieteDriveService } from "./societe-drive.service";

/**
 * Les pièces des chauffeurs ZupDrive qui arrivent à échéance (assurance,
 * contrôle technique, licence…).
 *
 * Personne ne clique le jour où une assurance expire : il faut aller voir.
 * Le chauffeur est relancé deux fois, 30 puis 10 jours avant, dans son espace
 * et par courriel. Le jour venu, la pièce passe « expirée ».
 *
 * Transport de personnes oblige : si la pièce expirée est une pièce exigée
 * (licence, assurance, contrôle technique, permis…), le chauffeur validé est
 * suspendu automatiquement. Il peut alors déposer la version à jour, et il
 * est rétabli dès que l'équipe la valide (voir
 * ChauffeurOnboardingService.retablirApresRenouvellement).
 *
 * Les pièces d'une société ou de ses véhicules suivent les mêmes relances,
 * adressées au gérant. Un véhicule dont une pièce exigée expire cesse d'être
 * conforme : son chauffeur passe hors ligne, jusqu'à la validation de la
 * version à jour (SocieteDriveService.recalculerVehicule).
 *
 * Chaque relance est posée par une écriture conditionnelle (« seulement si
 * elle n'a pas déjà été envoyée ») avant tout envoi : deux passages
 * simultanés, un redémarrage ou un courriel en échec ne relancent jamais deux
 * fois. Une pièce déposée à 8 jours de l'échéance ne reçoit que la relance
 * des 10 jours.
 */

const RELANCES_JOURS = [30, 10] as const;
const JOUR_MS = 24 * 3600 * 1000;

/** Seules les pièces encore valables comptent : une pièce refusée est déjà à refaire. */
const STATUTS_SUIVIS = ["APPROVED", "PENDING"];

/** Ce qu'il faut savoir d'une pièce pour prévenir le bon destinataire. */
const SELECTION_PIECE = {
  id: true,
  chauffeurId: true,
  societeId: true,
  vehiculeId: true,
  type: true,
  statut: true,
  dateExpiration: true,
  chauffeur: { select: { region: true, statut: true, societeId: true } },
  vehicule: { select: { societeId: true, plaque: true } },
} as const;

type PieceSuivie = {
  id: string;
  chauffeurId: string | null;
  societeId: string | null;
  vehiculeId: string | null;
  type: string;
  statut: string;
  dateExpiration: Date | null;
  chauffeur: { region: string | null; statut: string; societeId: string | null } | null;
  vehicule: { societeId: string; plaque: string } | null;
};

/** La pièce est-elle exigée par le dossier qui la porte ? */
function exigee(piece: PieceSuivie): boolean {
  const types: string[] = piece.chauffeur
    ? piecesExigees(piece.chauffeur.region, { enSociete: Boolean(piece.chauffeur.societeId) })
    : piece.vehiculeId
      ? piecesExigeesVehicule()
      : piecesExigeesSociete();
  return types.includes(piece.type);
}

/** Le dossier qui porte la pièce, comme filtre Prisma. */
const dossierDe = (piece: PieceSuivie) =>
  piece.chauffeurId
    ? { chauffeurId: piece.chauffeurId }
    : piece.vehiculeId
      ? { vehiculeId: piece.vehiculeId }
      : { societeId: piece.societeId! };

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
          archiveeLe: null,
          [champ]: null,
          dateExpiration: { gt: maintenant, lte: horizon },
        },
        select: SELECTION_PIECE,
      });

      for (const piece of candidates) {
        // Il a déjà déposé la version à jour : elle attend l'équipe, inutile
        // de lui demander de la déposer. Si elle est refusée, la relance
        // repartira au passage suivant (elle n'a pas été marquée).
        if (piece.statut === "APPROVED" && (await this.renouvellementEnAttente(piece))) continue;

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
        const titre = `${this.libelle(piece)} : expire dans ${restant} jour${restant > 1 ? "s" : ""}`;
        const echeance = `Le document expire le ${piece.dateExpiration!.toLocaleDateString("fr-FR")}. `;
        if (piece.chauffeur) {
          await this.prevenirLeChauffeur(
            piece.chauffeurId!,
            titre,
            echeance +
              "Déposez-en une version à jour depuis votre dossier chauffeur avant cette date." +
              (exigee(piece) && piece.chauffeur.statut === "VALIDE"
                ? " Sans renouvellement, votre compte chauffeur sera suspendu à cette date."
                : "")
          );
        } else {
          await this.prevenirLaSociete(
            piece,
            titre,
            echeance +
              "Déposez-en une version à jour depuis l'espace de votre société avant cette date." +
              (exigee(piece) && piece.vehicule
                ? " Sans renouvellement, ce véhicule ne pourra plus rouler à cette date."
                : "")
          );
        }
        rappels++;
      }
    }

    const echues = await db.documentChauffeurDrive.findMany({
      where: { statut: { in: STATUTS_SUIVIS }, archiveeLe: null, dateExpiration: { lte: maintenant } },
      select: SELECTION_PIECE,
    });

    let expirees = 0;
    for (const piece of echues) {
      const { count } = await db.documentChauffeurDrive.updateMany({
        where: { id: piece.id, statut: { in: STATUTS_SUIVIS }, archiveeLe: null },
        data: { statut: "EXPIRED" },
      });
      if (count !== 1) continue;
      expirees++;

      const enAttente = await this.renouvellementEnAttente(piece);
      const titre = `${this.libelle(piece)} : document expiré`;
      if (piece.chauffeur) {
        await this.prevenirLeChauffeur(
          piece.chauffeurId!,
          titre,
          enAttente
            ? "Votre document a expiré. La version à jour que vous avez déposée attend la validation de l'équipe ZupDrive."
            : "Votre document a expiré. Déposez-en une version à jour depuis votre dossier chauffeur."
        );
      } else {
        await this.prevenirLaSociete(
          piece,
          titre,
          enAttente
            ? "Le document a expiré. La version à jour déposée attend la validation de l'équipe ZupDrive."
            : "Le document a expiré. Déposez-en une version à jour depuis l'espace de votre société."
        );
      }
    }

    const suspendus = await this.suspendreLesChauffeursNonAJour(maintenant);
    const vehiculesArretes = await this.arreterLesVehiculesNonAJour(maintenant);

    return { rappels, expirees, suspendus, vehiculesArretes };
  }

  /**
   * Suspend tout chauffeur validé dont une pièce exigée est expirée.
   *
   * Calculé à partir de l'état en base, et non des seules pièces expirées à
   * ce passage : un passage interrompu entre les deux étapes est rattrapé au
   * suivant. La suspension est conditionnée à l'état « VALIDE » : jamais
   * appliquée deux fois, jamais par-dessus une décision de l'équipe.
   */
  private static async suspendreLesChauffeursNonAJour(maintenant: Date) {
    const chauffeurs = await db.chauffeurDrive.findMany({
      where: { statut: "VALIDE", documents: { some: { statut: "EXPIRED", archiveeLe: null } } },
      select: {
        id: true,
        nomComplet: true,
        region: true,
        societeId: true,
        documents: { where: { statut: "EXPIRED", archiveeLe: null }, select: { type: true, dateExpiration: true } },
      },
    });

    let suspendus = 0;
    for (const chauffeur of chauffeurs) {
      const exigees = piecesExigees(chauffeur.region, { enSociete: Boolean(chauffeur.societeId) }) as string[];
      const enCause = chauffeur.documents.filter((piece) => exigees.includes(piece.type));
      if (enCause.length === 0) continue;

      const liste = enCause
        .map((piece) =>
          piece.dateExpiration
            ? `${libelleDeLaPiece(piece.type)} (expirée le ${piece.dateExpiration.toLocaleDateString("fr-FR")})`
            : libelleDeLaPiece(piece.type)
        )
        .join(", ");
      const motif = `Document expiré : ${liste}. Déposez la version à jour : votre compte sera rétabli dès sa validation.`;

      const { count } = await db.chauffeurDrive.updateMany({
        where: { id: chauffeur.id, statut: "VALIDE" },
        // Hors ligne aussi : plus aucune course ne lui est proposée.
        data: { statut: "SUSPENDU", motifStatut: motif, suspenduPourExpirationLe: maintenant, enLigne: false },
      });
      if (count !== 1) continue;
      suspendus++;

      logger.warn("ZupDrive chauffeur suspended: expired document", {
        chauffeurId: chauffeur.id,
        pieces: enCause.map((piece) => piece.type),
      });
      await this.prevenirLeChauffeur(chauffeur.id, "Votre compte chauffeur ZupDrive est suspendu", motif);
      await notifierPlateforme(
        `Chauffeur suspendu — ${chauffeur.nomComplet}`,
        `Suspendu automatiquement : ${liste}. Il sera rétabli dès que vous validerez la pièce à jour.`,
        `/superowner/zupdrive/chauffeurs/${chauffeur.id}`
      );
    }
    return suspendus;
  }

  /**
   * Un véhicule conforme dont une pièce exigée a expiré cesse de l'être : son
   * chauffeur passe hors ligne. Calculé, comme les suspensions, à partir de
   * l'état en base : un passage interrompu est rattrapé au suivant.
   */
  private static async arreterLesVehiculesNonAJour(maintenant: Date) {
    const vehicules = await db.vehiculeDrive.findMany({
      where: { conforme: true, documents: { some: { statut: "EXPIRED", archiveeLe: null } } },
      select: { id: true },
    });
    let arretes = 0;
    for (const { id } of vehicules) {
      const resultat = await SocieteDriveService.recalculerVehicule(id, maintenant);
      if (!resultat?.change || resultat.conforme || !resultat.vehicule) continue;
      arretes++;
      logger.warn("ZupDrive véhicule stopped: expired document", { vehiculeId: id });
      await SocieteDriveService.prevenirGerant(
        resultat.vehicule.societeId,
        `Le véhicule ${resultat.vehicule.plaque} ne peut plus rouler`,
        "Une de ses pièces exigées a expiré. Déposez la version à jour : il roulera de nouveau dès sa validation."
      );
      await notifierPlateforme(
        `Véhicule arrêté — ${resultat.vehicule.societe.raisonSociale} (${resultat.vehicule.plaque})`,
        "Une pièce exigée a expiré. Il roulera de nouveau dès que vous validerez la version à jour.",
        `/superowner/zupdrive/societes/${resultat.vehicule.societeId}`
      );
    }
    return arretes;
  }

  /** Le nom de la pièce, avec la plaque pour une pièce de véhicule. */
  private static libelle(piece: PieceSuivie) {
    return piece.vehicule ? `${libelleDeLaPiece(piece.type)} (${piece.vehicule.plaque})` : libelleDeLaPiece(piece.type);
  }

  /** Les pièces d'une société et de ses véhicules s'adressent au gérant. */
  private static async prevenirLaSociete(piece: PieceSuivie, titre: string, message: string) {
    const societeId = piece.societeId ?? piece.vehicule?.societeId;
    if (!societeId) return;
    const societe = await db.societeDrive.findUnique({
      where: { id: societeId },
      select: { gerant: { select: { email: true } } },
    });
    if (!societe) return;
    await SocieteDriveService.prevenirCompte(societe.gerant.email, titre, message, { courriel: true, priorite: "HIGH" });
  }

  /** Une version plus récente de la même pièce attend l'examen de l'équipe. */
  private static async renouvellementEnAttente(piece: PieceSuivie) {
    const enAttente = await db.documentChauffeurDrive.count({
      where: {
        ...dossierDe(piece),
        type: piece.type,
        id: { not: piece.id },
        archiveeLe: null,
        statut: "PENDING",
      },
    });
    return enAttente > 0;
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
