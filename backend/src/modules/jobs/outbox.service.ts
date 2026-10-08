import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { codeErreur } from "../../utils/code-erreur";

/**
 * Effets externes à ne pas perdre.
 *
 * Envoyer un e-mail « en arrière-plan » après une écriture perd l'envoi si le
 * processus s'arrête entre les deux, ou si le serveur de courriel est
 * indisponible à cet instant. Ici l'intention d'envoi est écrite en base ; un
 * worker l'exécute, et la rejoue avec un délai croissant tant qu'elle échoue.
 *
 * - Chaque message peut porter une clé de dédoublonnage : le même effet demandé
 *   deux fois (rejeu, double appel) n'est enregistré, donc envoyé, qu'une fois.
 * - La prise en charge est atomique : plusieurs workers ne traitent pas le même
 *   message. Un message dont le worker a disparu (bail dépassé) est repris.
 * - Livraison « au moins une fois » : un échec après l'envoi réel mais avant
 *   l'écriture du résultat peut renvoyer le message. Réservé aux effets où un
 *   doublon est préférable à une perte (un e-mail), pas aux opérations
 *   financières.
 */

export type Gestionnaire = (payload: Prisma.JsonValue) => Promise<unknown>;

const gestionnaires = new Map<string, Gestionnaire>();

const BAIL_TRAITEMENT_MS = 2 * 60_000;
const DELAI_BASE_MS = 30_000;
const DELAI_MAX_MS = 60 * 60_000;
const CONSERVATION_TERMINES_MS = 7 * 24 * 60 * 60_000;

/** 30 s, 1 min, 2 min, 4 min… plafonné à une heure. */
export function delaiAvantRelance(tentatives: number) {
  return Math.min(DELAI_BASE_MS * 2 ** Math.max(0, tentatives - 1), DELAI_MAX_MS);
}

/** Message d'erreur sans détail sensible, borné. */
function resume(err: unknown) {
  const texte = err instanceof Error ? err.message : String(err);
  return texte.slice(0, 300);
}

export const Outbox = {
  declarer(type: string, gestionnaire: Gestionnaire) {
    gestionnaires.set(type, gestionnaire);
  },

  /**
   * Écrit l'intention d'envoi. Avec `dedupeKey`, un second appel identique ne
   * crée rien et rend `null`. Peut être appelé dans une transaction Prisma
   * (`tx`) pour que le message naisse avec l'écriture métier, ou échouer avec elle.
   */
  async enregistrer(
    type: string,
    payload: Prisma.InputJsonValue,
    options: { dedupeKey?: string; maxAttempts?: number; tx?: Pick<typeof db, "outboxMessage"> } = {}
  ) {
    const client = options.tx ?? db;
    try {
      return await client.outboxMessage.create({
        data: {
          type,
          payload,
          dedupeKey: options.dedupeKey,
          ...(options.maxAttempts ? { maxAttempts: options.maxAttempts } : {}),
        },
      });
    } catch (err) {
      if (codeErreur(err) === "P2002" && options.dedupeKey) return null;
      throw err;
    }
  },

  /** Traite les messages dus. Rend le nombre d'envois réussis. */
  async traiterLesDus(limite = 20, maintenant = () => new Date()): Promise<number> {
    const debut = maintenant();
    const candidats = await db.outboxMessage.findMany({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: debut } },
          // Worker disparu en cours de traitement.
          { status: "PROCESSING", lockedUntil: { lt: debut } },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
      take: limite,
    });

    let reussis = 0;
    for (const message of candidats) {
      // Prise en charge : seule l'instance qui voit encore l'état lu l'emporte.
      const pris = await db.outboxMessage.updateMany({
        where: { id: message.id, status: message.status, attempts: message.attempts },
        data: {
          status: "PROCESSING",
          attempts: message.attempts + 1,
          lockedUntil: new Date(maintenant().getTime() + BAIL_TRAITEMENT_MS),
        },
      });
      if (pris.count !== 1) continue;

      const tentatives = message.attempts + 1;
      const gestionnaire = gestionnaires.get(message.type);

      try {
        if (!gestionnaire) throw new Error(`Aucun gestionnaire pour « ${message.type} »`);
        await gestionnaire(message.payload);
        await db.outboxMessage.update({
          where: { id: message.id },
          data: { status: "DONE", processedAt: new Date(), lockedUntil: null, lastError: null },
        });
        reussis += 1;
      } catch (err) {
        const definitif = !gestionnaire || tentatives >= message.maxAttempts;
        await db.outboxMessage.update({
          where: { id: message.id },
          data: {
            status: definitif ? "FAILED" : "PENDING",
            lockedUntil: null,
            lastError: resume(err),
            nextAttemptAt: new Date(maintenant().getTime() + delaiAvantRelance(tentatives)),
          },
        });
        if (definitif) {
          logger.error("Message d'outbox abandonné", { id: message.id, type: message.type, tentatives, error: resume(err) });
        } else {
          logger.warn("Message d'outbox à rejouer", { id: message.id, type: message.type, tentatives });
        }
      }
    }
    return reussis;
  },

  /** Supprime les messages terminés depuis plus d'une semaine ; les échecs restent. */
  async purger(maintenant = new Date()) {
    const { count } = await db.outboxMessage.deleteMany({
      where: { status: "DONE", processedAt: { lt: new Date(maintenant.getTime() - CONSERVATION_TERMINES_MS) } },
    });
    return count;
  },

  /** Retard et échecs, pour la surveillance. */
  async etat(maintenant = new Date()) {
    const [enAttente, echecs, plusAncien] = await Promise.all([
      db.outboxMessage.count({ where: { status: { in: ["PENDING", "PROCESSING"] } } }),
      db.outboxMessage.count({ where: { status: "FAILED" } }),
      db.outboxMessage.findFirst({
        where: { status: "PENDING", nextAttemptAt: { lte: maintenant } },
        orderBy: { nextAttemptAt: "asc" },
        select: { nextAttemptAt: true },
      }),
    ]);
    return {
      enAttente,
      echecs,
      retardMs: plusAncien ? Math.max(0, maintenant.getTime() - plusAncien.nextAttemptAt.getTime()) : 0,
    };
  },
};
