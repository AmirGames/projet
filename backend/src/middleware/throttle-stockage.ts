import { createClient } from "redis";
import { logger } from "../config/logger";

/**
 * Où limiterCadence garde ses compteurs.
 *
 * - mémoire : par processus, suffisant pour le développement ;
 * - Redis : partagé entre les instances, dès que REDIS_URL est défini. Sans
 *   lui, la limite serait multipliée par le nombre d'instances.
 *
 * Si Redis ne répond pas, la requête retombe sur la mémoire : mieux vaut une
 * limite par instance que pas de limite, ou un site qui refuse tout.
 */
export interface Stockage {
  /** Compte un appel dans la fenêtre de `cle` ; rend le total et l'instant où elle se rouvre. */
  incrementer(cle: string, fenetreMs: number): Promise<{ compte: number; reprendLe: number }>;
}

export class StockageMemoire implements Stockage {
  private compteurs = new Map<string, { compte: number; reprendLe: number }>();

  async incrementer(cle: string, fenetreMs: number) {
    const maintenant = Date.now();

    // Sans purge, la table grandit indéfiniment au fil des adresses vues.
    if (this.compteurs.size > 5000) {
      for (const [k, f] of this.compteurs) if (f.reprendLe <= maintenant) this.compteurs.delete(k);
    }

    const fenetre = this.compteurs.get(cle);
    if (!fenetre || fenetre.reprendLe <= maintenant) {
      const neuve = { compte: 1, reprendLe: maintenant + fenetreMs };
      this.compteurs.set(cle, neuve);
      return neuve;
    }
    fenetre.compte++;
    return fenetre;
  }
}

/** Ce que le stockage utilise du client Redis (plus simple à simuler). */
export interface CommandesRedis {
  incr(cle: string): Promise<number>;
  pExpire(cle: string, ms: number): Promise<unknown>;
  pTTL(cle: string): Promise<number>;
}

export class StockageRedis implements Stockage {
  constructor(private client: CommandesRedis) {}

  async incrementer(cle: string, fenetreMs: number) {
    const compte = await this.client.incr(cle);
    if (compte === 1) await this.client.pExpire(cle, fenetreMs);
    let reste = await this.client.pTTL(cle);
    if (reste < 0) {
      // Clé sans échéance (crash entre INCR et PEXPIRE) : on la remet.
      await this.client.pExpire(cle, fenetreMs);
      reste = fenetreMs;
    }
    return { compte, reprendLe: Date.now() + reste };
  }
}

let redis: { pret: () => boolean; stockage: StockageRedis } | null = null;
let tente = false;

/** Le stockage Redis, ou null (REDIS_URL absent, connexion pas prête). */
export function stockageRedis(): StockageRedis | null {
  const url = process.env.REDIS_URL;
  if (!url || process.env.NODE_ENV === "test") return null;

  if (!tente) {
    tente = true;
    const client = createClient({
      url,
      socket: { reconnectStrategy: (essais) => Math.min(essais * 500, 5000) },
    });
    let signale = false;
    client.on("error", (err) => {
      if (signale) return;
      signale = true;
      logger.error("Limitation de cadence : incident Redis, repli sur la mémoire", {
        error: err instanceof Error ? err.message : err,
      });
    });
    client.on("ready", () => {
      signale = false;
    });
    client.connect().catch(() => undefined);
    redis = { pret: () => client.isReady, stockage: new StockageRedis(client) };
  }

  return redis && redis.pret() ? redis.stockage : null;
}
