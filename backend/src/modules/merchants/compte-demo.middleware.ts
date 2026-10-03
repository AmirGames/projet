import { Request, Response, NextFunction } from "express";

import { cheminDecode, sousChemin } from "../../utils/chemin";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { verifyToken } from "../auth/auth.middleware";
import { DemoMerchantService, empreinteVisiteur } from "./demo.service";

/**
 * Le compte démo peut tout essayer sauf ce qui sortirait de la démonstration.
 *
 * Tout le monde s'y connecte avec les mêmes identifiants : ce qui touche au
 * réel — coordonnées bancaires, pièces justificatives, envois aux clients,
 * équipe, messages au support, fichiers, mot de passe — est fermé en écriture.
 * La lecture reste libre partout ; catalogue, boutiques, commandes et horaires
 * restent modifiables, puisque c'est ce qu'on vient essayer.
 *
 * Chaque requête du compte démo note aussi que le visiteur est là (voir
 * DemoMerchantService.noterActivite) : c'est ce qui décide qu'il est parti.
 */
const CHEMINS_FERMES_EN_ECRITURE = [
  "/api/merchant-profile",
  "/api/merchant-payouts",
  "/api/payments",
  "/api/payment-methods",
  "/api/marketing",
  "/api/staff",
  "/api/support",
  "/api/files",
  "/api/organizations",
  "/api/push-devices",
  "/api/auth/change-password",
  "/api/auth/me/become-merchant",
  "/api/auth/me/become-driver",
];

const LECTURE = new Set(["GET", "HEAD", "OPTIONS"]);

// Un utilisateur ne change pas de commerce d'une requête à l'autre : on ne
// relit pas la base à chaque appel.
const DUREE_CACHE_MS = 60000;
const cache = new Map<string, { orgId: string | null; expireA: number }>();

/** Le commerce de démo de ce compte, ou null si ce n'est pas le compte démo. */
async function commerceDemo(userId: string): Promise<string | null> {
  const connu = cache.get(userId);
  if (connu && Date.now() < connu.expireA) return connu.orgId;

  try {
    const lien = await db.membership.findFirst({
      where: { userId, org: { isDemo: true } },
      select: { orgId: true },
    });
    const orgId = lien?.orgId ?? null;
    cache.set(userId, { orgId, expireA: Date.now() + DUREE_CACHE_MS });
    return orgId;
  } catch (err) {
    // Une panne de base ne doit pas bloquer le trafic : les routes échoueront
    // d'elles-mêmes. Pas de mise en cache, on réessaiera.
    logger.error("Compte démo illisible", { userId, error: err instanceof Error ? err.message : err });
    return null;
  }
}

export async function compteDemo(req: Request, res: Response, next: NextFunction) {
  const cheminRequete = cheminDecode(req.path);
  const entete = req.headers.authorization;
  if (!entete?.startsWith("Bearer ")) return next();

  let charge;
  try {
    charge = verifyToken(entete.slice(7));
  } catch {
    // Jeton illisible : c'est au middleware d'authentification de le dire.
    return next();
  }

  if (!charge?.userId) return next();

  const orgId = await commerceDemo(charge.userId);
  if (!orgId) return next();

  // Le visiteur est là : la démo ne sera pas jugée abandonnée.
  void DemoMerchantService.noterActivite(orgId, empreinteVisiteur(req)).catch((err) =>
    logger.warn("Activité du compte démo non notée", { error: err instanceof Error ? err.message : err })
  );

  if (LECTURE.has(req.method)) return next();
  if (!CHEMINS_FERMES_EN_ECRITURE.some((chemin) => sousChemin(cheminRequete, chemin))) return next();

  return res.status(403).json({
    error: "Indisponible dans le compte de démonstration.",
    code: "DEMO_ACCOUNT",
  });
}
