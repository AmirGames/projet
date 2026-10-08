import { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";

/**
 * Le chat d'une course ZupDrive : des messages courts entre le passager et son
 * chauffeur, relus par l'application (pas de temps réel).
 *
 * Seuls les deux participants de la course lisent et écrivent : toute autre
 * course répond 404. On n'écrit que pendant que le chauffeur est en route ou
 * à bord ; la lecture reste possible ensuite, aux seuls participants, jusqu'à
 * la purge de l'historique. Le texte n'est jamais écrit dans les journaux.
 */
export const STATUTS_CHAT = ["ACCEPTEE", "ARRIVEE", "EN_COURS"];
export const TEXTE_MAX = 500;
/** Garde-fou contre un fil interminable : une course n'est pas un forum. */
export const MESSAGES_MAX = 200;

export type Participant = { auteur: "PASSAGER"; userId: string } | { auteur: "CHAUFFEUR"; chauffeurId: string };

const choix = { id: true, auteur: true, texte: true, createdAt: true } as const;

async function courseDuParticipant(participant: Participant, courseId: string) {
  const course = await db.courseDrive.findUnique({ where: { id: courseId }, select: { id: true, statut: true, passagerId: true, chauffeurId: true } });
  const sien =
    !!course &&
    (participant.auteur === "PASSAGER" ? course.passagerId === participant.userId : course.chauffeurId === participant.chauffeurId);
  if (!course || !sien) throw new ApiError(404, "Trajet introuvable", "RIDE_NOT_FOUND");
  return course;
}

export class ChatCourseDriveService {
  /** Les messages de la course, du plus ancien au plus récent ; `depuis` ne rend que les plus récents (>=, le client écarte les doublons par id). */
  static async lister(participant: Participant, courseId: string, depuis?: Date) {
    await courseDuParticipant(participant, courseId);
    return db.messageCourseDrive.findMany({
      where: { courseId, ...(depuis ? { createdAt: { gte: depuis } } : {}) },
      select: choix,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: MESSAGES_MAX,
    });
  }

  static async envoyer(participant: Participant, courseId: string, texte: string, cleIdempotence: string) {
    const course = await courseDuParticipant(participant, courseId);
    const auteur = participant.auteur;

    // Rejouer l'envoi (double appui, réseau coupé) rend le même message.
    const deja = await db.messageCourseDrive.findUnique({
      where: { courseId_auteur_cleIdempotence: { courseId, auteur, cleIdempotence } },
      select: choix,
    });
    if (deja) return deja;

    if (!STATUTS_CHAT.includes(course.statut)) {
      throw new ApiError(409, "Le chat est fermé : le trajet n'est pas en cours avec un chauffeur", "CHAT_CLOSED");
    }
    if ((await db.messageCourseDrive.count({ where: { courseId } })) >= MESSAGES_MAX) {
      throw new ApiError(429, "Trop de messages pour ce trajet", "CHAT_LIMIT");
    }
    try {
      return await db.messageCourseDrive.create({ data: { courseId, auteur, texte, cleIdempotence }, select: choix });
    } catch (err) {
      // Deux envois simultanés de la même clé : l'autre a gagné, on rend son message.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return db.messageCourseDrive.findUniqueOrThrow({ where: { courseId_auteur_cleIdempotence: { courseId, auteur, cleIdempotence } }, select: choix });
      }
      throw err;
    }
  }
}
