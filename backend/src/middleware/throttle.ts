import { createHash } from "crypto";
import { SecurityEventService } from "../modules/auth/security-event.service";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "./errorHandler";
import { Stockage, StockageMemoire, stockageRedis } from "./throttle-stockage";

/**
 * Limitation de cadence.
 *
 * Elle protège les routes qui envoient un courriel : sans elle, n'importe qui
 * peut faire expédier des centaines de messages à une adresse qui ne lui
 * appartient pas, et faire classer le domaine comme indésirable.
 *
 * Les compteurs vivent dans Redis quand REDIS_URL est défini (partagés entre
 * les instances). En développement uniquement, la mémoire suffit. En production,
 * sans compteur partagé prêt, l'appel est refusé (503). Une
 * attaque distribuée relève du pare-feu applicatif, en amont.
 */

interface Options {
  max: number;
  fenetreMs: number;
  message?: string;
  /**
   * Ce que la limite compte. Chaque route doit le dire : une clé qui retombe
   * sur la seule adresse IP met tous les appels dans le même seau, et derrière
   * un proxy — où toutes les requêtes portent la même IP — bloque les
   * utilisateurs légitimes les uns après les autres.
   */
  cle: (req: Request) => string;
  /**
   * Lu à chaque requête, pas au chargement du module : les variables
   * d'environnement ne sont pas forcément chargées à ce moment-là.
   */
  active?: () => boolean;
  /** Nom stable du limiteur, pour ses clés Redis (par défaut : son rang de création). */
  nom?: string;
  /** Stockage imposé (tests). Par défaut : Redis si REDIS_URL est défini, sinon la mémoire. */
  stockage?: Stockage;
}

/** Par destinataire toutes IP confondues ; le limiteur IP complète ce budget. */
export const parDestinataire = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return email || req.ip || "inconnue";
};

let numero = 0;

export function limiterCadence(options: Options) {
  // Chaque limiteur a son espace : sans préfixe, deux routes qui comptent la
  // même clé (la même IP) partageraient leur compteur dans Redis.
  const espace = `rl:${options.nom ?? ++numero}:`;
  const memoire = new StockageMemoire();

  const cleDe = (req: Request) => espace + createHash("sha256").update(options.cle(req)).digest("hex");
  const choisirStockage = () => {
    const partage = options.stockage ?? stockageRedis();
    if (!partage && process.env.NODE_ENV === "production") {
      throw new ApiError(503, "Protection de sécurité temporairement indisponible", "SECURITY_UNAVAILABLE");
    }
    return partage ?? memoire;
  };

  const middleware = async (req: Request, res: Response, next: NextFunction) => {
    if (options.active && !options.active()) return next();
    let fenetre: { compte: number; reprendLe: number };
    try {
      fenetre = await choisirStockage().incrementer(cleDe(req), options.fenetreMs);
    } catch {
      if (process.env.NODE_ENV === "production") {
        return next(new ApiError(503, "Protection de sécurité temporairement indisponible", "SECURITY_UNAVAILABLE"));
      }
      fenetre = await memoire.incrementer(cleDe(req), options.fenetreMs);
    }
    if (fenetre.compte > options.max) {
      const secondes = Math.max(1, Math.ceil((fenetre.reprendLe - Date.now()) / 1000));
      res.setHeader?.("Retry-After", String(secondes));
      if (fenetre.compte === options.max + 1 || fenetre.compte === options.max + 10) {
        const recidive = fenetre.compte === options.max + 10;
        SecurityEventService.record({
          action: recidive ? "BRUTEFORCE_RECURRENCE" : "RATE_LIMIT_BLOCKED",
          actor: req.userId || "anonymous", target: espace,
          severity: recidive ? "HIGH" : "MEDIUM", status: "FAILED",
          ipAddress: req.ip, details: `Limite atteinte (${options.max}); blocage ${secondes}s`,
        });
        if (recidive && process.env.NODE_ENV !== "test") {
          // Aucun contenu du client n'entre dans le courriel d'alerte.
          void import("../modules/monitoring/vigie.service").then(({ prevenirPlateforme }) =>
            prevenirPlateforme({ sujet: "Alerte sécurité : tentatives répétées",
              texte: "Des tentatives répétées ont été bloquées. Consultez le journal de sécurité.",
              chemin: "/superowner/security-audit", bouton: "Journal de sécurité" })
          ).catch(() => undefined);
        }
      }
      return next(new ApiError(429, options.message || `Trop de tentatives. Réessayez dans ${secondes} secondes.`, "TOO_MANY_REQUESTS"));
    }
    next();
  };
  middleware.reinitialiser = async (req: Request) => {
    await choisirStockage().reinitialiser(cleDe(req));
    await memoire.reinitialiser(cleDe(req));
  };
  return middleware;
}

/** Cinq échecs consécutifs par compte, toutes IP confondues, blocage 15 minutes.
 * Les essais sont réservés avant bcrypt et effacés après une connexion réussie.
 */
export const limiterConnexions = limiterCadence({
  nom: "login-account", max: 5, fenetreMs: 15 * 60 * 1000,
  message: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
  cle: (req) => typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "inconnue",
});

/** Le compteur IP+destinataire seul se contourne en changeant d'adresse. */
export const limiterAuthParIp = limiterCadence({
  nom: 'auth-ip', max: 50, fenetreMs: 15 * 60 * 1000,
  cle: (req) => req.ip || 'inconnue',
});
export const limiterCourrielsParIp = limiterCadence({
  nom: 'courriels-ip', max: 20, fenetreMs: 15 * 60 * 1000,
  cle: (req) => req.ip || 'inconnue',
});

/**
 * Inscriptions : dix comptes par heure et par adresse IP, tous formulaires
 * confondus — client, commerçant et livreur partagent ce même compteur, sinon
 * il suffirait de passer d'un formulaire à l'autre.
 *
 * Seulement en production : les vérifications créent des centaines de
 * comptes depuis la même machine, et une limite qui les ferait échouer
 * finirait désactivée pour de bon.
 */
export const limiterInscriptions = limiterCadence({
  max: 10,
  fenetreMs: 60 * 60 * 1000,
  message: "Trop de comptes créés depuis cette connexion. Réessayez plus tard.",
  cle: (req) => req.ip || "inconnue",
  active: () => process.env.NODE_ENV === "production",
});

/** Webhook avant lecture du corps : budget dédié, sans bloquer les routes d'auth. */
export const limiterStripeWebhook = limiterCadence({
  nom: "stripe-webhook", max: 300, fenetreMs: 60_000,
  cle: (req) => req.ip || "inconnue",
});

/** Accusés de notification ZupDrive : budget propre, pour ne pas entamer celui du webhook Stripe. */
export const limiterWebhookNotificationsDrive = limiterCadence({
  nom: "zupdrive-notifications-webhook", max: 300, fenetreMs: 60_000,
  cle: (req) => req.ip || "inconnue",
});

/** Budget commun aux appels publics coûteux, y compris les variantes d'URL. */
export const limiterApiPublique = limiterCadence({
  nom: "public-api", max: 120, fenetreMs: 60_000,
  cle: (req) => req.ip || "inconnue",
});

/** Recherche d'adresses : relais vers un fournisseur externe, rythme borné par IP. */
export const limiterAdresses = limiterCadence({
  nom: "adresses", max: 90, fenetreMs: 60_000,
  cle: (req) => req.ip || "inconnue",
});

/** Cartes et boutiques proches : une requête charge des boutiques, budget plus serré. */
export const limiterCartes = limiterCadence({
  nom: "cartes", max: 30, fenetreMs: 60_000,
  cle: (req) => req.ip || "inconnue",
});
