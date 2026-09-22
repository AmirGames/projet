import { Request, Response, NextFunction } from "express";

import { db } from "../services/db";
import { logger } from "../config/logger";
import { verifyToken } from "./auth";

/**
 * Un compte suspendu ou fermé ne garde qu'une porte : le support.
 *
 * Le contrôle existait — `checkOrgStatus` — mais n'était branché que sur trois
 * routes : créer une boutique, créer un produit, basculer sa disponibilité. Un
 * commerçant suspendu continuait donc à modifier ses produits, à traiter ses
 * commandes, à lire ses statistiques. La suspension ne suspendait rien.
 *
 * Le verrou est désormais posé une fois pour toutes, devant l'ensemble de
 * l'API, avec une liste blanche courte et explicite.
 */

/**
 * Ce qui reste ouvert à un compte restreint.
 *
 * Le support, pour dialoguer ; les notifications, pour recevoir les réponses ;
 * l'authentification, pour se connecter et se déconnecter. Rien d'autre.
 */
const CHEMINS_OUVERTS = [
  "/health",
  "/api/auth",
  "/api/support",
  "/api/notifications",
];

/**
 * Ce qu'un compte **suspendu** garde en plus : son dossier.
 *
 * Une suspension tient le plus souvent à ce qui manque — un justificatif, un
 * numéro de TVA, une coordonnée bancaire. Fermer au suspendu la page où il
 * complète tout cela fait de la suspension une impasse : le support lui dit
 * quoi faire, et il n'a nulle part où le faire. Il envoyait alors ses pièces
 * par courriel, hors du service, et personne ne les retrouvait.
 *
 * Rien de commercial ne passe par là : ni catalogue, ni prix, ni commandes.
 * Un compte **fermé**, lui, n'a plus de dossier à tenir : la porte reste
 * close.
 */
const CHEMINS_OUVERTS_SI_SUSPENDU = ["/api/merchant-profile"];

/**
 * Espaces qui ne dépendent pas d'un compte commerçant.
 *
 * La plateforme doit pouvoir lever une suspension qu'elle vient de poser, et
 * la vitrine publique décide elle-même de ce qu'elle montre d'une boutique
 * fermée.
 */
const CHEMINS_HORS_PORTEE = [
  "/api/superowner",
  "/api/admin",
  "/api/super-admin",
  "/api/client",
  "/api/drivers",
];

const MESSAGES: Record<string, { message: string; code: string }> = {
  SUSPENDED: {
    message:
      "Ce compte est suspendu. Vous pouvez échanger avec le support, qui vous indiquera la marche à suivre.",
    code: "ACCOUNT_SUSPENDED",
  },
  CLOSED: {
    message:
      "Ce compte est fermé. Seul le support reste joignable depuis votre espace.",
    code: "ACCOUNT_CLOSED",
  },
  INACTIVE: {
    message: "Ce compte est inactif. Contactez le support pour le réactiver.",
    code: "ACCOUNT_INACTIVE",
  },
};

// Le statut est relu souvent : une requête en base à chaque appel d'API
// coûterait cher pour une valeur qui change rarement. Quinze secondes, comme
// le mode maintenance — assez court pour que « en direct » reste vrai.
const DUREE_CACHE_MS = 15000;

const cache = new Map<string, { statut: string; expireA: number }>();

async function statutDuCompte(orgId: string): Promise<string> {
  const connu = cache.get(orgId);
  if (connu && Date.now() < connu.expireA) return connu.statut;

  try {
    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: { status: true },
    });

    const statut = organisation?.status || "ACTIVE";
    cache.set(orgId, { statut, expireA: Date.now() + DUREE_CACHE_MS });
    return statut;
  } catch (err) {
    // Un incident base ne doit pas bloquer tout le trafic : on laisse passer,
    // les routes elles-mêmes échoueront proprement.
    logger.error("Statut du commerçant illisible", {
      orgId,
      error: err instanceof Error ? err.message : err,
    });
    return "ACTIVE";
  }
}

/**
 * À appeler dès qu'un statut change, pour que l'effet soit immédiat.
 *
 * Sans cela, un commerçant suspendu gardait la main pendant la durée du cache,
 * et un compte réactivé restait bloqué tout aussi longtemps.
 */
export function oublierStatut(orgId: string) {
  cache.delete(orgId);
}

export function oublierTousLesStatuts() {
  cache.clear();
}

export async function compteRestreint(req: Request, res: Response, next: NextFunction) {
  if (CHEMINS_OUVERTS.some((chemin) => req.path.startsWith(chemin))) return next();
  if (CHEMINS_HORS_PORTEE.some((chemin) => req.path.startsWith(chemin))) return next();

  const entete = req.headers.authorization;
  if (!entete?.startsWith("Bearer ")) return next();

  let charge;
  try {
    charge = verifyToken(entete.slice(7));
  } catch {
    // Jeton illisible : ce n'est pas à ce garde-fou de le dire. Le middleware
    // d'authentification rendra son 401 un peu plus loin.
    return next();
  }

  if (!charge?.userId) return next();

  // La plateforme n'est pas un commerçant : elle doit pouvoir travailler même
  // sur un compte qu'elle vient de suspendre.
  const utilisateur = await db.user.findUnique({
    where: { id: charge.userId },
    select: { isSuperOwner: true, isSystemAdmin: true },
  });

  if (utilisateur?.isSuperOwner || utilisateur?.isSystemAdmin) return next();

  // Load user's organizations and check their status
  const memberships = await db.membership.findMany({
    where: { userId: charge.userId },
    select: { orgId: true },
  });

  // Check if any organization is suspended or closed
  for (const membership of memberships) {
    const statut = await statutDuCompte(membership.orgId);
    const refus = MESSAGES[statut];

    if (!refus) continue;

    if (
      statut === "SUSPENDED" &&
      CHEMINS_OUVERTS_SI_SUSPENDU.some((chemin) => req.path.startsWith(chemin))
    ) {
      continue;
    }

    return res.status(403).json({
      error: refus.message,
      code: refus.code,
      // La page a besoin de savoir quoi montrer, pas seulement qu'elle est
      // refusée : sans cela elle affiche une erreur muette.
      accountStatus: statut,
      supportOnly: true,
    });
  }

  return next();
}
