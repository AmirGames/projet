import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { getEnv } from "../../config/env";
import { emitNotification } from "../realtime/socket";
import { EmailService } from "../notifications/email.service";
import { notifierPlateforme } from "../notifications/notification.service";
import {
  ChauffeurOnboardingService,
  TYPES_PIECE_SOCIETE,
  TYPES_PIECE_VEHICULE,
  libelleDeLaPiece,
  numeroBceNormalise,
  numeroTva,
  piecesExigeesSociete,
  piecesExigeesVehicule,
  plaqueNormalisee,
  type Region,
  type TypePiece,
} from "./chauffeur-onboarding.service";
import { STATUTS_AVEC_CHAUFFEUR } from "./course-drive.service";
import { deposerVersion, examinerVersion, type Proprietaire } from "./pieces-drive";

/**
 * Les sociétés ZupDrive (taxi, VTC) : elles détiennent les licences et les
 * véhicules, et leurs chauffeurs roulent pour elles.
 *
 *   - Le gérant (un compte ZupOne, une société par gérant) ouvre le dossier
 *     de la société, ajoute ses véhicules avec leurs pièces et invite ses
 *     chauffeurs par e-mail.
 *   - L'équipe ZupDrive valide la société (même cycle qu'un dossier
 *     chauffeur) et chaque pièce ; un véhicule est « conforme » quand toutes
 *     ses pièces exigées sont validées et en cours de validité.
 *   - Le chauffeur accepte l'invitation (personne n'est rattaché sans son
 *     accord), une société à la fois. Son dossier se réduit à ce qui le
 *     concerne personnellement (voir piecesExigees).
 *   - Un chauffeur de société ne roule que si son dossier, sa société et le
 *     véhicule qu'elle lui attribue sont en règle (CourseDriveService). Ses
 *     courses portent la société et le véhicule, figés à l'acceptation.
 *
 * Cloisonnement : les méthodes du gérant partent toujours de SA société (par
 * son compte), jamais d'un identifiant de société fourni par le client. Un
 * véhicule, un chauffeur ou une invitation d'une autre société répond 404.
 */

export const STATUTS_SOCIETE = ["BROUILLON", "SOUMIS", "VALIDE", "REFUSE", "SUSPENDU"] as const;
export type StatutSociete = (typeof STATUTS_SOCIETE)[number];

/** La société peut encore modifier son dossier dans ces états. */
const MODIFIABLE: StatutSociete[] = ["BROUILLON", "REFUSE"];

/** Garde-fou contre l'envoi d'invitations en masse. */
export const INVITATIONS_EN_ATTENTE_MAX = 50;

export interface ProfilSociete {
  raisonSociale?: string;
  numeroEntreprise?: string | null;
  region?: Region | null;
  telephone?: string | null;
}

export interface SaisieVehicule {
  marque?: string;
  modele?: string;
  plaque?: string;
  numeroLicence?: string | null;
}

const CHAMPS_EXIGES: [keyof ProfilSociete, string][] = [
  ["raisonSociale", "raison sociale"],
  ["numeroEntreprise", "numéro d'entreprise (BCE)"],
  ["region", "région des licences"],
  ["telephone", "téléphone"],
];

type Piece = { id: string; type: string; statut: string; dateExpiration: Date | null };

const texte = (valeur: string | null | undefined) => (valeur?.trim() ? valeur.trim() : null);

function lireSociete(where: { id: string } | { gerantId: string }) {
  return db.societeDrive.findUnique({
    where: where as any,
    include: {
      // Les versions archivées ne comptent plus : historique seul.
      documents: { where: { archiveeLe: null }, orderBy: { createdAt: "asc" } },
      vehicules: {
        where: { retireLe: null },
        orderBy: { createdAt: "asc" },
        include: {
          documents: { where: { archiveeLe: null }, orderBy: { createdAt: "asc" } },
          chauffeur: { select: { id: true, nomComplet: true } },
        },
      },
      chauffeurs: {
        orderBy: { rattacheLe: "asc" },
        select: {
          id: true,
          nomComplet: true,
          telephone: true,
          statut: true,
          enLigne: true,
          vehiculeId: true,
          rattacheLe: true,
          user: { select: { email: true } },
        },
      },
      invitations: { where: { statut: "EN_ATTENTE" }, orderBy: { createdAt: "asc" } },
      gerant: { select: { email: true, name: true } },
    },
  });
}

type Societe = NonNullable<Awaited<ReturnType<typeof lireSociete>>>;

/** Les pièces exigées de ce dossier qui manquent, ou qui restent à valider. */
function etatDesPieces(exigees: TypePiece[], documents: Piece[]) {
  const deposees = new Set(documents.filter((p) => p.statut !== "EXPIRED").map((p) => p.type));
  const validees = new Set(documents.filter((p) => p.statut === "APPROVED").map((p) => p.type));
  return {
    piecesExigees: exigees,
    piecesManquantes: exigees.filter((type) => !deposees.has(type)),
    piecesAValider: exigees.filter((type) => !validees.has(type)),
  };
}

/** Un véhicule roule quand chaque pièce exigée a une version validée, en cours de validité. */
function vehiculeConforme(vehicule: { retireLe?: Date | null; documents: Piece[] }, maintenant = new Date()) {
  if (vehicule.retireLe) return false;
  return piecesExigeesVehicule().every((type) =>
    vehicule.documents.some(
      (p) => p.type === type && p.statut === "APPROVED" && (!p.dateExpiration || p.dateExpiration > maintenant)
    )
  );
}

function etatDeLaSociete(societe: Societe) {
  const champsManquants = CHAMPS_EXIGES.filter(([champ]) => !societe[champ]).map(([, libelle]) => libelle);
  const pieces = etatDesPieces(piecesExigeesSociete(), societe.documents);
  return {
    numeroTva: numeroTva(societe.numeroEntreprise),
    ...pieces,
    champsManquants,
    peutSoumettre:
      MODIFIABLE.includes(societe.statut as StatutSociete) &&
      champsManquants.length === 0 &&
      pieces.piecesManquantes.length === 0,
    dossierValidable: pieces.piecesAValider.length === 0,
    vehicules: societe.vehicules.map((vehicule) => ({
      ...vehicule,
      ...etatDesPieces(piecesExigeesVehicule(), vehicule.documents),
    })),
  };
}

export class SocieteDriveService {
  // -------------------------------------------------------------------------
  // Gérant : la société
  // -------------------------------------------------------------------------

  /** La société dont ce compte est le gérant, ou `null`. */
  static async maSociete(userId: string) {
    const societe = await lireSociete({ gerantId: userId });
    return societe ? { ...societe, ...etatDeLaSociete(societe) } : null;
  }

  /** Une société par son identifiant, pour l'équipe ZupDrive. */
  static async societe(societeId: string) {
    const societe = await lireSociete({ id: societeId });
    if (!societe) throw new ApiError(404, "Société introuvable", "SOCIETE_NOT_FOUND");
    return { ...societe, ...etatDeLaSociete(societe) };
  }

  /**
   * Ouvre le dossier de la société du compte. Rejouer la requête rend le
   * dossier déjà ouvert au lieu d'en créer un second.
   */
  static async creer(userId: string, profil: ProfilSociete) {
    const existante = await db.societeDrive.findUnique({ where: { gerantId: userId }, select: { id: true } });
    if (existante) return this.modifier(userId, profil);

    const raisonSociale = texte(profil.raisonSociale);
    if (!raisonSociale) throw new ApiError(400, "Indiquez la raison sociale", "MISSING_NAME");

    try {
      await db.societeDrive.create({
        data: { gerantId: userId, ...this.donneesDuProfil(profil), raisonSociale },
      });
    } catch (err) {
      this.doublon(err);
      // Deux requêtes simultanées : la seconde retombe sur le dossier créé.
    }

    logger.info("ZupDrive société opened", { userId });
    return this.maSociete(userId);
  }

  /** Met à jour le profil, tant que le dossier n'est pas en examen. */
  static async modifier(userId: string, profil: ProfilSociete) {
    const societe = await this.societeDuGerant(userId);
    if (!MODIFIABLE.includes(societe.statut as StatutSociete)) {
      throw new ApiError(
        409,
        societe.statut === "SOUMIS"
          ? "Le dossier de la société est en cours d'examen : il ne peut plus être modifié"
          : "Le dossier de la société ne peut plus être modifié : contactez le support ZupDrive",
        "DOSSIER_LOCKED"
      );
    }

    const data = this.donneesDuProfil(profil);
    try {
      await db.$transaction([
        db.societeDrive.update({ where: { id: societe.id }, data }),
        // Les chauffeurs roulent dans la région des licences de leur société.
        ...(data.region !== undefined
          ? [db.chauffeurDrive.updateMany({ where: { societeId: societe.id }, data: { region: data.region } })]
          : []),
      ]);
    } catch (err) {
      this.doublon(err);
      throw err;
    }
    return this.maSociete(userId);
  }

  /** Une pièce de la société (TVA, associés). */
  static async deposerPiece(
    userId: string,
    piece: { type: TypePiece; file: Buffer; mimeType?: string; dateExpiration?: string | null }
  ) {
    const societe = await this.societeDuGerant(userId);
    if (!TYPES_PIECE_SOCIETE.includes(piece.type)) {
      throw new ApiError(400, `${libelleDeLaPiece(piece.type)} n'est pas une pièce de la société`, "INVALID_DOCUMENT_TYPE");
    }
    // Une société validée renouvelle ses pièces sans repasser son dossier ;
    // en examen ou suspendue, son dossier est figé.
    if (![...MODIFIABLE, "VALIDE"].includes(societe.statut)) {
      throw new ApiError(
        409,
        societe.statut === "SOUMIS"
          ? "Le dossier est en cours d'examen : attendez la réponse de l'équipe ZupDrive"
          : "La société est suspendue",
        "DOSSIER_LOCKED"
      );
    }

    const existantes = await db.documentChauffeurDrive.findMany({
      where: { societeId: societe.id, archiveeLe: null },
      select: { id: true, type: true, statut: true },
      orderBy: { createdAt: "asc" },
    });
    const deposee = await deposerVersion({ societeId: societe.id }, piece, existantes, `societe-${societe.id}`);
    logger.info("ZupDrive société document uploaded", { societeId: societe.id, type: piece.type });

    if (societe.statut === "VALIDE") {
      await notifierPlateforme(
        `Pièce renouvelée — société ${societe.raisonSociale}`,
        `${libelleDeLaPiece(piece.type)} attend votre validation.`,
        `/superowner/zupdrive/societes/${societe.id}`
      );
    }
    return deposee;
  }

  /** Envoie le dossier de la société à l'équipe ZupDrive, complet. */
  static async soumettre(userId: string) {
    const societe = await lireSociete({ gerantId: userId });
    if (!societe) throw this.pasDeSociete();
    if (societe.statut === "SOUMIS") return this.maSociete(userId);

    const etat = etatDeLaSociete(societe);
    if (!MODIFIABLE.includes(societe.statut as StatutSociete)) {
      throw new ApiError(409, "Ce dossier ne peut pas être soumis dans son état actuel", "INVALID_STATUS");
    }
    if (!etat.peutSoumettre) {
      const manque = [...etat.champsManquants, ...etat.piecesManquantes.map(libelleDeLaPiece)];
      throw new ApiError(400, `Dossier incomplet : ${manque.join(", ")}.`, "INCOMPLETE_FILE");
    }

    const { count } = await db.societeDrive.updateMany({
      where: { id: societe.id, statut: societe.statut },
      data: { statut: "SOUMIS", soumisLe: new Date(), motifStatut: null },
    });
    if (count === 1) {
      logger.info("ZupDrive société submitted", { societeId: societe.id });
      await notifierPlateforme(
        `Nouvelle société ZupDrive — ${societe.raisonSociale}`,
        "Le dossier d'une société attend votre examen.",
        `/superowner/zupdrive/societes/${societe.id}`
      );
    }
    return this.maSociete(userId);
  }

  // -------------------------------------------------------------------------
  // Gérant : les véhicules
  // -------------------------------------------------------------------------

  static async ajouterVehicule(userId: string, saisie: SaisieVehicule) {
    const societe = await this.societeDuGerant(userId);
    this.exigerNonSuspendue(societe);

    const marque = texte(saisie.marque);
    const modele = texte(saisie.modele);
    const plaque = saisie.plaque ? plaqueNormalisee(saisie.plaque) : "";
    if (!marque || !modele || !plaque) {
      throw new ApiError(400, "Indiquez la marque, le modèle et la plaque du véhicule", "MISSING_VEHICLE");
    }

    try {
      const vehicule = await db.vehiculeDrive.create({
        data: { societeId: societe.id, marque, modele, plaque, numeroLicence: texte(saisie.numeroLicence) },
      });
      logger.info("ZupDrive véhicule added", { societeId: societe.id, vehiculeId: vehicule.id });
      return vehicule;
    } catch (err) {
      this.doublon(err);
      throw err;
    }
  }

  /**
   * Corrige un véhicule tant qu'aucune de ses pièces n'est validée : une
   * pièce validée porte sur ce véhicule-là, pas sur un autre.
   */
  static async modifierVehicule(userId: string, vehiculeId: string, saisie: SaisieVehicule) {
    const societe = await this.societeDuGerant(userId);
    const vehicule = await this.vehiculeDeLaSociete(societe.id, vehiculeId);
    const validees = await db.documentChauffeurDrive.count({
      where: { vehiculeId: vehicule.id, statut: "APPROVED", archiveeLe: null },
    });
    if (validees > 0) {
      throw new ApiError(
        409,
        "Ce véhicule a déjà des pièces validées : ajoutez plutôt un nouveau véhicule",
        "VEHICLE_LOCKED"
      );
    }

    const data: Record<string, string | null> = {};
    if (saisie.marque !== undefined) data.marque = texte(saisie.marque) ?? vehicule.marque;
    if (saisie.modele !== undefined) data.modele = texte(saisie.modele) ?? vehicule.modele;
    if (saisie.plaque !== undefined && plaqueNormalisee(saisie.plaque)) data.plaque = plaqueNormalisee(saisie.plaque);
    if (saisie.numeroLicence !== undefined) data.numeroLicence = texte(saisie.numeroLicence);

    try {
      return await db.vehiculeDrive.update({ where: { id: vehicule.id }, data });
    } catch (err) {
      this.doublon(err);
      throw err;
    }
  }

  /**
   * Retire un véhicule (vendu, hors service). Il reste dans l'historique des
   * courses ; son chauffeur n'a plus de véhicule et passe hors ligne. Refusé
   * pendant une course.
   */
  static async retirerVehicule(userId: string, vehiculeId: string) {
    const societe = await this.societeDuGerant(userId);
    const vehicule = await this.vehiculeDeLaSociete(societe.id, vehiculeId);
    if (vehicule.chauffeur) await this.exigerSansCourse(vehicule.chauffeur.id, "Ce véhicule est en course");

    await db.$transaction([
      db.vehiculeDrive.update({ where: { id: vehicule.id }, data: { retireLe: new Date(), conforme: false } }),
      db.chauffeurDrive.updateMany({ where: { vehiculeId: vehicule.id }, data: { vehiculeId: null, enLigne: false } }),
    ]);
    logger.info("ZupDrive véhicule retired", { societeId: societe.id, vehiculeId: vehicule.id });
    return this.maSociete(userId);
  }

  static async deposerPieceVehicule(
    userId: string,
    vehiculeId: string,
    piece: { type: TypePiece; file: Buffer; mimeType?: string; dateExpiration?: string | null }
  ) {
    const societe = await this.societeDuGerant(userId);
    this.exigerNonSuspendue(societe);
    const vehicule = await this.vehiculeDeLaSociete(societe.id, vehiculeId);
    if (!TYPES_PIECE_VEHICULE.includes(piece.type)) {
      throw new ApiError(400, `${libelleDeLaPiece(piece.type)} n'est pas une pièce du véhicule`, "INVALID_DOCUMENT_TYPE");
    }

    const deposee = await deposerVersion(
      { vehiculeId: vehicule.id },
      piece,
      vehicule.documents,
      `vehicule-${vehicule.id}`
    );
    logger.info("ZupDrive véhicule document uploaded", { vehiculeId: vehicule.id, type: piece.type });

    // Tant que la société prépare son dossier, l'équipe examinera tout
    // ensemble à la soumission ; ensuite, chaque pièce se signale.
    if (!MODIFIABLE.includes(societe.statut as StatutSociete)) {
      await notifierPlateforme(
        `Pièce de véhicule — ${societe.raisonSociale} (${vehicule.plaque})`,
        `${libelleDeLaPiece(piece.type)} attend votre validation.`,
        `/superowner/zupdrive/societes/${societe.id}`
      );
    }
    return deposee;
  }

  // -------------------------------------------------------------------------
  // Gérant : les chauffeurs
  // -------------------------------------------------------------------------

  /**
   * Invite un chauffeur par son adresse e-mail. Inviter deux fois la même
   * adresse rend la même invitation. Le chauffeur accepte depuis son espace ;
   * sans compte ZupOne, il en crée un avec cette adresse.
   */
  static async inviter(userId: string, emailSaisi: string) {
    const societe = await this.societeDuGerant(userId);
    this.exigerNonSuspendue(societe);
    const email = emailSaisi.trim().toLowerCase();

    const dejaLa = await db.chauffeurDrive.count({ where: { societeId: societe.id, user: { email } } });
    if (dejaLa > 0) {
      throw new ApiError(409, "Ce chauffeur roule déjà pour votre société", "ALREADY_IN_COMPANY");
    }

    const existante = await db.invitationSocieteDrive.findFirst({
      where: { societeId: societe.id, email, statut: "EN_ATTENTE" },
    });
    if (existante) return existante;

    const enAttente = await db.invitationSocieteDrive.count({
      where: { societeId: societe.id, statut: "EN_ATTENTE" },
    });
    if (enAttente >= INVITATIONS_EN_ATTENTE_MAX) {
      throw new ApiError(
        409,
        `${INVITATIONS_EN_ATTENTE_MAX} invitations attendent déjà une réponse : annulez-en avant d'en envoyer d'autres`,
        "TOO_MANY_INVITATIONS"
      );
    }

    let invitation;
    try {
      invitation = await db.invitationSocieteDrive.create({ data: { societeId: societe.id, email } });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
      // Double clic : l'autre requête l'a créée.
      return db.invitationSocieteDrive.findFirstOrThrow({
        where: { societeId: societe.id, email, statut: "EN_ATTENTE" },
      });
    }

    logger.info("ZupDrive société invitation sent", { societeId: societe.id, invitationId: invitation.id });
    await this.prevenirCompte(
      email,
      `${societe.raisonSociale} vous invite sur ZupDrive`,
      "Une société vous invite à rouler pour elle. Acceptez ou refusez l'invitation depuis votre espace chauffeur.",
      { lien: "/chauffeur", courriel: true }
    );
    return invitation;
  }

  static async annulerInvitation(userId: string, invitationId: string) {
    const societe = await this.societeDuGerant(userId);
    const { count } = await db.invitationSocieteDrive.updateMany({
      where: { id: invitationId, societeId: societe.id, statut: "EN_ATTENTE" },
      data: { statut: "ANNULEE", reponduLe: new Date() },
    });
    if (count !== 1) throw new ApiError(404, "Invitation introuvable ou déjà traitée", "INVITATION_NOT_FOUND");
    return this.maSociete(userId);
  }

  /**
   * Attribue un véhicule de la société à l'un de ses chauffeurs (ou le lui
   * retire, `vehiculeId` nul). Un véhicule, un chauffeur. Pas pendant une
   * course. Le chauffeur passe hors ligne : il se remet en ligne avec son
   * nouveau véhicule.
   */
  static async attribuerVehicule(userId: string, chauffeurId: string, vehiculeId: string | null) {
    const societe = await this.societeDuGerant(userId);
    const chauffeur = await this.chauffeurDeLaSociete(societe.id, chauffeurId);
    if (vehiculeId) await this.vehiculeDeLaSociete(societe.id, vehiculeId);
    if (chauffeur.vehiculeId === vehiculeId) return this.maSociete(userId);
    await this.exigerSansCourse(chauffeur.id, "Ce chauffeur est en course");

    try {
      await db.chauffeurDrive.updateMany({
        where: { id: chauffeur.id, societeId: societe.id },
        data: { vehiculeId, enLigne: false },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ApiError(409, "Ce véhicule est déjà attribué à un autre chauffeur", "VEHICLE_TAKEN");
      }
      throw err;
    }
    logger.info("ZupDrive véhicule assigned", { societeId: societe.id, chauffeurId: chauffeur.id, vehiculeId });
    return this.maSociete(userId);
  }

  /** La société se sépare d'un chauffeur. */
  static async detacherChauffeur(userId: string, chauffeurId: string) {
    const societe = await this.societeDuGerant(userId);
    const chauffeur = await this.chauffeurDeLaSociete(societe.id, chauffeurId);
    await this.detacher(chauffeur.id, societe.id);
    await this.prevenirChauffeur(
      chauffeur.id,
      `Vous ne roulez plus pour ${societe.raisonSociale}`,
      "La société a mis fin à votre rattachement. Vous pouvez rejoindre une autre société, ou rouler en indépendant avec votre propre licence."
    );
    return this.maSociete(userId);
  }

  /** Les courses faites pour la société, les plus récentes d'abord. */
  static async courses(userId: string, page: { limit: number; offset: number }) {
    const societe = await this.societeDuGerant(userId);
    const where = { societeId: societe.id };
    const [courses, total] = await Promise.all([
      db.courseDrive.findMany({
        where,
        skip: page.offset,
        take: page.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          statut: true,
          region: true,
          departAdresse: true,
          arriveeAdresse: true,
          distanceMetres: true,
          prixCentimes: true,
          devise: true,
          createdAt: true,
          termineeLe: true,
          chauffeur: { select: { id: true, nomComplet: true } },
          vehicule: { select: { id: true, plaque: true } },
        },
      }),
      db.courseDrive.count({ where }),
    ]);
    return { courses, pagination: { total, ...page } };
  }

  // -------------------------------------------------------------------------
  // Chauffeur : les invitations reçues
  // -------------------------------------------------------------------------

  /** Les invitations en attente adressées à l'e-mail de ce compte. */
  static async invitationsDuCompte(userId: string) {
    const user = await this.comptePourInvitations(userId);
    if (!user) return [];
    return db.invitationSocieteDrive.findMany({
      where: { email: user.email.toLowerCase(), statut: "EN_ATTENTE" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        societe: { select: { id: true, raisonSociale: true, region: true, statut: true } },
      },
    });
  }

  /**
   * Le chauffeur accepte : il roule désormais pour cette société, et pour
   * elle seule. Sans dossier chauffeur, il en ouvre un. Refusé s'il est déjà
   * dans une société, suspendu, ou en course.
   */
  static async accepterInvitation(userId: string, invitationId: string) {
    const invitation = await this.invitationDuCompte(userId, invitationId);
    const societe = await db.societeDrive.findUnique({ where: { id: invitation.societeId } });
    if (!societe || societe.statut === "SUSPENDU") {
      throw new ApiError(409, "Cette société ne peut pas vous accueillir pour le moment", "COMPANY_UNAVAILABLE");
    }

    let chauffeur = await db.chauffeurDrive.findUnique({ where: { userId } });
    if (chauffeur?.societeId) {
      throw new ApiError(
        409,
        chauffeur.societeId === societe.id
          ? "Vous roulez déjà pour cette société"
          : "Vous roulez déjà pour une autre société : quittez-la d'abord",
        "ALREADY_IN_COMPANY"
      );
    }
    if (chauffeur?.statut === "SUSPENDU") {
      throw new ApiError(409, "Votre compte chauffeur est suspendu", "CHAUFFEUR_SUSPENDED");
    }
    if (chauffeur) await this.exigerSansCourse(chauffeur.id, "Terminez d'abord votre course en cours");
    if (!chauffeur) {
      await ChauffeurOnboardingService.commencer(userId, {});
      chauffeur = await db.chauffeurDrive.findUniqueOrThrow({ where: { userId } });
    }

    const maintenant = new Date();
    await db.$transaction(async (tx) => {
      const prise = await tx.invitationSocieteDrive.updateMany({
        where: { id: invitation.id, statut: "EN_ATTENTE" },
        data: { statut: "ACCEPTEE", reponduLe: maintenant },
      });
      if (prise.count !== 1) throw new ApiError(409, "Cette invitation n'est plus valable", "INVITATION_CLOSED");

      // Conditionné à « sans société » : deux acceptations simultanées ne
      // rattachent jamais à deux sociétés.
      const rattache = await tx.chauffeurDrive.updateMany({
        where: { id: chauffeur!.id, societeId: null },
        data: {
          societeId: societe.id,
          region: societe.region,
          vehiculeId: null,
          rattacheLe: maintenant,
          enLigne: false,
        },
      });
      if (rattache.count !== 1) {
        throw new ApiError(409, "Vous roulez déjà pour une société : quittez-la d'abord", "ALREADY_IN_COMPANY");
      }
    });

    logger.info("ZupDrive chauffeur joined société", { chauffeurId: chauffeur.id, societeId: societe.id });
    await this.ajusterStatutAuDossier(chauffeur.id, `Vous roulez désormais pour ${societe.raisonSociale}`);
    await this.prevenirGerant(
      societe.id,
      `${chauffeur.nomComplet} a rejoint votre société`,
      "Attribuez-lui un véhicule pour qu'il puisse rouler."
    );
    return ChauffeurOnboardingService.monDossier(userId);
  }

  static async refuserInvitation(userId: string, invitationId: string) {
    const invitation = await this.invitationDuCompte(userId, invitationId);
    const { count } = await db.invitationSocieteDrive.updateMany({
      where: { id: invitation.id, statut: "EN_ATTENTE" },
      data: { statut: "REFUSEE", reponduLe: new Date() },
    });
    if (count === 1) {
      await this.prevenirGerant(invitation.societeId, "Invitation refusée", `${invitation.email} a refusé votre invitation.`);
    }
    return this.invitationsDuCompte(userId);
  }

  /** Le chauffeur quitte sa société. */
  static async quitterSociete(userId: string) {
    const chauffeur = await db.chauffeurDrive.findUnique({ where: { userId } });
    if (!chauffeur?.societeId) throw new ApiError(409, "Vous ne roulez pour aucune société", "NOT_IN_COMPANY");
    await this.detacher(chauffeur.id, chauffeur.societeId);
    await this.prevenirGerant(
      chauffeur.societeId,
      `${chauffeur.nomComplet} a quitté votre société`,
      "Son véhicule est de nouveau libre."
    );
    return ChauffeurOnboardingService.monDossier(userId);
  }

  // -------------------------------------------------------------------------
  // Équipe ZupDrive
  // -------------------------------------------------------------------------

  /** L'équipe statue sur une pièce de la société ou de l'un de ses véhicules. */
  static async examinerPiece(societeId: string, documentId: string, verdict: { approuve: boolean; note?: string }) {
    const piece = await db.documentChauffeurDrive.findUnique({
      where: { id: documentId },
      include: { vehicule: { select: { id: true, societeId: true, plaque: true } } },
    });
    const appartient = piece && !piece.archiveeLe && (piece.societeId === societeId || piece.vehicule?.societeId === societeId);
    if (!piece || !appartient) throw new ApiError(404, "Document introuvable", "DOCUMENT_NOT_FOUND");

    const proprietaire: Proprietaire = piece.vehiculeId ? { vehiculeId: piece.vehiculeId } : { societeId };
    const examinee = await examinerVersion(piece, proprietaire, verdict, "Un refus sans motif ne dit pas à la société quoi corriger");

    const objet = piece.vehicule ? `${libelleDeLaPiece(piece.type)} (${piece.vehicule.plaque})` : libelleDeLaPiece(piece.type);
    await this.prevenirGerant(
      societeId,
      verdict.approuve ? `${objet} validée` : `${objet} refusée`,
      verdict.approuve ? "La pièce a été acceptée." : `Motif : ${verdict.note!.trim()}.`
    );

    const vehicule = piece.vehiculeId ? await this.recalculerVehicule(piece.vehiculeId) : null;
    return { avant: piece, piece: examinee, vehicule };
  }

  /** Valide une société soumise dont les pièces exigées sont validées. */
  static async valider(societeId: string, adminId: string) {
    const societe = await this.societe(societeId);
    if (societe.statut !== "SOUMIS") {
      throw new ApiError(409, "Seul un dossier soumis peut être validé", "INVALID_STATUS");
    }
    if (!societe.dossierValidable) {
      throw new ApiError(
        400,
        `Dossier incomplet : ${societe.piecesAValider.map(libelleDeLaPiece).join(", ")} à valider.`,
        "INCOMPLETE_FILE"
      );
    }
    return this.changerStatut(
      societe,
      ["SOUMIS"],
      { statut: "VALIDE", motifStatut: null, valideLe: new Date(), validePar: adminId },
      "Votre société est validée sur ZupDrive",
      "Vos chauffeurs peuvent rouler dès que leur dossier et leur véhicule sont en règle."
    );
  }

  static async refuser(societeId: string, motif: string) {
    const societe = await this.societe(societeId);
    return this.changerStatut(
      societe,
      ["SOUMIS"],
      { statut: "REFUSE", motifStatut: this.motifExige(motif) },
      "Le dossier de votre société doit être complété",
      motif.trim()
    );
  }

  /** Suspend une société validée : aucun de ses chauffeurs ne roule plus. */
  static async suspendre(societeId: string, motif: string) {
    const societe = await this.societe(societeId);
    const resultat = await this.changerStatut(
      societe,
      ["VALIDE"],
      { statut: "SUSPENDU", motifStatut: this.motifExige(motif) },
      "Votre société est suspendue sur ZupDrive",
      motif.trim()
    );
    await db.chauffeurDrive.updateMany({ where: { societeId }, data: { enLigne: false } });
    return resultat;
  }

  static async reactiver(societeId: string) {
    const societe = await this.societe(societeId);
    return this.changerStatut(
      societe,
      ["SUSPENDU"],
      { statut: "VALIDE", motifStatut: null },
      "Votre société est rétablie sur ZupDrive",
      "Vos chauffeurs peuvent de nouveau rouler."
    );
  }

  // -------------------------------------------------------------------------
  // Conformité des véhicules
  // -------------------------------------------------------------------------

  /**
   * Recalcule la conformité d'un véhicule d'après ses pièces en base. Appelé
   * après chaque examen et chaque expiration : jamais une saisie. Un véhicule
   * qui cesse d'être conforme met son chauffeur hors ligne. Idempotent :
   * l'écriture est conditionnée à l'ancienne valeur.
   */
  static async recalculerVehicule(vehiculeId: string, maintenant = new Date()) {
    const vehicule = await db.vehiculeDrive.findUnique({
      where: { id: vehiculeId },
      include: {
        documents: { where: { archiveeLe: null } },
        chauffeur: { select: { id: true } },
        societe: { select: { id: true, raisonSociale: true } },
      },
    });
    if (!vehicule) return null;

    const conforme = vehiculeConforme(vehicule, maintenant);
    if (conforme === vehicule.conforme) return { conforme, change: false };

    const { count } = await db.vehiculeDrive.updateMany({
      where: { id: vehiculeId, conforme: vehicule.conforme },
      data: { conforme },
    });
    if (count !== 1) return { conforme, change: false };

    if (!conforme && vehicule.chauffeur) {
      await db.chauffeurDrive.updateMany({ where: { id: vehicule.chauffeur.id }, data: { enLigne: false } });
      await this.prevenirChauffeur(
        vehicule.chauffeur.id,
        `Le véhicule ${vehicule.plaque} ne peut plus rouler`,
        "Une de ses pièces n'est plus valable. Votre société doit la renouveler ; en attendant, vous êtes hors ligne."
      );
    }
    logger.info("ZupDrive véhicule conformity changed", { vehiculeId, conforme });
    return { conforme, change: true, vehicule };
  }

  // -------------------------------------------------------------------------

  /**
   * Après un changement de rattachement, les pièces exigées du chauffeur
   * changent. S'il ne remplit plus les conditions de son état (validé, ou
   * dossier envoyé), il repasse en brouillon pour compléter son dossier.
   */
  private static async ajusterStatutAuDossier(chauffeurId: string, contexte: string) {
    const dossier = await ChauffeurOnboardingService.dossier(chauffeurId);
    const complet = dossier.champsManquants.length === 0 && dossier.piecesManquantes.length === 0;
    const enRegle =
      dossier.statut === "VALIDE" ? complet && dossier.dossierValidable : dossier.statut === "SOUMIS" ? complet : true;
    if (enRegle) return;

    const manque = [...dossier.champsManquants, ...dossier.piecesAValider.map(libelleDeLaPiece)].join(", ");
    const motif = `${contexte} : complétez votre dossier (${manque}), puis envoyez-le.`;
    const { count } = await db.chauffeurDrive.updateMany({
      where: { id: chauffeurId, statut: dossier.statut },
      data: { statut: "BROUILLON", motifStatut: motif, enLigne: false },
    });
    if (count === 1) {
      logger.info("ZupDrive chauffeur back to draft after company change", { chauffeurId, de: dossier.statut });
      await this.prevenirChauffeur(chauffeurId, "Votre dossier chauffeur est à compléter", motif);
    }
  }

  /** Rompt le rattachement, jamais pendant une course. */
  private static async detacher(chauffeurId: string, societeId: string) {
    await this.exigerSansCourse(chauffeurId, "Une course est en cours : attendez qu'elle soit terminée");
    const { count } = await db.chauffeurDrive.updateMany({
      where: { id: chauffeurId, societeId },
      data: { societeId: null, vehiculeId: null, rattacheLe: null, enLigne: false },
    });
    if (count !== 1) throw new ApiError(409, "Ce chauffeur ne roule plus pour cette société", "NOT_IN_COMPANY");
    logger.info("ZupDrive chauffeur left société", { chauffeurId, societeId });
    await this.ajusterStatutAuDossier(chauffeurId, "Vous roulez désormais en indépendant");
  }

  private static async exigerSansCourse(chauffeurId: string, message: string) {
    const enCourse = await db.courseDrive.count({
      where: { chauffeurId, statut: { in: STATUTS_AVEC_CHAUFFEUR } },
    });
    if (enCourse > 0) throw new ApiError(409, message, "RIDE_IN_PROGRESS");
  }

  private static exigerNonSuspendue(societe: { statut: string }) {
    if (societe.statut === "SUSPENDU") throw new ApiError(409, "La société est suspendue", "COMPANY_SUSPENDED");
  }

  private static pasDeSociete() {
    return new ApiError(404, "Commencez par ouvrir le dossier de votre société", "SOCIETE_NOT_FOUND");
  }

  private static async societeDuGerant(userId: string) {
    const societe = await db.societeDrive.findUnique({ where: { gerantId: userId } });
    if (!societe) throw this.pasDeSociete();
    return societe;
  }

  /** Un véhicule non retiré de CETTE société ; celui d'une autre répond 404. */
  private static async vehiculeDeLaSociete(societeId: string, vehiculeId: string) {
    const vehicule = await db.vehiculeDrive.findFirst({
      where: { id: vehiculeId, societeId, retireLe: null },
      include: { documents: { where: { archiveeLe: null }, orderBy: { createdAt: "asc" } }, chauffeur: { select: { id: true } } },
    });
    if (!vehicule) throw new ApiError(404, "Véhicule introuvable", "VEHICLE_NOT_FOUND");
    return vehicule;
  }

  private static async chauffeurDeLaSociete(societeId: string, chauffeurId: string) {
    const chauffeur = await db.chauffeurDrive.findFirst({ where: { id: chauffeurId, societeId } });
    if (!chauffeur) throw new ApiError(404, "Chauffeur introuvable", "CHAUFFEUR_NOT_FOUND");
    return chauffeur;
  }

  /** Une invitation en attente, adressée à l'e-mail de CE compte. */
  private static async invitationDuCompte(userId: string, invitationId: string) {
    const user = await this.comptePourInvitations(userId);
    const invitation = await db.invitationSocieteDrive.findUnique({ where: { id: invitationId } });
    if (!user || !invitation || invitation.email !== user.email.toLowerCase() || invitation.statut !== "EN_ATTENTE") {
      throw new ApiError(404, "Invitation introuvable ou déjà traitée", "INVITATION_NOT_FOUND");
    }
    return invitation;
  }

  private static async comptePourInvitations(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
    // Le signup ouvre une session avant confirmation : l'adresse saisie ne
    // suffit donc pas à établir la propriété d'une invitation adressée par e-mail.
    if (user && !user.emailVerified) {
      throw new ApiError(403, "Confirmez votre adresse e-mail pour consulter ou répondre aux invitations de société.", "EMAIL_NOT_VERIFIED");
    }
    return user;
  }

  private static motifExige(motif: string) {
    if (!motif?.trim()) throw new ApiError(400, "Dites à la société pourquoi", "MISSING_REASON");
    return motif.trim();
  }

  /** Une transition, seulement depuis les états permis, par écriture conditionnelle. */
  private static async changerStatut(
    societe: { id: string; statut: string },
    depuis: StatutSociete[],
    data: Record<string, unknown>,
    titre: string,
    message: string
  ) {
    const { count } = await db.societeDrive.updateMany({ where: { id: societe.id, statut: { in: depuis } }, data });
    if (count !== 1) {
      throw new ApiError(409, "Le dossier a changé d'état entre-temps, rechargez-le", "INVALID_STATUS");
    }
    logger.info("ZupDrive société status changed", { societeId: societe.id, de: societe.statut, vers: data.statut });
    await this.prevenirGerant(societe.id, titre, message);
    return { avant: societe.statut, dossier: await this.societe(societe.id) };
  }

  /**
   * Numéro BCE ou plaque déjà inscrits : un message clair plutôt qu'une
   * erreur interne. Seul le doublon de gérant (deux créations simultanées de
   * la même société) est rendu à l'appelant, qui relit alors le dossier ;
   * toute autre erreur est relancée telle quelle.
   *
   * Prisma 7 (adaptateur PostgreSQL) nomme la contrainte violée dans
   * meta.driverAdapterError, et plus dans meta.target : on lit les deux.
   */
  private static doublon(err: unknown) {
    const e = err as { code?: string; meta?: unknown };
    if (e?.code !== "P2002") throw err;
    const cible = JSON.stringify(e.meta ?? "");
    if (cible.includes("numeroEntreprise")) {
      throw new ApiError(409, "Cette entreprise (numéro BCE) est déjà inscrite sur ZupDrive", "BCE_ALREADY_REGISTERED");
    }
    if (cible.includes("plaque")) {
      throw new ApiError(409, "Ce véhicule (plaque) est déjà inscrit sur ZupDrive", "PLATE_ALREADY_REGISTERED");
    }
    if (!cible.includes("gerantId")) throw err;
  }

  private static donneesDuProfil(profil: ProfilSociete) {
    const data: Record<string, string | null> = {};
    if (profil.raisonSociale !== undefined) {
      const raison = texte(profil.raisonSociale);
      if (!raison) throw new ApiError(400, "Indiquez la raison sociale", "MISSING_NAME");
      data.raisonSociale = raison;
    }
    if (profil.telephone !== undefined) data.telephone = texte(profil.telephone);
    if (profil.region !== undefined) data.region = profil.region;
    if (profil.numeroEntreprise !== undefined) {
      if (texte(profil.numeroEntreprise)) {
        const bce = numeroBceNormalise(profil.numeroEntreprise!);
        if (!bce) throw new ApiError(400, "Numéro d'entreprise (BCE) invalide", "INVALID_BCE_NUMBER");
        data.numeroEntreprise = bce;
      } else {
        data.numeroEntreprise = null;
      }
    }
    return data;
  }

  // -------------------------------------------------------------------------
  // Notifications : la décision est déjà en base, un échec d'envoi ne la
  // défait pas.
  // -------------------------------------------------------------------------

  static async prevenirGerant(societeId: string, titre: string, message: string) {
    const societe = await db.societeDrive.findUnique({
      where: { id: societeId },
      select: { gerant: { select: { email: true } } },
    });
    if (societe) await this.prevenirCompte(societe.gerant.email, titre, message, { courriel: false });
  }

  private static async prevenirChauffeur(chauffeurId: string, titre: string, message: string) {
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: { user: { select: { email: true } } },
    });
    if (chauffeur) await this.prevenirCompte(chauffeur.user.email, titre, message, { lien: "/chauffeur", courriel: false });
  }

  static async prevenirCompte(
    email: string,
    titre: string,
    message: string,
    options: { lien?: string; courriel: boolean; priorite?: string }
  ) {
    try {
      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: titre,
          message,
          recipientEmail: email,
          link: options.lien ?? null,
          ...(options.priorite ? { priority: options.priorite } : {}),
        },
      });
      emitNotification(email, notification);

      if (options.courriel) {
        const lien = options.lien ? `${getEnv().FRONTEND_URL.replace(/\/+$/, "")}${options.lien}` : null;
        const echapper = (t: string) =>
          t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
        await EmailService.sendEmail({
          to: email,
          subject: `ZupDrive — ${titre}`,
          html: `<p>${echapper(message)}</p>${lien ? `<p><a href="${echapper(lien)}">${echapper(lien)}</a></p>` : ""}`,
          text: `${message}${lien ? `\n\n${lien}` : ""}`,
        });
      }
    } catch (err) {
      logger.warn("ZupDrive société notification failed", { titre, error: err instanceof Error ? err.message : err });
    }
  }
}
