import { createClient } from "redis";
import { logger } from "../config/logger";

/**
 * Où limiterCadence garde ses compteurs.
 *
 * - mémoire : par processus, suffisant pour le développement ;
 * - Redis : partagé entre les instances, dès que REDIS_URL est défini. Sans
 *   lui, la limite serait multipliée par le nombre d'instances.
 *
 * En production, les appelants refusent les opérations si Redis ne répond pas.
 * Le repli mémoire est réservé au développement et aux tests.
 */
export interface Stockage {
  /** Compte un appel dans la fenêtre de `cle` ; rend le total et l'instant où elle se rouvre. */
  incrementer(cle: string, fenetreMs: number): Promise<{ compte: number; reprendLe: number }>;
  reinitialiser(cle: string): Promise<void>;
}

export class StockageMemoire implements Stockage {
  private compteurs = new Map<string, { compte: number; reprendLe: number }>();

  async reinitialiser(cle: string) { this.compteurs.delete(cle); }

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

/** Un script atomique évite une clé sans expiration après un crash. */
export interface CommandesRedis {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  del(cle: string): Promise<unknown>;
}

const INCREMENTER = `
local total = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {total, ttl}
`;

export class StockageRedis implements Stockage {
  constructor(private client: CommandesRedis) {}

  async reinitialiser(cle: string) { await this.client.del(cle); }

  async incrementer(cle: string, fenetreMs: number) {
    const [compte, reste] = await this.client.eval(INCREMENTER, {
      keys: [cle], arguments: [String(fenetreMs)],
    }) as [number, number];
    return { compte: Number(compte), reprendLe: Date.now() + Number(reste) };
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
      logger.error("Limitation de cadence : incident Redis", {
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
