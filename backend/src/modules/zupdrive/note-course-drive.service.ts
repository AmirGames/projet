import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { notifierPlateforme } from "../notifications/notification.service";

/**
 * Les notes des courses ZupDrive, dans les deux sens : le passager note son
 * chauffeur, le chauffeur note son passager.
 *
 * - Seules les deux personnes de la course notent, une fois chacune, une
 *   course TERMINEE, dans les DELAI_NOTE_MS qui suivent. Une note ne se
 *   modifie pas : la rejouer est refusé, jamais comptée deux fois (contrainte
 *   unique en base).
 * - Chacun voit la moyenne de l'autre, jamais le détail : les commentaires ne
 *   sont lus que par l'équipe ZupDrive, pour éviter les règlements de comptes.
 * - Les moyennes sont recalculées depuis les notes, jamais entretenues à
 *   part. Un compte jamais noté n'a pas de note, et c'est ce qui s'affiche.
 * - Une note basse prévient l'équipe : c'est là qu'un problème se voit.
 *
 * Distinct des notes des livreurs ZupEat (driver-rating.service.ts) : autre
 * métier, autres règles.
 */

export const NOTE_MIN = 1;
export const NOTE_MAX = 5;
export const COMMENTAIRE_MAX = 500;
export const DELAI_NOTE_MS = 7 * 24 * 3600 * 1000;
/** À partir de cette note (incluse), l'équipe est prévenue. */
export const SEUIL_ALERTE = 2;

export type Auteur = "PASSAGER" | "CHAUFFEUR";

export interface Moyenne {
  /** Nulle tant que personne n'a noté. */
  moyenne: number | null;
  avis: number;
}

const arrondie = (valeur: number | null) => (valeur === null ? null : Math.round(valeur * 10) / 10);

export class NoteCourseDriveService {
  /**
   * Enregistre la note d'une course. `quiNote` identifie l'auteur :
   * le compte du passager, ou le chauffeur (par son dossier).
   */
  static async noter(
    quiNote: { auteur: "PASSAGER"; passagerId: string } | { auteur: "CHAUFFEUR"; chauffeurId: string },
    courseId: string,
    saisie: { note: number; commentaire?: string | null },
    maintenant = new Date()
  ) {
    if (!Number.isInteger(saisie.note) || saisie.note < NOTE_MIN || saisie.note > NOTE_MAX) {
      throw new ApiError(400, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`, "INVALID_RATING");
    }
    const commentaire = saisie.commentaire?.trim() || null;
    if (commentaire && commentaire.length > COMMENTAIRE_MAX) {
      throw new ApiError(400, `Commentaire limité à ${COMMENTAIRE_MAX} caractères`, "COMMENT_TOO_LONG");
    }

    const course = await db.courseDrive.findUnique({ where: { id: courseId } });
    const concernee =
      !!course &&
      (quiNote.auteur === "PASSAGER"
        ? course.passagerId === quiNote.passagerId
        : course.chauffeurId === quiNote.chauffeurId);
    // Une course d'un autre répond comme une course inexistante.
    if (!course || !concernee) {
      throw new ApiError(404, "Course introuvable", "RIDE_NOT_FOUND");
    }
    if (course.statut !== "TERMINEE" || !course.termineeLe || !course.chauffeurId) {
      throw new ApiError(409, "Seule une course terminée se note", "RIDE_NOT_FINISHED");
    }
    if (maintenant.getTime() - course.termineeLe.getTime() > DELAI_NOTE_MS) {
      throw new ApiError(409, "Le délai pour noter cette course est passé", "RATING_WINDOW_CLOSED");
    }

    let note;
    try {
      note = await db.noteCourseDrive.create({
        data: {
          courseId,
          auteur: quiNote.auteur,
          chauffeurId: course.chauffeurId,
          passagerId: course.passagerId,
          note: saisie.note,
          commentaire,
        },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new ApiError(409, "Vous avez déjà noté cette course", "ALREADY_RATED");
      }
      throw err;
    }

    logger.info("ZupDrive ride rated", { courseId, auteur: quiNote.auteur, note: saisie.note });

    if (saisie.note <= SEUIL_ALERTE) {
      const qui = quiNote.auteur === "PASSAGER" ? "chauffeur" : "passager";
      await notifierPlateforme(
        `Note basse (${saisie.note}/5) pour un ${qui} ZupDrive`,
        commentaire ? `« ${commentaire} »` : "Sans commentaire.",
        quiNote.auteur === "PASSAGER"
          ? `/superowner/zupdrive/chauffeurs/${course.chauffeurId}`
          : "/superowner/zupdrive/courses"
      ).catch((err) => logger.warn("ZupDrive low rating alert failed", { courseId, err }));
    }

    return note;
  }

  /** La moyenne des notes reçues par un chauffeur (données par ses passagers). */
  static async moyenneChauffeur(chauffeurId: string): Promise<Moyenne> {
    const bilan = await db.noteCourseDrive.aggregate({
      where: { chauffeurId, auteur: "PASSAGER" },
      _avg: { note: true },
      _count: { _all: true },
    });
    return { moyenne: arrondie(bilan._avg.note), avis: bilan._count._all };
  }

  /** La moyenne des notes reçues par un passager (données par ses chauffeurs). */
  static async moyennePassager(passagerId: string | null): Promise<Moyenne> {
    if (!passagerId) return { moyenne: null, avis: 0 };
    const bilan = await db.noteCourseDrive.aggregate({
      where: { passagerId, auteur: "CHAUFFEUR" },
      _avg: { note: true },
      _count: { _all: true },
    });
    return { moyenne: arrondie(bilan._avg.note), avis: bilan._count._all };
  }

  /** Les moyennes de plusieurs chauffeurs en une requête (listes de l'équipe). */
  static async moyennesChauffeurs(chauffeurIds: string[]): Promise<Map<string, Moyenne>> {
    const lignes = chauffeurIds.length
      ? await db.noteCourseDrive.groupBy({
          by: ["chauffeurId"],
          where: { chauffeurId: { in: chauffeurIds }, auteur: "PASSAGER" },
          _avg: { note: true },
          _count: { _all: true },
        })
      : [];
    return new Map(
      lignes.map((l) => [l.chauffeurId, { moyenne: arrondie(l._avg.note), avis: l._count._all }])
    );
  }

  /** Cette personne peut-elle encore noter cette course ? */
  static peutNoter(
    course: { statut: string; termineeLe: Date | null },
    dejaNotee: boolean,
    maintenant = new Date()
  ) {
    return (
      course.statut === "TERMINEE" &&
      !!course.termineeLe &&
      !dejaNotee &&
      maintenant.getTime() - course.termineeLe.getTime() <= DELAI_NOTE_MS
    );
  }
}
