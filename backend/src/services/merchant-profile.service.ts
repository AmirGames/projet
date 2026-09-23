import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";
import { FileUploadService } from "./file-upload.service";

/**
 * Le profil du commerçant : son identité de facturation, son propriétaire, son
 * compte bancaire et ses justificatifs.
 *
 * La plateforme lui facturait une commission et lui devait des versements sans
 * rien savoir de lui : ni raison sociale, ni adresse de facturation, ni numéro
 * de TVA, ni compte où virer. Une facture sans ces mentions n'en est pas une,
 * et un versement sans IBAN ne part nulle part.
 *
 * **L'IBAN n'est jamais rendu en entier.** Les écrans n'en montrent que les
 * quatre derniers caractères : assez pour que le commerçant reconnaisse son
 * compte, pas assez pour s'en servir ailleurs. Il ne part donc ni dans une
 * réponse d'API, ni dans un journal.
 */

/** Les pays où la plateforme opère, et le format de leur TVA. */
const PAYS = {
  France: { tva: /^FR[0-9A-Z]{2}[0-9]{9}$/, exemple: "FR12345678901" },
  Belgique: { tva: /^BE[01][0-9]{9}$/, exemple: "BE0123456789" },
} as const;

export const PAYS_CONNUS = Object.keys(PAYS);

/** Les pièces qu'un commerçant peut déposer. */
export const TYPES_DOCUMENT_COMMERCANT = [
  "registration",
  "identity",
  "vat",
  "bank",
  "other",
] as const;

export type TypeDocumentCommercant = (typeof TYPES_DOCUMENT_COMMERCANT)[number];

const LIBELLES_DOCUMENT: Record<string, string> = {
  registration: "Extrait d'immatriculation (Kbis, BCE)",
  identity: "Pièce d'identité du propriétaire",
  vat: "Attestation de TVA",
  bank: "Relevé d'identité bancaire",
  other: "Autre document",
};

export const libelleDuDocumentCommercant = (type: string) =>
  LIBELLES_DOCUMENT[type] || type;

/**
 * Les pièces exigées avant d'ouvrir.
 *
 * La TVA n'en fait pas partie : une petite structure en franchise n'en a pas,
 * et l'exiger l'empêcherait de s'inscrire.
 */
export const PIECES_EXIGEES = ["registration", "identity", "bank"] as const;

/**
 * Où en est la validation du commerce : ce qui est validé, ce qui manque.
 *
 * Un seul calcul pour l'écran du commerçant, celui de la plateforme et le
 * contrôle au moment de valider : trois copies auraient divergé.
 */
export function etatDeValidation(
  approvedAt: Date | null,
  documents: { type: string; status: string }[]
) {
  const validees = new Set(
    documents.filter((piece) => piece.status === "APPROVED").map((piece) => piece.type)
  );
  const manquantes = PIECES_EXIGEES.filter((type) => !validees.has(type));
  const decrire = (type: string) => ({ type, libelle: libelleDuDocumentCommercant(type) });

  return {
    valide: !!approvedAt,
    approvedAt,
    piecesExigees: PIECES_EXIGEES.map(decrire),
    piecesManquantes: manquantes.map(decrire),
    dossierComplet: manquantes.length === 0,
  };
}

/**
 * Un IBAN réduit à ce qu'il faut pour le reconnaître.
 *
 * Le rendre en entier exposerait une coordonnée bancaire à chaque ouverture de
 * page, à chaque appel d'API, à quiconque lirait un journal.
 */
export function ibanMasque(iban: string | null): string | null {
  if (!iban) return null;

  const propre = iban.replace(/\s+/g, "");

  return propre.length <= 4 ? "••••" : `•••• ${propre.slice(-4)}`;
}

/**
 * Le numéro de TVA correspond-il au pays.
 *
 * Extrait du profil parce que la boutique en a besoin elle aussi : une
 * organisation peut couvrir trois commerces relevant de trois sociétés, donc de
 * trois numéros. Deux contrôles séparés auraient divergé.
 */
export function verifierLaTva(tva: string, pays: string) {
  const regle = PAYS[pays as keyof typeof PAYS];

  if (regle && !regle.tva.test(tva)) {
    throw new ApiError(
      400,
      `Numéro de TVA ${pays.toLowerCase()} invalide (exemple : ${regle.exemple})`,
      "INVALID_VAT"
    );
  }
}

/** Longueur et alphabet d'un IBAN, sans prétendre valider la clé de contrôle. */
const IBAN_VALIDE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/;

export class MerchantProfileService {
  /** Le profil, tel qu'un écran peut le montrer. */
  static async profil(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        _count: { select: { stores: true } },
      },
    });

    if (!org) {
      throw new ApiError(404, "Organisation introuvable", "ORG_NOT_FOUND");
    }

    const { iban, ...reste } = org;

    return {
      ...reste,
      // Jamais l'IBAN lui-même : seulement de quoi reconnaître le compte.
      ibanMasque: ibanMasque(iban),
      ibanRenseigne: !!iban,
      documents: org.documents.map((piece) => ({
        ...piece,
        libelle: libelleDuDocumentCommercant(piece.type),
      })),
      validation: etatDeValidation(org.approvedAt, org.documents),
      paysConnus: PAYS_CONNUS,
      typesDocument: TYPES_DOCUMENT_COMMERCANT.map((type) => ({
        type,
        libelle: libelleDuDocumentCommercant(type),
      })),
      /** Le format attendu, pour que l'écran le montre avant la faute. */
      exempleTva: PAYS[(org.billingCountry || "France") as keyof typeof PAYS]?.exemple || null,
      /**
       * Ce qui manque pour être facturé et payé.
       *
       * Un commerçant ne devine pas qu'il manque son IBAN le jour où la
       * plateforme ne peut pas le virer.
       */
      manquePourFacturer: [
        !org.legalName && "la raison sociale",
        !org.billingAddress && "l'adresse de facturation",
        !org.vatNumber && "le numéro de TVA",
      ].filter(Boolean) as string[],
      manquePourEtrePaye: [!iban && "l'IBAN", !org.accountHolder && "le titulaire du compte"].filter(
        Boolean
      ) as string[],
    };
  }

  /**
   * Enregistre le profil.
   *
   * Le commerçant est maître de ces informations : elles le décrivent, lui, et
   * la plateforme n'en corrige aucune.
   */
  static async enregistrer(
    orgId: string,
    voulu: Record<string, unknown>
  ) {
    const org = await db.organization.findUnique({ where: { id: orgId } });

    if (!org) {
      throw new ApiError(404, "Organisation introuvable", "ORG_NOT_FOUND");
    }

    const donnees: Record<string, unknown> = {};

    const texte = (valeur: unknown) => {
      const propre = String(valeur ?? "").trim();
      return propre || null;
    };

    for (const champ of [
      "legalName",
      "registrationNumber",
      "billingAddress",
      "billingPostalCode",
      "billingCity",
      "ownerFirstName",
      "ownerLastName",
      "ownerPhone",
      "accountHolder",
      "bic",
    ]) {
      if (voulu[champ] !== undefined) donnees[champ] = texte(voulu[champ]);
    }

    if (voulu.billingCountry !== undefined) {
      const pays = texte(voulu.billingCountry);

      if (pays && !PAYS_CONNUS.includes(pays)) {
        throw new ApiError(
          400,
          `Pays inconnu : la plateforme opère en ${PAYS_CONNUS.join(" et en ")}`,
          "UNKNOWN_COUNTRY"
        );
      }

      donnees.billingCountry = pays;
    }

    if (voulu.ownerEmail !== undefined) {
      const email = texte(voulu.ownerEmail);

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ApiError(400, "E-mail du propriétaire invalide", "INVALID_EMAIL");
      }

      donnees.ownerEmail = email;
    }

    if (voulu.ownerBirthDate !== undefined) {
      const brut = texte(voulu.ownerBirthDate);

      if (!brut) {
        donnees.ownerBirthDate = null;
      } else {
        const date = new Date(brut);

        if (Number.isNaN(date.getTime())) {
          throw new ApiError(400, "Date de naissance illisible", "INVALID_DATE");
        }

        // Une date future, ou un propriétaire de trois ans, est une faute de
        // frappe : la laisser passer fausserait tout contrôle ultérieur.
        const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);

        if (age < 16 || age > 120) {
          throw new ApiError(400, "Date de naissance invraisemblable", "INVALID_DATE");
        }

        donnees.ownerBirthDate = date;
      }
    }

    if (voulu.vatNumber !== undefined) {
      const tva = texte(voulu.vatNumber)?.replace(/\s+/g, "").toUpperCase() || null;

      if (tva) {
        verifierLaTva(tva, (donnees.billingCountry as string) || org.billingCountry || "France");
      }

      donnees.vatNumber = tva;
    }

    if (voulu.iban !== undefined) {
      const iban = texte(voulu.iban)?.replace(/\s+/g, "").toUpperCase() || null;

      if (iban && !IBAN_VALIDE.test(iban)) {
        throw new ApiError(400, "IBAN invalide", "INVALID_IBAN");
      }

      donnees.iban = iban;
    }

    if (Object.keys(donnees).length === 0) {
      throw new ApiError(400, "Aucune information à enregistrer", "NOTHING_TO_SAVE");
    }

    await db.organization.update({ where: { id: orgId }, data: donnees });

    // Les champs touchés, jamais leurs valeurs : un IBAN n'a rien à faire dans
    // un journal.
    logger.info("Merchant profile saved", { orgId, champs: Object.keys(donnees) });

    return this.profil(orgId);
  }

  /** Dépose une pièce. Redéposer la même la remplace : elle repart en attente. */
  static async deposerPiece(
    orgId: string,
    piece: { type: TypeDocumentCommercant; documentUrl: string; fileName?: string; expiryDate?: string | null }
  ) {
    const expire = piece.expiryDate ? new Date(piece.expiryDate) : null;

    if (expire && expire.getTime() < Date.now()) {
      throw new ApiError(
        400,
        `${libelleDuDocumentCommercant(piece.type)} : ce document est déjà expiré.`,
        "DOCUMENT_EXPIRED"
      );
    }

    if (!/^https?:\/\//i.test(piece.documentUrl.trim())) {
      throw new ApiError(400, "Donnez un lien vers le document", "INVALID_URL");
    }

    // Une pièce corrigée après un refus ne doit pas laisser l'ancienne traîner
    // dans le dossier : elle prend sa place.
    const existante = await db.organizationDocument.findFirst({
      where: { orgId, type: piece.type },
      orderBy: { createdAt: "desc" },
    });

    const valeurs = {
      documentUrl: piece.documentUrl.trim(),
      fileName: piece.fileName?.trim() || null,
      expiryDate: expire,
      status: "PENDING",
      reviewNote: null,
      reviewedAt: null,
      // Une nouvelle pièce a sa propre échéance : l'ancien rappel ne la couvre pas.
      expiryReminderAt: null,
    };

    return existante
      ? db.organizationDocument.update({ where: { id: existante.id }, data: valeurs })
      : db.organizationDocument.create({ data: { orgId, type: piece.type, ...valeurs } });
  }

  /** Dépose une pièce via upload de fichier. */
  static async deposerFichier(
    orgId: string,
    piece: { type: TypeDocumentCommercant; file: Buffer; filename: string; expiryDate?: string | null }
  ) {
    const expire = piece.expiryDate ? new Date(piece.expiryDate) : null;

    if (expire && expire.getTime() < Date.now()) {
      throw new ApiError(
        400,
        `${libelleDuDocumentCommercant(piece.type)} : ce document est déjà expiré.`,
        "DOCUMENT_EXPIRED"
      );
    }

    const existante = await db.organizationDocument.findFirst({
      where: { orgId, type: piece.type },
      orderBy: { createdAt: "desc" },
    });

    const { url } = await FileUploadService.uploadDocument(
      piece.file,
      `merchant-${orgId}-${piece.type}-${Date.now()}`,
      "merchants"
    );

    const valeurs = {
      documentUrl: url,
      fileName: piece.filename,
      expiryDate: expire,
      status: "PENDING",
      reviewNote: null,
      reviewedAt: null,
      // Une nouvelle pièce a sa propre échéance : l'ancien rappel ne la couvre pas.
      expiryReminderAt: null,
    };

    const deposee = existante
      ? await db.organizationDocument.update({ where: { id: existante.id }, data: valeurs })
      : await db.organizationDocument.create({ data: { orgId, type: piece.type, ...valeurs } });

    logger.info("Merchant document uploaded", { orgId, type: piece.type });

    return deposee;
  }

  /** Retire une pièce du dossier. */
  static async retirerPiece(orgId: string, documentId: string) {
    const piece = await db.organizationDocument.findUnique({ where: { id: documentId } });

    if (!piece || piece.orgId !== orgId) {
      throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");
    }

    await db.organizationDocument.delete({ where: { id: documentId } });

    return piece;
  }

  /**
   * La plateforme statue sur une pièce.
   *
   * Sans cela le dossier resterait « en attente » pour toujours : une pièce
   * qu'on dépose et que personne ne peut examiner ne prouve rien.
   */
  static async examinerPiece(
    orgId: string,
    documentId: string,
    avis: { approuve: boolean; note?: string }
  ) {
    const piece = await db.organizationDocument.findUnique({ where: { id: documentId } });

    if (!piece || piece.orgId !== orgId) {
      throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");
    }

    // Un refus sans motif laisse le commerçant redéposer la même pièce à
    // l'aveugle : il doit lire ce qui n'allait pas.
    if (!avis.approuve && !avis.note?.trim()) {
      throw new ApiError(400, "Dites au commerçant ce qui ne va pas", "REASON_REQUIRED");
    }

    const examinee = await db.organizationDocument.update({
      where: { id: documentId },
      data: {
        status: avis.approuve ? "APPROVED" : "REJECTED",
        reviewNote: avis.note?.trim() || null,
        reviewedAt: new Date(),
      },
    });

    await this.prevenirLeCommercant(
      orgId,
      avis.approuve
        ? `${libelleDuDocumentCommercant(piece.type)} : votre document a été validé.`
        : `${libelleDuDocumentCommercant(piece.type)} : votre document a été refusé. ${avis.note?.trim()}`
    );

    return examinee;
  }

  /** Le dossier vu par la plateforme. */
  static async dossier(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!org) {
      throw new ApiError(404, "Organisation introuvable", "ORG_NOT_FOUND");
    }

    const profil = await this.profil(orgId);

    return {
      ...profil,
      piecesAExaminer: profil.documents.filter((piece) => piece.status === "PENDING").length,
    };
  }

  /**
   * Prévenir le commerçant dans le service, pas par courriel.
   *
   * Il consulte son espace : une notification l'y attend, là où il peut agir.
   */
  private static async prevenirLeCommercant(orgId: string, message: string) {
    const adhesions = await db.membership.findMany({
      where: { orgId },
      select: { user: { select: { email: true } } },
    });

    for (const adhesion of adhesions) {
      const email = adhesion.user?.email;
      if (!email) continue;

      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: "Votre dossier",
          message,
          recipientEmail: email,
          link: "/merchant/profil",
        },
      });

      emitNotification(email, notification);
    }
  }
}
