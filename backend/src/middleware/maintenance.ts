import { Request, Response, NextFunction } from "express";
import { db } from "../services/db";
import { logger } from "../config/logger";

// Le réglage est relu périodiquement : une requête en base à chaque appel
// d'API serait inutilement coûteuse pour une valeur qui change rarement.
const DUREE_CACHE_MS = 15000;

let cache: { actif: boolean; message: string; expireA: number } = {
  actif: false,
  message: "",
  expireA: 0,
};

// Restent joignables même en maintenance : la connexion et l'espace
// d'administration, sans quoi personne ne pourrait désactiver le mode.
const CHEMINS_AUTORISES = [
  "/health",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/me",
  "/api/superowner",
  "/api/admin",
  "/api/super-admin",
];

async function etatMaintenance() {
  if (Date.now() < cache.expireA) return cache;

  try {
    const config = await db.systemConfig.findFirst();
    cache = {
      actif: config?.maintenanceMode ?? false,
      message: config?.maintenanceMessage || "Plateforme en maintenance, merci de réessayer plus tard.",
      expireA: Date.now() + DUREE_CACHE_MS,
    };
  } catch (err) {
    // En cas d'incident base, ne pas bloquer le trafic.
    logger.error("Maintenance flag unreadable", {
      error: err instanceof Error ? err.message : err,
    });
    cache = { actif: false, message: "", expireA: Date.now() + DUREE_CACHE_MS };
  }

  return cache;
}

export function invalidateMaintenanceCache() {
  cache.expireA = 0;
}

export async function maintenanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const { actif, message } = await etatMaintenance();

  if (!actif) return next();

  if (CHEMINS_AUTORISES.some((chemin) => req.path.startsWith(chemin))) {
    return next();
  }

  return res.status(503).json({
    error: message,
    code: "MAINTENANCE_MODE",
    maintenance: true,
  });
}
