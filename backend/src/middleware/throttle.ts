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
 * les instances), sinon en mémoire — « par processus » : la limite est alors
 * multipliée par le nombre d'instances, ce qui suffit en développement. Une
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

/** Par adresse IP et par destinataire, pour les routes qui envoient un courriel. */
export const parDestinataire = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
  // L'IP seule laisserait un client bloquer tout un réseau partagé ;
  // l'adresse seule laisserait un attaquant tourner sur des milliers d'adresses.
  return `${req.ip}|${email}`;
};

let numero = 0;

export function limiterCadence(options: Options) {
  // Chaque limiteur a son espace : sans préfixe, deux routes qui comptent la
  // même clé (la même IP) partageraient leur compteur dans Redis.
  const espace = `rl:${options.nom ?? ++numero}:`;
  const memoire = new StockageMemoire();

  return async (req: Request, _res: Response, next: NextFunction) => {
    if (options.active && !options.active()) return next();

    const cle = options.cle(req);
    let fenetre: { compte: number; reprendLe: number };

    try {
      const partage = options.stockage ?? stockageRedis();
      fenetre = partage
        ? await partage.incrementer(espace + cle, options.fenetreMs)
        : await memoire.incrementer(cle, options.fenetreMs);
    } catch {
      // Redis a lâché en cours de route : la mémoire prend le relais.
      fenetre = await memoire.incrementer(cle, options.fenetreMs);
    }

    if (fenetre.compte > options.max) {
      const secondes = Math.max(1, Math.ceil((fenetre.reprendLe - Date.now()) / 1000));

      return next(
        new ApiError(
          429,
          options.message || `Trop de tentatives. Réessayez dans ${secondes} secondes.`,
          "TOO_MANY_REQUESTS"
        )
      );
    }

    next();
  };
}

/**
 * Connexion : dix essais par quart d'heure, par adresse IP et par compte.
 *
 * De quoi se tromper plusieurs fois de mot de passe sans être gêné, pas de
 * quoi en essayer des milliers. Compter par compte seul laisserait n'importe
 * qui bloquer la connexion d'un autre en tapant son adresse ; par IP seule,
 * un réseau partagé se bloquerait lui-même.
 */
export const limiterConnexions = limiterCadence({
  max: 10,
  fenetreMs: 15 * 60 * 1000,
  message: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
  cle: parDestinataire,
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
