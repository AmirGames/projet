import type { Request } from "express";
import { ApiError } from "../../middleware/errorHandler";

/** L'identifiant du compte connecté ; les routes qui l'exigent sont déjà derrière `authMiddleware`. */
export function userIdRequis(req: Request): string {
  if (!req.userId) throw new ApiError(401, "Non authentifié", "NOT_AUTHENTICATED");
  return req.userId;
}
