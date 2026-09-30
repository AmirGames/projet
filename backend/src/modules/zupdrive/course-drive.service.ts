import { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { distanceKm } from "../../utils/geo";
import { emitNotification } from "../realtime/socket";
import { TarificationDriveService, type Point } from "./tarification-drive.service";

/**
 * Les courses ZupDrive : un passager commande un trajet à prix fixe, la
 * course est proposée au chauffeur validé le plus proche, qui a quelques
 * secondes pour l'accepter, puis la course suit ses étapes.
 *
 *   RECHERCHE → ACCEPTEE → ARRIVEE → EN_COURS → TERMINEE
 *        │          │          │
 *        │          └──────────┴──→ ANNULEE (passager ou chauffeur)
 *        ├──→ ANNULEE (passager)
 *        └──→ SANS_CHAUFFEUR (personne n'a accepté à temps)
 *
 * Chaque transition est une écriture conditionnée à l'état attendu : un
 * double clic, deux chauffeurs qui acceptent à la même seconde ou deux
 * serveurs qui balaient en même temps ne font jamais passer une course par
 * deux états. Le temps réel n'est qu'un signal : l'état fait foi en base, et
 * les écrans le relisent par l'API.
 *
 * Rien n'est partagé avec l'attribution des livreurs ZupEat : ce sont deux
 * métiers distincts.
 */

/** Le temps laissé au chauffeur pour accepter une proposition. */
export const DELAI_REPONSE_MS = 20_000;
/** Au-delà, la recherche s'arrête et le passager est prévenu. */
export const RECHERCHE_MAX_MS = 5 * 60_000;
/** Une position plus ancienne ne dit plus où est le chauffeur. */
export const POSITION_FRAICHE_MS = 2 * 60_000;
/** Distance maximale entre le chauffeur et le point de départ. */
export const RAYON_KM = 15;

export const STATUTS_ACTIFS = ["RECHERCHE", "ACCEPTEE", "ARRIVEE", "EN_COURS"];
const STATUTS_AVEC_CHAUFFEUR = ["ACCEPTEE", "ARRIVEE", "EN_COURS"];

/** Les étapes que le chauffeur fait avancer, et l'état qu'elles exigent. */
const ETAPES = {
  arrive: { depuis: "ACCEPTEE", vers: "ARRIVEE", date: "arriveeLe" },
  demarrer: { depuis: "ARRIVEE", vers: "EN_COURS", date: "debutLe" },
  terminer: { depuis: "EN_COURS", vers: "TERMINEE", date: "termineeLe" },
} as const;
export type Etape = keyof typeof ETAPES;

export interface Adresse extends Point {
  adresse: string;
  codePostal: string;
}

const prenom = (nom: string | null | undefined) => (nom || "").trim().split(/\s+/)[0] || null;

/** Le chauffeur tel que le passager le voit : de quoi le reconnaître, rien de plus. */
function chauffeurPourLePassager(course: {
  statut: string;
  chauffeur: {
    nomComplet: string;
    vehiculeMarque: string | null;
    vehiculeModele: string | null;
    vehiculePlaque: string | null;
    latitude: number | null;
    longitude: number | null;
    positionLe: Date | null;
  } | null;
}) {
  const c = course.chauffeur;
  if (!c) return null;
  // Sa position n'a de sens que tant qu'il vient chercher le passager.
  const enApproche = course.statut === "ACCEPTEE" || course.statut === "ARRIVEE";
  return {
    prenom: prenom(c.nomComplet),
    vehicule: [c.vehiculeMarque, c.vehiculeModele].filter(Boolean).join(" ") || null,
    plaque: c.vehiculePlaque,
    position:
      enApproche && c.latitude !== null && c.longitude !== null
        ? { latitude: c.latitude, longitude: c.longitude, le: c.positionLe }
        : null,
  };
}

const SELECTION_CHAUFFEUR = {
  select: {
    nomComplet: true,
    vehiculeMarque: true,
    vehiculeModele: true,
    vehiculePlaque: true,
    latitude: true,
    longitude: true,
    positionLe: true,
  },
} as const;

export class CourseDriveService {
  // -------------------------------------------------------------------------
  // Passager
  // -------------------------------------------------------------------------

  static async devis(depart: Adresse, arrivee: Adresse) {
    return TarificationDriveService.devis({ depart, arrivee });
  }

  /**
   * Commande un trajet. Rejouer la même commande (même clé) rend la même
   * course. Le prix est recalculé ici, jamais repris du navigateur : s'il a
   * changé depuis le devis affiché, la commande est refusée pour que le
   * passager voie le nouveau prix.
   */
  static async commander(
    passagerId: string,
    demande: { depart: Adresse; arrivee: Adresse; cleIdempotence: string; prixAnnonceCentimes: number }
  ) {
    const deja = await db.courseDrive.findUnique({
      where: { passagerId_cleIdempotence: { passagerId, cleIdempotence: demande.cleIdempotence } },
    });
    if (deja) return this.maCourse(passagerId, deja.id);

    const enCours = await db.courseDrive.findFirst({
      where: { passagerId, statut: { in: STATUTS_ACTIFS } },
      select: { id: true },
    });
    if (enCours) {
      throw new ApiError(409, "Vous avez déjà un trajet en cours", "RIDE_IN_PROGRESS");
    }

    const devis = await this.devis(demande.depart, demande.arrivee);
    if (devis.prixCentimes !== demande.prixAnnonceCentimes) {
      throw new ApiError(409, "Le prix de ce trajet a changé : vérifiez le nouveau prix", "PRICE_CHANGED");
    }

    let course;
    try {
      course = await db.courseDrive.create({
        data: {
          passagerId,
          cleIdempotence: demande.cleIdempotence,
          region: devis.region,
          departAdresse: demande.depart.adresse,
          departLatitude: demande.depart.latitude,
          departLongitude: demande.depart.longitude,
          arriveeAdresse: demande.arrivee.adresse,
          arriveeLatitude: demande.arrivee.latitude,
          arriveeLongitude: demande.arrivee.longitude,
          distanceMetres: devis.distanceMetres,
          dureeSecondes: devis.dureeSecondes,
          prixCentimes: devis.prixCentimes,
          devise: devis.devise,
          tarifApplique: devis.tarif as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err: any) {
      // Deux envois simultanés de la même commande : le second rend la première.
      if (err?.code !== "P2002") throw err;
      const existante = await db.courseDrive.findUniqueOrThrow({
        where: { passagerId_cleIdempotence: { passagerId, cleIdempotence: demande.cleIdempotence } },
      });
      return this.maCourse(passagerId, existante.id);
    }

    logger.info("ZupDrive ride requested", { courseId: course.id, region: course.region });

    // Après l'écriture : la course existe même si la recherche échoue, et le
    // balayage périodique reprendra.
    await this.proposerAuSuivant(course.id).catch((err) =>
      logger.warn("ZupDrive first dispatch failed", { courseId: course.id, err })
    );

    return this.maCourse(passagerId, course.id);
  }

  /** Une course du passager, et seulement la sienne. */
  static async maCourse(passagerId: string, courseId: string) {
    const course = await db.courseDrive.findUnique({
      where: { id: courseId },
      include: { chauffeur: SELECTION_CHAUFFEUR },
    });
    if (!course || course.passagerId !== passagerId) {
      throw new ApiError(404, "Trajet introuvable", "RIDE_NOT_FOUND");
    }
    const { chauffeur: _chauffeur, tarifApplique: _tarif, cleIdempotence: _cle, ...reste } = course;
    return { ...reste, chauffeur: chauffeurPourLePassager(course) };
  }

  static async mesCourses(passagerId: string) {
    const courses = await db.courseDrive.findMany({
      where: { passagerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { chauffeur: SELECTION_CHAUFFEUR },
    });
    return courses.map(({ chauffeur: _c, tarifApplique: _t, cleIdempotence: _k, ...reste }, i) => ({
      ...reste,
      chauffeur: chauffeurPourLePassager(courses[i]),
    }));
  }

  /** Le passager annule, tant qu'il n'est pas monté à bord. */
  static async annulerParPassager(passagerId: string, courseId: string, motif?: string) {
    const course = await db.courseDrive.findUnique({ where: { id: courseId } });
    if (!course || course.passagerId !== passagerId) {
      throw new ApiError(404, "Trajet introuvable", "RIDE_NOT_FOUND");
    }
    if (course.statut === "ANNULEE") return this.maCourse(passagerId, courseId);

    await this.annuler(course.id, ["RECHERCHE", "ACCEPTEE", "ARRIVEE"], "PASSAGER", motif);

    if (course.chauffeurId) {
      await this.prevenirChauffeur(course.chauffeurId, "Course annulée", "Le passager a annulé la course.");
    }
    return this.maCourse(passagerId, courseId);
  }

  // -------------------------------------------------------------------------
  // Chauffeur
  // -------------------------------------------------------------------------

  /** Le chauffeur du compte connecté ; seul un chauffeur validé fait des courses. */
  static async chauffeurDuCompte(userId: string) {
    const chauffeur = await db.chauffeurDrive.findUnique({ where: { userId } });
    if (!chauffeur) {
      throw new ApiError(404, "Aucun dossier chauffeur pour ce compte", "CHAUFFEUR_NOT_FOUND");
    }
    return chauffeur;
  }

  private static exigerValide(chauffeur: { statut: string }) {
    if (chauffeur.statut !== "VALIDE") {
      throw new ApiError(
        403,
        chauffeur.statut === "SUSPENDU"
          ? "Votre compte chauffeur est suspendu"
          : "Votre dossier chauffeur doit être validé pour faire des courses",
        "CHAUFFEUR_NOT_ACTIVE"
      );
    }
  }

  static async passerEnLigne(userId: string, enLigne: boolean) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    if (enLigne) this.exigerValide(chauffeur);
    await db.chauffeurDrive.update({ where: { id: chauffeur.id }, data: { enLigne } });
    return this.tableauDeBord(userId);
  }

  static async enregistrerPosition(userId: string, position: Point) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    this.exigerValide(chauffeur);
    await db.chauffeurDrive.update({
      where: { id: chauffeur.id },
      data: { latitude: position.latitude, longitude: position.longitude, positionLe: new Date() },
    });
    return { ok: true };
  }

  /** Ce que l'écran du chauffeur affiche : sa disponibilité, la proposition ouverte, sa course. */
  static async tableauDeBord(userId: string) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    const maintenant = new Date();

    const [proposition, course, historique] = await Promise.all([
      db.propositionCourseDrive.findFirst({
        where: { chauffeurId: chauffeur.id, statut: "EN_ATTENTE", expireA: { gt: maintenant } },
        include: { course: { include: { passager: { select: { name: true } } } } },
      }),
      db.courseDrive.findFirst({
        where: { chauffeurId: chauffeur.id, statut: { in: STATUTS_AVEC_CHAUFFEUR } },
        include: { passager: { select: { name: true } } },
      }),
      db.courseDrive.findMany({
        where: { chauffeurId: chauffeur.id, statut: { in: ["TERMINEE", "ANNULEE"] } },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);

    const pourLeChauffeur = (c: NonNullable<typeof course>) => ({
      id: c.id,
      statut: c.statut,
      passager: prenom(c.passager?.name),
      departAdresse: c.departAdresse,
      departLatitude: c.departLatitude,
      departLongitude: c.departLongitude,
      arriveeAdresse: c.arriveeAdresse,
      distanceMetres: c.distanceMetres,
      dureeSecondes: c.dureeSecondes,
      prixCentimes: c.prixCentimes,
      devise: c.devise,
    });

    return {
      statut: chauffeur.statut,
      enLigne: chauffeur.enLigne,
      positionLe: chauffeur.positionLe,
      proposition: proposition
        ? {
            id: proposition.id,
            expireA: proposition.expireA,
            distanceMetres: proposition.distanceMetres,
            course: pourLeChauffeur(proposition.course),
          }
        : null,
      course: course ? pourLeChauffeur(course) : null,
      historique: historique.map((c) => ({
        id: c.id,
        statut: c.statut,
        departAdresse: c.departAdresse,
        arriveeAdresse: c.arriveeAdresse,
        prixCentimes: c.prixCentimes,
        termineeLe: c.termineeLe,
        annuleeLe: c.annuleeLe,
      })),
    };
  }

  /**
   * Le chauffeur accepte. Tout se joue dans une transaction, par écritures
   * conditionnelles : la proposition doit être encore ouverte, la course
   * encore sans chauffeur, et lui libre. Le premier qui accepte l'emporte ;
   * les autres reçoivent un refus clair.
   */
  static async accepter(userId: string, propositionId: string) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    this.exigerValide(chauffeur);
    const maintenant = new Date();

    const proposition = await db.propositionCourseDrive.findUnique({ where: { id: propositionId } });
    if (!proposition || proposition.chauffeurId !== chauffeur.id) {
      throw new ApiError(404, "Proposition introuvable", "OFFER_NOT_FOUND");
    }

    await db.$transaction(async (tx) => {
      const occupee = await tx.courseDrive.count({
        where: { chauffeurId: chauffeur.id, statut: { in: STATUTS_AVEC_CHAUFFEUR } },
      });
      if (occupee > 0) {
        throw new ApiError(409, "Vous avez déjà une course en cours", "ALREADY_ON_RIDE");
      }

      const prise = await tx.propositionCourseDrive.updateMany({
        where: { id: propositionId, statut: "EN_ATTENTE", expireA: { gt: maintenant } },
        data: { statut: "ACCEPTEE", reponduLe: maintenant },
      });
      if (prise.count !== 1) {
        throw new ApiError(409, "Cette proposition n'est plus ouverte", "OFFER_CLOSED");
      }

      const attribuee = await tx.courseDrive.updateMany({
        where: { id: proposition.courseId, statut: "RECHERCHE", chauffeurId: null },
        data: { statut: "ACCEPTEE", chauffeurId: chauffeur.id, accepteeLe: maintenant },
      });
      if (attribuee.count !== 1) {
        throw new ApiError(409, "Cette course n'est plus disponible", "RIDE_UNAVAILABLE");
      }
    });

    logger.info("ZupDrive ride accepted", { courseId: proposition.courseId, chauffeurId: chauffeur.id });
    await this.prevenirPassager(
      proposition.courseId,
      "Votre chauffeur arrive",
      `${prenom(chauffeur.nomComplet) ?? "Votre chauffeur"} a accepté votre course${
        chauffeur.vehiculePlaque ? ` (${chauffeur.vehiculePlaque})` : ""
      }.`
    );
    return this.tableauDeBord(userId);
  }

  static async refuser(userId: string, propositionId: string) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    const proposition = await db.propositionCourseDrive.findUnique({ where: { id: propositionId } });
    if (!proposition || proposition.chauffeurId !== chauffeur.id) {
      throw new ApiError(404, "Proposition introuvable", "OFFER_NOT_FOUND");
    }
    const { count } = await db.propositionCourseDrive.updateMany({
      where: { id: propositionId, statut: "EN_ATTENTE" },
      data: { statut: "REFUSEE", reponduLe: new Date() },
    });
    // Refusée : au suivant, tout de suite, sans attendre l'expiration.
    if (count === 1) await this.proposerAuSuivant(proposition.courseId);
    return this.tableauDeBord(userId);
  }

  /** Le chauffeur fait avancer sa course d'une étape, dans l'ordre. */
  static async avancer(userId: string, courseId: string, etape: Etape) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    const { depuis, vers, date } = ETAPES[etape];

    const course = await db.courseDrive.findUnique({ where: { id: courseId } });
    if (!course || course.chauffeurId !== chauffeur.id) {
      throw new ApiError(404, "Course introuvable", "RIDE_NOT_FOUND");
    }
    // Rejouer la même étape ne fait rien de plus.
    if (course.statut === vers) return this.tableauDeBord(userId);

    const { count } = await db.courseDrive.updateMany({
      where: { id: courseId, chauffeurId: chauffeur.id, statut: depuis },
      data: { statut: vers, [date]: new Date() },
    });
    if (count !== 1) {
      throw new ApiError(409, "Cette étape n'est pas possible maintenant", "INVALID_RIDE_STATUS");
    }

    const messages: Record<Etape, [string, string]> = {
      arrive: ["Votre chauffeur est arrivé", "Il vous attend au point de départ."],
      demarrer: ["Bon trajet !", "Votre course a commencé."],
      terminer: ["Course terminée", "Merci d'avoir voyagé avec ZupDrive."],
    };
    await this.prevenirPassager(courseId, ...messages[etape]);
    return this.tableauDeBord(userId);
  }

  /** Le chauffeur renonce avant que le passager soit à bord ; le passager est prévenu. */
  static async annulerParChauffeur(userId: string, courseId: string, motif: string) {
    const chauffeur = await this.chauffeurDuCompte(userId);
    const course = await db.courseDrive.findUnique({ where: { id: courseId } });
    if (!course || course.chauffeurId !== chauffeur.id) {
      throw new ApiError(404, "Course introuvable", "RIDE_NOT_FOUND");
    }
    await this.annuler(courseId, ["ACCEPTEE", "ARRIVEE"], "CHAUFFEUR", motif);
    await this.prevenirPassager(
      courseId,
      "Votre course a été annulée",
      "Le chauffeur a dû annuler. Vous pouvez commander un nouveau trajet."
    );
    return this.tableauDeBord(userId);
  }

  // -------------------------------------------------------------------------
  // Attribution
  // -------------------------------------------------------------------------

  /**
   * Propose la course au chauffeur disponible le plus proche : validé, en
   * ligne, de la même région, avec une position récente, sans course ni
   * proposition en cours, et pas déjà sollicité pour cette course.
   *
   * Sans candidat, rien ne se passe : le balayage réessaie, un chauffeur peut
   * se connecter entre-temps. Au-delà de RECHERCHE_MAX_MS, la course passe
   * SANS_CHAUFFEUR et le passager est prévenu.
   */
  static async proposerAuSuivant(courseId: string, maintenant = new Date()) {
    const course = await db.courseDrive.findUnique({
      where: { id: courseId },
      include: { propositions: { select: { chauffeurId: true, statut: true, expireA: true } } },
    });
    if (!course || course.statut !== "RECHERCHE") return null;

    // Une proposition encore ouverte : on attend sa réponse.
    if (course.propositions.some((p) => p.statut === "EN_ATTENTE" && p.expireA > maintenant)) return null;

    if (maintenant.getTime() - course.createdAt.getTime() > RECHERCHE_MAX_MS) {
      const { count } = await db.courseDrive.updateMany({
        where: { id: courseId, statut: "RECHERCHE" },
        data: { statut: "SANS_CHAUFFEUR", annuleeLe: maintenant, annuleePar: "PLATEFORME" },
      });
      if (count === 1) {
        logger.info("ZupDrive ride without driver", { courseId });
        await this.prevenirPassager(
          courseId,
          "Aucun chauffeur disponible",
          "Aucun chauffeur n'a pu accepter votre course. Réessayez dans quelques minutes."
        );
      }
      return null;
    }

    const dejaSollicites = course.propositions.map((p) => p.chauffeurId);
    const candidats = await db.chauffeurDrive.findMany({
      where: {
        statut: "VALIDE",
        enLigne: true,
        region: course.region,
        positionLe: { gt: new Date(maintenant.getTime() - POSITION_FRAICHE_MS) },
        latitude: { not: null },
        longitude: { not: null },
        id: { notIn: dejaSollicites },
        courses: { none: { statut: { in: STATUTS_AVEC_CHAUFFEUR } } },
        propositions: { none: { statut: "EN_ATTENTE", expireA: { gt: maintenant } } },
      },
      select: { id: true, latitude: true, longitude: true },
    });

    const depart = { latitude: course.departLatitude, longitude: course.departLongitude };
    const classes = candidats
      .map((c) => ({ id: c.id, km: distanceKm(depart, { latitude: c.latitude!, longitude: c.longitude! }) }))
      .filter((c) => c.km <= RAYON_KM)
      .sort((a, b) => a.km - b.km);

    for (const candidat of classes) {
      try {
        const proposition = await db.propositionCourseDrive.create({
          data: {
            courseId,
            chauffeurId: candidat.id,
            distanceMetres: Math.round(candidat.km * 1000),
            expireA: new Date(maintenant.getTime() + DELAI_REPONSE_MS),
          },
        });
        await this.prevenirChauffeur(
          candidat.id,
          "Nouvelle course",
          `Départ : ${course.departAdresse}. Vous avez ${DELAI_REPONSE_MS / 1000} secondes pour accepter.`
        );
        return proposition;
      } catch (err: any) {
        // Déjà sollicité entre-temps (autre serveur) : au suivant.
        if (err?.code !== "P2002") throw err;
      }
    }
    return null;
  }

  /** Passage périodique : propositions échues, puis nouvelle tentative pour chaque course en recherche. */
  static async balayer(maintenant = new Date()) {
    const { count: expirees } = await db.propositionCourseDrive.updateMany({
      where: { statut: "EN_ATTENTE", expireA: { lte: maintenant } },
      data: { statut: "EXPIREE" },
    });

    const enRecherche = await db.courseDrive.findMany({
      where: { statut: "RECHERCHE" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    let proposees = 0;
    for (const course of enRecherche) {
      if (await this.proposerAuSuivant(course.id, maintenant)) proposees++;
    }
    return { expirees, proposees, enRecherche: enRecherche.length };
  }

  // -------------------------------------------------------------------------

  private static async annuler(courseId: string, depuis: string[], par: string, motif?: string) {
    const maintenant = new Date();
    const { count } = await db.courseDrive.updateMany({
      where: { id: courseId, statut: { in: depuis } },
      data: { statut: "ANNULEE", annuleeLe: maintenant, annuleePar: par, motifAnnulation: motif?.trim() || null },
    });
    if (count !== 1) {
      throw new ApiError(409, "Ce trajet ne peut plus être annulé", "INVALID_RIDE_STATUS");
    }
    // Une proposition encore ouverte ne doit plus pouvoir être acceptée.
    await db.propositionCourseDrive.updateMany({
      where: { courseId, statut: "EN_ATTENTE" },
      data: { statut: "CADUQUE" },
    });
    logger.info("ZupDrive ride cancelled", { courseId, par });
  }

  /** Prévenir : un échec d'envoi ne défait jamais une étape déjà enregistrée. */
  private static async prevenir(email: string | null | undefined, titre: string, message: string, lien: string) {
    if (!email) return;
    try {
      const notification = await db.notification.create({
        data: { type: "PLATFORM_ANNOUNCEMENT", title: titre, message, recipientEmail: email, link: lien, priority: "HIGH" },
      });
      emitNotification(email, notification);
    } catch (err) {
      logger.warn("ZupDrive ride notification failed", { err });
    }
  }

  private static async prevenirPassager(courseId: string, titre: string, message: string) {
    const course = await db.courseDrive
      .findUnique({ where: { id: courseId }, select: { passager: { select: { email: true } } } })
      .catch(() => null);
    await this.prevenir(course?.passager?.email, titre, message, `/trajet/${courseId}`);
  }

  private static async prevenirChauffeur(chauffeurId: string, titre: string, message: string) {
    const chauffeur = await db.chauffeurDrive
      .findUnique({ where: { id: chauffeurId }, select: { user: { select: { email: true } } } })
      .catch(() => null);
    await this.prevenir(chauffeur?.user.email, titre, message, "/chauffeur/courses");
  }
}
