import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { emitNotification } from "../realtime/socket";
import { FileUploadService } from "../files/file-upload.service";
import { notifierPlateforme } from "../notifications/notification.service";

/**
 * L'inscription d'un chauffeur ZupDrive (licence LVC ou de transport rémunéré
 * de personnes), et sa validation par l'équipe ZupDrive.
 *
 * La procédure côté chauffeur est décrite dans docs/zupdrive.md : entreprise
 * inscrite à la BCE, véhicule assuré pour le transport rémunéré, licence
 * régionale, puis dépôt des pièces sur driver.zupdrive.com.
 *
 * Chauffeur ≠ livreur : le chauffeur transporte des personnes (ZupDrive),
 * le livreur livre des repas (ZupEat, modèle Driver, espace /driver). Ce
 * module ne concerne que les chauffeurs et n'a aucun lien avec les livreurs.
 *
 * Cycle de vie :
 *
 *   BROUILLON ──soumettre──▶ SOUMIS ──valider──▶ VALIDE ──suspendre──▶ SUSPENDU
 *       ▲                      │                   ▲                      │
 *       │                   refuser                └──────réactiver───────┘
 *       │                      ▼
 *       └────(corrige)──── REFUSE ──soumettre──▶ SOUMIS
 */

export const STATUTS_CHAUFFEUR = ["BROUILLON", "SOUMIS", "VALIDE", "REFUSE", "SUSPENDU"] as const;
export type StatutChauffeur = (typeof STATUTS_CHAUFFEUR)[number];

export const REGIONS = ["BRUXELLES", "WALLONIE", "FLANDRE"] as const;
export type Region = (typeof REGIONS)[number];

/** Les pièces qu'un chauffeur peut déposer. */
export const TYPES_PIECE = [
  "identite",
  "permis",
  "tva",
  "licence",
  "controle_technique",
  "assurance",
  "immatriculation",
  "bestuurderspas",
  "casier_judiciaire",
  "actionnaires",
] as const;
export type TypePiece = (typeof TYPES_PIECE)[number];

const LIBELLES_PIECE: Record<TypePiece, string> = {
  identite: "Carte d'identité",
  permis: "Permis de conduire avec sélection médicale",
  tva: "Attestation du numéro de TVA",
  licence: "Licence LVC / vergunning individueel bezoldigd personenvervoer",
  controle_technique: "Contrôle technique",
  assurance: "Assurance transport rémunéré de personnes",
  immatriculation: "Certificat d'immatriculation (recto et verso)",
  bestuurderspas: "Bestuurderspas",
  casier_judiciaire: "Extrait de casier judiciaire",
  actionnaires: "Identité des personnes détenant des parts de la société",
};

export const libelleDeLaPiece = (type: string) => LIBELLES_PIECE[type as TypePiece] || type;

/**
 * Les pièces exigées selon la région de la licence.
 *
 * Le bestuurderspas n'existe qu'en Flandre, l'extrait de casier judiciaire
 * n'est demandé qu'à Bruxelles. L'identité des associés reste facultative :
 * elle ne concerne que les chauffeurs installés en société.
 */
export function piecesExigees(region: string | null | undefined): TypePiece[] {
  const communes: TypePiece[] = [
    "identite",
    "permis",
    "tva",
    "licence",
    "controle_technique",
    "assurance",
    "immatriculation",
  ];
  if (region === "FLANDRE") return [...communes, "bestuurderspas"];
  if (region === "BRUXELLES") return [...communes, "casier_judiciaire"];
  return communes;
}

/**
 * Le numéro d'entreprise BCE, réduit à ses 10 chiffres, ou `null` s'il n'est
 * pas valable. Contrôle officiel : les deux derniers chiffres valent
 * 97 − (les huit premiers modulo 97). Accepte « BE0123.456.749 » ou
 * « 0123 456 749 ».
 */
export function numeroBceNormalise(saisie: string): string | null {
  const chiffres = saisie.replace(/^BE/i, "").replace(/[\s.\-]/g, "");
  if (!/^[01]\d{9}$/.test(chiffres)) return null;
  const base = Number(chiffres.slice(0, 8));
  const controle = Number(chiffres.slice(8));
  return 97 - (base % 97) === controle ? chiffres : null;
}

/** Le numéro de TVA belge d'une entreprise : « BE » suivi du numéro BCE. */
export const numeroTva = (numeroEntreprise: string | null | undefined) =>
  numeroEntreprise ? `BE${numeroEntreprise}` : null;

/** Plaque en majuscules, sans espaces ni tirets : « t-xaa-123 » → « TXAA123 ». */
export const plaqueNormalisee = (plaque: string) => plaque.toUpperCase().replace(/[\s\-.]/g, "");

/** Les champs du profil que le chauffeur remplit lui-même. */
export interface ProfilChauffeur {
  nomComplet?: string;
  telephone?: string | null;
  region?: Region | null;
  numeroEntreprise?: string | null;
  raisonSociale?: string | null;
  numeroLicence?: string | null;
  vehiculeMarque?: string | null;
  vehiculeModele?: string | null;
  vehiculePlaque?: string | null;
}

/** Les champs du profil exigés pour soumettre, avec leur libellé. */
const CHAMPS_EXIGES: [keyof ProfilChauffeur, string][] = [
  ["telephone", "téléphone"],
  ["region", "région de la licence"],
  ["numeroEntreprise", "numéro d'entreprise (BCE)"],
  ["numeroLicence", "numéro de licence"],
  ["vehiculeMarque", "marque du véhicule"],
  ["vehiculeModele", "modèle du véhicule"],
  ["vehiculePlaque", "plaque d'immatriculation"],
];

/** Le chauffeur peut encore modifier son dossier dans ces états. */
const MODIFIABLE: StatutChauffeur[] = ["BROUILLON", "REFUSE"];

type Dossier = NonNullable<Awaited<ReturnType<typeof lireDossier>>>;

function lireDossier(where: { id: string } | { userId: string }) {
  return db.chauffeurDrive.findUnique({
    where: where as any,
    include: { documents: { orderBy: { createdAt: "asc" } } },
  });
}

/** Ce qui manque encore au dossier, pour le chauffeur comme pour l'équipe. */
function etatDuDossier(dossier: Dossier) {
  const exigees = piecesExigees(dossier.region);
  const deposees = new Set(
    dossier.documents.filter((piece) => piece.statut !== "EXPIRED").map((piece) => piece.type)
  );
  const validees = new Set(
    dossier.documents.filter((piece) => piece.statut === "APPROVED").map((piece) => piece.type)
  );
  const champsManquants = CHAMPS_EXIGES.filter(([champ]) => !dossier[champ]).map(([, libelle]) => libelle);

  return {
    numeroTva: numeroTva(dossier.numeroEntreprise),
    piecesExigees: exigees,
    piecesManquantes: exigees.filter((type) => !deposees.has(type)),
    piecesAValider: exigees.filter((type) => !validees.has(type)),
    champsManquants,
    peutSoumettre:
      MODIFIABLE.includes(dossier.statut as StatutChauffeur) &&
      champsManquants.length === 0 &&
      exigees.every((type) => deposees.has(type)),
    dossierValidable: exigees.every((type) => validees.has(type)),
  };
}

export class ChauffeurOnboardingService {
  /** Le dossier du compte connecté, ou `null` s'il n'a pas commencé. */
  static async monDossier(userId: string) {
    const dossier = await lireDossier({ userId });
    return dossier ? { ...dossier, ...etatDuDossier(dossier) } : null;
  }

  /** Un dossier par son identifiant, pour l'équipe ZupDrive. */
  static async dossier(chauffeurId: string) {
    const dossier = await lireDossier({ id: chauffeurId });
    if (!dossier) throw new ApiError(404, "Chauffeur introuvable", "CHAUFFEUR_NOT_FOUND");
    return { ...dossier, ...etatDuDossier(dossier) };
  }

  /**
   * Ouvre le dossier du compte. Rejouer la requête (double clic, retry
   * mobile) rend le dossier déjà ouvert au lieu d'en créer un second.
   */
  static async commencer(userId: string, profil: ProfilChauffeur) {
    const existant = await db.chauffeurDrive.findUnique({ where: { userId }, select: { id: true } });
    if (existant) return this.modifier(userId, profil);

    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
    const nomComplet = profil.nomComplet?.trim() || user?.name?.trim();
    if (!nomComplet) throw new ApiError(400, "Indiquez votre nom complet", "MISSING_NAME");

    try {
      await db.chauffeurDrive.create({
        data: { userId, ...this.donneesDuProfil(profil), nomComplet },
      });
    } catch (err: any) {
      // Deux requêtes simultanées : la seconde retombe sur le dossier créé.
      if (err?.code !== "P2002") throw err;
    }

    logger.info("ZupDrive chauffeur dossier opened", { userId });
    return this.monDossier(userId);
  }

  /** Met à jour le profil, tant que le dossier n'est pas en examen. */
  static async modifier(userId: string, profil: ProfilChauffeur) {
    const dossier = await this.dossierModifiable(userId);

    await db.chauffeurDrive.update({
      where: { id: dossier.id },
      data: this.donneesDuProfil(profil),
    });

    return this.monDossier(userId);
  }

  /**
   * Dépose une pièce. Redéposer le même type remplace l'ancienne, qui repart
   * en examen.
   *
   * Un chauffeur validé peut renouveler une pièce (assurance, contrôle
   * technique) sans repasser tout le dossier : elle attend l'examen, son
   * compte reste validé. Un dossier en examen ou suspendu est figé.
   */
  static async deposerPiece(
    userId: string,
    piece: { type: TypePiece; file: Buffer; mimeType?: string; dateExpiration?: string | null }
  ) {
    const dossier = await lireDossier({ userId });
    if (!dossier) {
      throw new ApiError(404, "Commencez par ouvrir votre dossier chauffeur", "CHAUFFEUR_NOT_FOUND");
    }
    // Suspendu parce qu'une pièce a expiré : c'est justement la pièce à jour
    // qu'on attend de lui. Une suspension décidée par l'équipe, elle, fige
    // le dossier.
    const suspenduPourExpiration = dossier.statut === "SUSPENDU" && !!dossier.suspenduPourExpirationLe;
    if (![...MODIFIABLE, "VALIDE"].includes(dossier.statut) && !suspenduPourExpiration) {
      throw new ApiError(
        409,
        dossier.statut === "SOUMIS"
          ? "Votre dossier est en cours d'examen : attendez la réponse de l'équipe ZupDrive"
          : "Votre compte chauffeur est suspendu",
        "DOSSIER_LOCKED"
      );
    }

    const expiration = piece.dateExpiration ? new Date(piece.dateExpiration) : null;
    if (expiration && Number.isNaN(expiration.getTime())) {
      throw new ApiError(400, "Date d'expiration invalide", "INVALID_EXPIRY_DATE");
    }
    if (expiration && expiration.getTime() < Date.now()) {
      throw new ApiError(
        400,
        `${libelleDeLaPiece(piece.type)} : ce document est déjà expiré.`,
        "DOCUMENT_EXPIRED"
      );
    }

    const { url } = await FileUploadService.uploadDocument(
      piece.file,
      `chauffeur-${dossier.id}-${piece.type}-${Date.now()}`,
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

    const deposee = await db.documentChauffeurDrive.upsert({
      where: { chauffeurId_type: { chauffeurId: dossier.id, type: piece.type } },
      create: { chauffeurId: dossier.id, type: piece.type, ...valeurs },
      update: valeurs,
    });

    logger.info("ZupDrive chauffeur document uploaded", { chauffeurId: dossier.id, type: piece.type });

    if (dossier.statut === "VALIDE" || suspenduPourExpiration) {
      await notifierPlateforme(
        `Pièce renouvelée — chauffeur ${dossier.nomComplet}${suspenduPourExpiration ? " (suspendu)" : ""}`,
        `${libelleDeLaPiece(piece.type)} attend votre validation.`,
        `/superowner/zupdrive/chauffeurs/${dossier.id}`
      );
    }

    return deposee;
  }

  /**
   * Envoie le dossier à l'équipe ZupDrive. Il doit être complet : profil
   * rempli et toutes les pièces exigées déposées. Rejouer la soumission d'un
   * dossier déjà soumis ne fait rien de plus.
   */
  static async soumettre(userId: string) {
    const dossier = await lireDossier({ userId });
    if (!dossier) {
      throw new ApiError(404, "Commencez par ouvrir votre dossier chauffeur", "CHAUFFEUR_NOT_FOUND");
    }
    if (dossier.statut === "SOUMIS") return this.monDossier(userId);

    const etat = etatDuDossier(dossier);

    if (!MODIFIABLE.includes(dossier.statut as StatutChauffeur)) {
      throw new ApiError(409, "Ce dossier ne peut pas être soumis dans son état actuel", "INVALID_STATUS");
    }
    if (!etat.peutSoumettre) {
      const manque = [...etat.champsManquants, ...etat.piecesManquantes.map(libelleDeLaPiece)];
      throw new ApiError(400, `Dossier incomplet : ${manque.join(", ")}.`, "INCOMPLETE_FILE");
    }

    // Conditionné à l'état lu : deux soumissions simultanées n'en font qu'une.
    const { count } = await db.chauffeurDrive.updateMany({
      where: { id: dossier.id, statut: dossier.statut },
      data: { statut: "SOUMIS", soumisLe: new Date(), motifStatut: null },
    });

    if (count === 1) {
      logger.info("ZupDrive chauffeur dossier submitted", { chauffeurId: dossier.id });
      await notifierPlateforme(
        `Nouveau dossier chauffeur — ${dossier.nomComplet}`,
        "Un dossier ZupDrive complet attend votre examen.",
        `/superowner/zupdrive/chauffeurs/${dossier.id}`
      );
    }

    return this.monDossier(userId);
  }

  // -------------------------------------------------------------------------
  // Équipe ZupDrive
  // -------------------------------------------------------------------------

  /** L'équipe statue sur une pièce. Un refus dit toujours quoi corriger. */
  static async examinerPiece(
    chauffeurId: string,
    documentId: string,
    verdict: { approuve: boolean; note?: string }
  ) {
    const piece = await db.documentChauffeurDrive.findUnique({ where: { id: documentId } });

    if (!piece || piece.chauffeurId !== chauffeurId) {
      throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");
    }
    if (!verdict.approuve && !verdict.note?.trim()) {
      throw new ApiError(400, "Un refus sans motif ne dit pas au chauffeur quoi corriger", "MISSING_REASON");
    }

    const examinee = await db.documentChauffeurDrive.update({
      where: { id: documentId },
      data: {
        statut: verdict.approuve ? "APPROVED" : "REJECTED",
        noteExamen: verdict.note?.trim() || null,
        examineLe: new Date(),
      },
    });

    await this.prevenir(
      chauffeurId,
      verdict.approuve
        ? `${libelleDeLaPiece(piece.type)} validée`
        : `${libelleDeLaPiece(piece.type)} refusée`,
      verdict.approuve ? "Votre pièce a été acceptée." : `Motif : ${verdict.note!.trim()}.`
    );

    const retabli = verdict.approuve ? await this.retablirApresRenouvellement(chauffeurId) : false;

    return { avant: piece, piece: examinee, retabli };
  }

  /** Valide un dossier soumis dont toutes les pièces exigées sont validées. */
  static async valider(chauffeurId: string, adminId: string) {
    const dossier = await this.dossier(chauffeurId);

    if (dossier.statut !== "SOUMIS") {
      throw new ApiError(409, "Seul un dossier soumis peut être validé", "INVALID_STATUS");
    }
    if (!dossier.dossierValidable) {
      throw new ApiError(
        400,
        `Dossier incomplet : ${dossier.piecesAValider.map(libelleDeLaPiece).join(", ")} à valider.`,
        "INCOMPLETE_FILE"
      );
    }

    return this.changerStatut(dossier, ["SOUMIS"], {
      statut: "VALIDE",
      motifStatut: null,
      valideLe: new Date(),
      validePar: adminId,
    }, "Votre dossier chauffeur ZupDrive est validé", "Bienvenue sur ZupDrive !");
  }

  /** Renvoie un dossier soumis au chauffeur, avec ce qu'il doit corriger. */
  static async refuser(chauffeurId: string, motif: string) {
    const dossier = await this.dossier(chauffeurId);
    return this.changerStatut(
      dossier,
      ["SOUMIS"],
      { statut: "REFUSE", motifStatut: this.motifExige(motif) },
      "Votre dossier chauffeur doit être complété",
      motif.trim()
    );
  }

  /** Suspend un chauffeur validé. */
  static async suspendre(chauffeurId: string, motif: string) {
    const dossier = await this.dossier(chauffeurId);
    return this.changerStatut(
      dossier,
      ["VALIDE"],
      // Décidée par l'équipe : un simple dépôt ne la lèvera pas.
      { statut: "SUSPENDU", motifStatut: this.motifExige(motif), suspenduPourExpirationLe: null },
      "Votre compte chauffeur ZupDrive est suspendu",
      motif.trim()
    );
  }

  /** Rétablit un chauffeur suspendu, sans repasser par le dossier. */
  static async reactiver(chauffeurId: string) {
    const dossier = await this.dossier(chauffeurId);
    return this.changerStatut(
      dossier,
      ["SUSPENDU"],
      { statut: "VALIDE", motifStatut: null, suspenduPourExpirationLe: null },
      "Votre compte chauffeur ZupDrive est rétabli",
      "Vous pouvez de nouveau exercer via ZupDrive."
    );
  }

  /**
   * Un chauffeur suspendu parce qu'une pièce a expiré reprend la route dès
   * que toutes ses pièces exigées sont de nouveau validées par l'équipe. Une
   * suspension décidée par l'équipe n'est jamais levée ainsi.
   */
  private static async retablirApresRenouvellement(chauffeurId: string): Promise<boolean> {
    const dossier = await this.dossier(chauffeurId);
    if (dossier.statut !== "SUSPENDU" || !dossier.suspenduPourExpirationLe || !dossier.dossierValidable) {
      return false;
    }

    const { count } = await db.chauffeurDrive.updateMany({
      where: { id: chauffeurId, statut: "SUSPENDU", suspenduPourExpirationLe: { not: null } },
      data: { statut: "VALIDE", motifStatut: null, suspenduPourExpirationLe: null },
    });
    if (count !== 1) return false;

    logger.info("ZupDrive chauffeur reinstated after renewal", { chauffeurId });
    await this.prevenir(
      chauffeurId,
      "Votre compte chauffeur ZupDrive est rétabli",
      "Vos documents sont de nouveau à jour : vous pouvez reprendre vos courses."
    );
    return true;
  }

  // -------------------------------------------------------------------------

  private static motifExige(motif: string) {
    if (!motif?.trim()) throw new ApiError(400, "Dites au chauffeur pourquoi", "MISSING_REASON");
    return motif.trim();
  }

  /**
   * Applique une transition, seulement depuis les états permis. La condition
   * porte sur l'écriture elle-même : deux membres de l'équipe qui agissent en
   * même temps ne font pas passer le dossier par deux états.
   */
  private static async changerStatut(
    dossier: Dossier,
    depuis: StatutChauffeur[],
    data: Record<string, unknown>,
    titre: string,
    message: string
  ) {
    const { count } = await db.chauffeurDrive.updateMany({
      where: { id: dossier.id, statut: { in: depuis } },
      data,
    });
    if (count !== 1) {
      throw new ApiError(409, "Le dossier a changé d'état entre-temps, rechargez-le", "INVALID_STATUS");
    }

    logger.info("ZupDrive chauffeur status changed", {
      chauffeurId: dossier.id,
      de: dossier.statut,
      vers: data.statut,
    });

    await this.prevenir(dossier.id, titre, message);

    return { avant: dossier.statut, dossier: await this.dossier(dossier.id) };
  }

  private static dossierModifiable = async (userId: string) => {
    const dossier = await db.chauffeurDrive.findUnique({ where: { userId } });
    if (!dossier) {
      throw new ApiError(404, "Commencez par ouvrir votre dossier chauffeur", "CHAUFFEUR_NOT_FOUND");
    }
    if (!MODIFIABLE.includes(dossier.statut as StatutChauffeur)) {
      throw new ApiError(
        409,
        dossier.statut === "SOUMIS"
          ? "Votre dossier est en cours d'examen : il ne peut plus être modifié"
          : "Votre dossier ne peut plus être modifié : contactez le support ZupDrive",
        "DOSSIER_LOCKED"
      );
    }
    return dossier;
  };

  /** Les champs du profil, normalisés et vérifiés. */
  private static donneesDuProfil(profil: ProfilChauffeur) {
    const data: Record<string, string | null> = {};
    const texte = (valeur: string | null | undefined) => (valeur?.trim() ? valeur.trim() : null);

    if (profil.nomComplet !== undefined) {
      if (!profil.nomComplet.trim()) throw new ApiError(400, "Indiquez votre nom complet", "MISSING_NAME");
      data.nomComplet = profil.nomComplet.trim();
    }
    for (const champ of ["telephone", "raisonSociale", "numeroLicence", "vehiculeMarque", "vehiculeModele"] as const) {
      if (profil[champ] !== undefined) data[champ] = texte(profil[champ]);
    }
    if (profil.region !== undefined) data.region = profil.region;
    if (profil.numeroEntreprise !== undefined) {
      if (texte(profil.numeroEntreprise)) {
        const bce = numeroBceNormalise(profil.numeroEntreprise!);
        if (!bce) {
          throw new ApiError(400, "Numéro d'entreprise (BCE) invalide", "INVALID_BCE_NUMBER");
        }
        data.numeroEntreprise = bce;
      } else {
        data.numeroEntreprise = null;
      }
    }
    if (profil.vehiculePlaque !== undefined) {
      data.vehiculePlaque = texte(profil.vehiculePlaque) ? plaqueNormalisee(profil.vehiculePlaque!) : null;
    }
    return data;
  }

  /**
   * Prévient le chauffeur. La décision est déjà enregistrée : un échec
   * d'envoi ne la défait pas.
   */
  private static async prevenir(chauffeurId: string, titre: string, message: string) {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { id: chauffeurId },
        select: { user: { select: { email: true } } },
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
        },
      });
      emitNotification(email, notification);
    } catch (err) {
      logger.warn("ZupDrive chauffeur notification failed", { chauffeurId, err });
    }
  }
}
