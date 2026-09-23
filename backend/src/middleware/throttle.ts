import { Request, Response, NextFunction } from "express";
import { ApiError } from "./errorHandler";

/**
 * Limitation de cadence, en mémoire.
 *
 * Elle protège les routes qui envoient un courriel : sans elle, n'importe qui
 * peut faire expédier des centaines de messages à une adresse qui ne lui
 * appartient pas, et faire classer le domaine comme indésirable.
 *
 * En mémoire signifie « par processus » : derrière plusieurs instances, la
 * limite est multipliée d'autant. C'est suffisant contre un abus ordinaire,
 * pas contre une attaque distribuée — celle-ci relève du pare-feu applicatif,
 * en amont.
 */

interface Fenetre {
  compte: number;
  reprendLe: number;
}

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
}

/** Par adresse IP et par destinataire, pour les routes qui envoient un courriel. */
export const parDestinataire = (req: Request) => {
  const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
  // L'IP seule laisserait un client bloquer tout un réseau partagé ;
  // l'adresse seule laisserait un attaquant tourner sur des milliers d'adresses.
  return `${req.ip}|${email}`;
};

export function limiterCadence(options: Options) {
  const compteurs = new Map<string, Fenetre>();

  // Sans purge, la table grandit indéfiniment au fil des adresses vues.
  const purger = (maintenant: number) => {
    for (const [cle, fenetre] of compteurs) {
      if (fenetre.reprendLe <= maintenant) compteurs.delete(cle);
    }
  };

  return (req: Request, _res: Response, next: NextFunction) => {
    if (options.active && !options.active()) return next();

    const maintenant = Date.now();

    if (compteurs.size > 5000) purger(maintenant);

    const cle = options.cle(req);
    const fenetre = compteurs.get(cle);

    if (!fenetre || fenetre.reprendLe <= maintenant) {
      compteurs.set(cle, { compte: 1, reprendLe: maintenant + options.fenetreMs });
      return next();
    }

    fenetre.compte++;

    if (fenetre.compte > options.max) {
      const secondes = Math.ceil((fenetre.reprendLe - maintenant) / 1000);

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
