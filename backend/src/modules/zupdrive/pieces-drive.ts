import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { FileUploadService } from "../files/file-upload.service";
import { libelleDeLaPiece } from "./chauffeur-onboarding.service";

/**
 * Les versions d'une pièce ZupDrive, quel que soit le dossier qui la porte :
 * un chauffeur, une société ou un véhicule de société (DocumentChauffeurDrive,
 * exactement un des trois — contrainte en base).
 *
 * Les mêmes règles pour tous (voir docs/zupdrive.md, « Renouvellement ») :
 *   - au dépôt, la version en vigueur (validée ou expirée) n'est jamais
 *     écrasée ; seule une version en attente ou refusée est remplacée ;
 *   - validée, une version archive l'ancienne dans la même transaction ;
 *     refusée, elle laisse l'ancienne en vigueur ;
 *   - une version expirée ne se valide pas, un refus porte un motif.
 */

export type Proprietaire = { chauffeurId: string } | { societeId: string } | { vehiculeId: string };

/** La date d'expiration saisie, vérifiée : ni illisible, ni déjà passée. */
function dateExpirationDeposee(type: string, saisie: string | null | undefined): Date | null {
  const expiration = saisie ? new Date(saisie) : null;
  if (expiration && Number.isNaN(expiration.getTime())) {
    throw new ApiError(400, "Date d'expiration invalide", "INVALID_EXPIRY_DATE");
  }
  if (expiration && expiration.getTime() < Date.now()) {
    throw new ApiError(400, `${libelleDeLaPiece(type)} : ce document est déjà expiré.`, "DOCUMENT_EXPIRED");
  }
  return expiration;
}

/**
 * Enregistre le fichier (stockage privé « chauffeurs », servi par /api/files
 * au seul dossier concerné et à l'équipe) et la nouvelle version.
 * `existantes` : les versions non archivées du dossier.
 */
export async function deposerVersion(
  proprietaire: Proprietaire,
  piece: { type: string; file: Buffer; mimeType?: string; dateExpiration?: string | null },
  existantes: { id: string; type: string; statut: string }[],
  prefixeFichier: string
) {
  const expiration = dateExpirationDeposee(piece.type, piece.dateExpiration);

  const { url } = await FileUploadService.uploadDocument(
    piece.file,
    `${prefixeFichier}-${piece.type}-${Date.now()}`,
    "chauffeurs",
    piece.mimeType
  );

  const valeurs = {
    url,
    dateExpiration: expiration,
    statut: "PENDING",
    noteExamen: null,
    examineLe: null,
    // Nouvelle pièce, nouvelle échéance : les relances repartent de zéro.
    rappel30JoursLe: null,
    rappel10JoursLe: null,
  };

  const aRemplacer = existantes
    .filter((doc) => doc.type === piece.type && (doc.statut === "PENDING" || doc.statut === "REJECTED"))
    .at(-1);

  return aRemplacer
    ? db.documentChauffeurDrive.update({ where: { id: aRemplacer.id }, data: valeurs })
    : db.documentChauffeurDrive.create({ data: { ...proprietaire, type: piece.type, ...valeurs } });
}

/**
 * L'équipe statue sur une version. `piece` est la version lue en base, dont
 * l'appelant a vérifié qu'elle appartient bien au dossier examiné.
 */
export async function examinerVersion(
  piece: { id: string; type: string; dateExpiration: Date | null },
  proprietaire: Proprietaire,
  verdict: { approuve: boolean; note?: string },
  motifManquant = "Un refus sans motif ne dit pas quoi corriger"
) {
  if (verdict.approuve && piece.dateExpiration && piece.dateExpiration.getTime() <= Date.now()) {
    throw new ApiError(400, "Ce document est expiré : il ne peut pas être validé", "DOCUMENT_EXPIRED");
  }
  if (!verdict.approuve && !verdict.note?.trim()) {
    throw new ApiError(400, motifManquant, "MISSING_REASON");
  }

  const maintenant = new Date();
  const [examinee] = await db.$transaction([
    db.documentChauffeurDrive.update({
      where: { id: piece.id },
      data: {
        statut: verdict.approuve ? "APPROVED" : "REJECTED",
        noteExamen: verdict.note?.trim() || null,
        examineLe: maintenant,
      },
    }),
    ...(verdict.approuve
      ? [
          db.documentChauffeurDrive.updateMany({
            where: {
              ...proprietaire,
              type: piece.type,
              id: { not: piece.id },
              archiveeLe: null,
              statut: { in: ["APPROVED", "EXPIRED"] },
            },
            data: { archiveeLe: maintenant },
          }),
        ]
      : []),
  ]);
  return examinee;
}
