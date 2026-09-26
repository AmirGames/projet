import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";
import { FileUploadService } from "./file-upload.service";
import { notifierPlateforme } from "./notification.service";

/**
 * Le dossier d'un livreur, et sa validation par la plateforme.
 *
 * Un livreur naissait `ACTIVE` : il s'inscrivait et pouvait recevoir une course
 * dans la minute, sans que personne n'ait vu son permis ni son assurance. Le
 * modèle `DriverDocument` existait depuis le début — permis, assurance, carte
 * grise, avec date d'expiration et statut — sans qu'aucune route ne l'écrive ni
 * ne le lise.
 *
 * Il attend désormais la validation de la plateforme. L'attribution des courses
 * ne s'adresse qu'aux livreurs `ACTIVE` : rien d'autre n'a eu besoin de changer
 * pour qu'un dossier en attente n'en reçoive aucune.
 */

/** Les états d'un livreur, et ce qu'ils autorisent. */
export const ETATS_LIVREUR = ["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "INACTIVE"] as const;
export type EtatLivreur = (typeof ETATS_LIVREUR)[number];

/** Les pièces qu'un livreur peut déposer. */
export const TYPES_DOCUMENT = ["identity", "license", "insurance", "vehicle_registration"] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

const LIBELLES_DOCUMENT: Record<string, string> = {
  identity: "Pièce d'identité",
  license: "Permis de conduire",
  insurance: "Attestation d'assurance",
  vehicle_registration: "Carte grise",
};

/**
 * Les pièces exigées pour rouler, selon le véhicule.
 *
 * À vélo, ni permis ni carte grise : les exiger empêcherait d'inscrire un
 * livreur parfaitement en règle.
 */
export function piecesAttendues(vehicleType: string): TypeDocument[] {
  if (vehicleType === "bike") return ["identity"];

  return ["identity", "license", "insurance", "vehicle_registration"];
}

export const libelleDuDocument = (type: string) => LIBELLES_DOCUMENT[type] || type;

export class DriverApprovalService {
  /** Le dossier complet : le livreur, ses pièces, ce qui manque. */
  static async dossier(driverId: string) {
    const livreur = await db.driver.findUnique({
      where: { id: driverId },
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        _count: { select: { deliveries: true } },
      },
    });

    if (!livreur) {
      throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");
    }

    const attendues = piecesAttendues(livreur.vehicleType);
    const validees = new Set(
      livreur.documents.filter((piece) => piece.status === "APPROVED").map((piece) => piece.type)
    );

    return {
      ...livreur,
      piecesAttendues: attendues,
      piecesManquantes: attendues.filter((type) => !validees.has(type)),
      dossierComplet: attendues.every((type) => validees.has(type)),
    };
  }

  /** Dépose une pièce. Redéposer la même la remplace : elle repart en attente. */
  static async deposerPiece(
    driverId: string,
    piece: { type: TypeDocument; documentUrl: string; expiryDate?: string | null }
  ) {
    const expire = piece.expiryDate ? new Date(piece.expiryDate) : null;

    if (expire && expire.getTime() < Date.now()) {
      throw new ApiError(
        400,
        `${libelleDuDocument(piece.type)} : ce document est déjà expiré.`,
        "DOCUMENT_EXPIRED"
      );
    }

    // Une pièce corrigée après un refus ne doit pas laisser l'ancienne traîner
    // dans le dossier : elle prend sa place.
    const existante = await db.driverDocument.findFirst({
      where: { driverId, type: piece.type },
      orderBy: { createdAt: "desc" },
    });

    const valeurs = {
      documentUrl: piece.documentUrl,
      expiryDate: expire,
      status: "PENDING",
      reviewNote: null,
      reviewedAt: null,
    };

    const deposee = existante
      ? await db.driverDocument.update({ where: { id: existante.id }, data: valeurs })
      : await db.driverDocument.create({ data: { driverId, type: piece.type, ...valeurs } });

    logger.info("Driver document submitted", { driverId, type: piece.type });

    await this.signalerDepot(driverId, piece.type);

    return deposee;
  }

  /** Prévient la plateforme qu'une pièce attend son examen. */
  private static async signalerDepot(driverId: string, type: TypeDocument) {
    const livreur = await db.driver
      .findUnique({ where: { id: driverId }, select: { name: true, email: true } })
      .catch(() => null);

    await notifierPlateforme(
      `Nouveau document livreur — ${livreur?.name || livreur?.email || "livreur"}`,
      `${libelleDuDocument(type)} a été mis en ligne et attend votre validation.`,
      `/superowner/drivers`
    );
  }

  /** Dépose une pièce via upload de fichier. */
  static async deposerFichier(
    driverId: string,
    piece: { type: TypeDocument; file: Buffer; filename: string; mimeType?: string; expiryDate?: string | null }
  ) {
    const expire = piece.expiryDate ? new Date(piece.expiryDate) : null;

    if (expire && expire.getTime() < Date.now()) {
      throw new ApiError(
        400,
        `${libelleDuDocument(piece.type)} : ce document est déjà expiré.`,
        "DOCUMENT_EXPIRED"
      );
    }

    const existante = await db.driverDocument.findFirst({
      where: { driverId, type: piece.type },
      orderBy: { createdAt: "desc" },
    });

    const { url } = await FileUploadService.uploadDocument(
      piece.file,
      `driver-${driverId}-${piece.type}-${Date.now()}`,
      "drivers",
      piece.mimeType
    );

    const valeurs = {
      documentUrl: url,
      expiryDate: expire,
      status: "PENDING",
      reviewNote: null,
      reviewedAt: null,
    };

    const deposee = existante
      ? await db.driverDocument.update({ where: { id: existante.id }, data: valeurs })
      : await db.driverDocument.create({ data: { driverId, type: piece.type, ...valeurs } });

    logger.info("Driver document uploaded", { driverId, type: piece.type });

    await this.signalerDepot(driverId, piece.type);

    return deposee;
  }

  /**
   * La plateforme corrige l'échéance d'une pièce.
   *
   * Une date mal saisie au dépôt faisait expirer — ou garder valide — une pièce
   * à tort, sans autre recours que de la faire redéposer. Une pièce expirée qui
   * reçoit une date future repart en examen, sans être revalidée d'office.
   */
  static async changerEcheance(driverId: string, documentId: string, expiryDate: string) {
    const piece = await db.driverDocument.findUnique({ where: { id: documentId } });

    if (!piece || piece.driverId !== driverId) {
      throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");
    }

    const echeance = new Date(expiryDate);

    if (Number.isNaN(echeance.getTime())) {
      throw new ApiError(400, "Date d'expiration invalide", "INVALID_EXPIRY_DATE");
    }

    if (echeance.getTime() < Date.now()) {
      throw new ApiError(400, "Cette date est déjà passée", "DOCUMENT_EXPIRED");
    }

    const modifiee = await db.driverDocument.update({
      where: { id: documentId },
      data: {
        expiryDate: echeance,
        ...(piece.status === "EXPIRED" ? { status: "PENDING" } : {}),
      },
    });

    await this.prevenir(
      driverId,
      `${libelleDuDocument(piece.type)} : date d'expiration modifiée`,
      `Nouvelle date d'expiration : ${echeance.toLocaleDateString("fr-FR")}.`
    );

    return { avant: piece.expiryDate, piece: modifiee };
  }

  /** La plateforme statue sur une pièce. */
  static async examinerPiece(
    driverId: string,
    documentId: string,
    verdict: { approuve: boolean; note?: string }
  ) {
    const piece = await db.driverDocument.findUnique({ where: { id: documentId } });

    if (!piece || piece.driverId !== driverId) {
      throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");
    }

    if (!verdict.approuve && !verdict.note?.trim()) {
      throw new ApiError(
        400,
        "Un refus sans motif ne dit pas au livreur quoi corriger",
        "MISSING_REASON"
      );
    }

    const misAJour = await db.driverDocument.update({
      where: { id: documentId },
      data: {
        status: verdict.approuve ? "APPROVED" : "REJECTED",
        reviewNote: verdict.note?.trim() || null,
        reviewedAt: new Date(),
      },
    });

    await this.prevenir(
      driverId,
      verdict.approuve
        ? `${libelleDuDocument(piece.type)} validée`
        : `${libelleDuDocument(piece.type)} refusée`,
      verdict.approuve
        ? "Votre pièce a été acceptée."
        : `Motif : ${verdict.note}. Déposez une nouvelle version.`
    );

    return misAJour;
  }

  /**
   * Valide un livreur : il peut recevoir des courses.
   *
   * Le dossier doit être complet. Valider un livreur sans permis validé serait
   * exactement le trou qu'on vient de boucher.
   */
  static async valider(driverId: string, adminId: string) {
    const dossier = await this.dossier(driverId);

    if (!dossier.dossierComplet) {
      const manquantes = dossier.piecesManquantes.map(libelleDuDocument).join(", ");

      throw new ApiError(
        400,
        `Dossier incomplet : ${manquantes} ${
          dossier.piecesManquantes.length > 1 ? "restent à valider" : "reste à valider"
        }.`,
        "INCOMPLETE_FILE"
      );
    }

    const livreur = await db.driver.update({
      where: { id: driverId },
      data: {
        status: "ACTIVE",
        approvedAt: new Date(),
        approvedBy: adminId,
        statusReason: null,
      },
    });

    logger.info("Driver approved", { driverId, adminId });

    await this.prevenir(
      driverId,
      "Votre compte livreur est validé",
      "Vous pouvez vous mettre en ligne et recevoir des courses."
    );

    return livreur;
  }

  /**
   * Refuse ou suspend un livreur. Dans les deux cas il quitte la file : les
   * courses en cours ne lui sont pas retirées, mais il n'en reçoit plus.
   */
  static async ecarter(
    driverId: string,
    etat: "REJECTED" | "SUSPENDED" | "INACTIVE",
    raison: string,
    adminId: string
  ) {
    if (!raison.trim()) {
      throw new ApiError(400, "Dites au livreur pourquoi", "MISSING_REASON");
    }

    const livreur = await db.driver.update({
      where: { id: driverId },
      data: {
        status: etat,
        statusReason: raison.trim(),
        // Un livreur écarté ne doit pas rester « en ligne » dans les listes.
        isOnline: false,
        isAvailable: false,
        approvedBy: adminId,
      },
    });

    logger.warn("Driver set aside", { driverId, etat, adminId });

    await this.prevenir(
      driverId,
      etat === "REJECTED" ? "Votre dossier a été refusé" : "Votre compte livreur est suspendu",
      raison.trim()
    );

    return livreur;
  }

  /** Remet en course un livreur suspendu, sans repasser par le dossier. */
  static async reactiver(driverId: string, adminId: string) {
    const livreur = await db.driver.findUnique({ where: { id: driverId } });

    if (!livreur) {
      throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");
    }

    if (livreur.status === "PENDING" || livreur.status === "REJECTED") {
      throw new ApiError(
        400,
        "Ce dossier n'a jamais été validé : passez par la validation",
        "NEVER_APPROVED"
      );
    }

    const remis = await db.driver.update({
      where: { id: driverId },
      data: { status: "ACTIVE", statusReason: null, approvedBy: adminId },
    });

    await this.prevenir(
      driverId,
      "Votre compte livreur est rétabli",
      "Vous pouvez de nouveau vous mettre en ligne."
    );

    return remis;
  }

  /**
   * Prévient le livreur.
   *
   * Un dossier refusé sans message laisse le livreur devant un écran qui dit
   * « en attente » pour toujours.
   */
  private static async prevenir(driverId: string, titre: string, corps: string) {
    const livreur = await db.driver.findUnique({
      where: { id: driverId },
      select: { email: true },
    });

    if (!livreur) return;

    const notification = await db.notification.create({
      data: {
        type: "PLATFORM_ANNOUNCEMENT",
        title: titre,
        message: corps,
        recipientEmail: livreur.email,
        link: "/driver",
      },
    });

    emitNotification(livreur.email, notification);
  }
}
