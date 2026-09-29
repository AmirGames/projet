import { Request, Response, NextFunction } from "express";

import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { verifyToken } from "../auth/auth.middleware";

/**
 * Le compte démo peut tout essayer sauf ce qui sortirait de la démonstration.
 *
 * Tout le monde s'y connecte avec les mêmes identifiants : ce qui touche au
 * réel — coordonnées bancaires, pièces justificatives, envois aux clients,
 * équipe, messages au support, fichiers, mot de passe — est fermé en écriture.
 * La lecture reste libre partout ; catalogue, boutiques, commandes et horaires
 * restent modifiables, puisque c'est ce qu'on vient essayer.
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
const cache = new Map<string, { demo: boolean; expireA: number }>();

async function estCompteDemo(userId: string): Promise<boolean> {
  const connu = cache.get(userId);
  if (connu && Date.now() < connu.expireA) return connu.demo;

  try {
    const lien = await db.membership.findFirst({
      where: { userId, org: { isDemo: true } },
      select: { id: true },
    });
    const demo = Boolean(lien);
    cache.set(userId, { demo, expireA: Date.now() + DUREE_CACHE_MS });
    return demo;
  } catch (err) {
    // Une panne de base ne doit pas bloquer le trafic : les routes échoueront
    // d'elles-mêmes. Pas de mise en cache, on réessaiera.
    logger.error("Compte démo illisible", { userId, error: err instanceof Error ? err.message : err });
    return false;
  }
}

export async function compteDemo(req: Request, res: Response, next: NextFunction) {
  if (LECTURE.has(req.method)) return next();
  if (!CHEMINS_FERMES_EN_ECRITURE.some((chemin) => req.path.startsWith(chemin))) return next();

  const entete = req.headers.authorization;
  if (!entete?.startsWith("Bearer ")) return next();

  let charge;
  try {
    charge = verifyToken(entete.slice(7));
  } catch {
    // Jeton illisible : c'est au middleware d'authentification de le dire.
    return next();
  }

  if (!charge?.userId || !(await estCompteDemo(charge.userId))) return next();

  return res.status(403).json({
    error: "Indisponible dans le compte de démonstration.",
    code: "DEMO_ACCOUNT",
  });
}
