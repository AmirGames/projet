import { Request, Response, NextFunction } from "express";
import { AuthService, JwtPayload } from "../services/auth.service";
import { ApiError } from "./errorHandler";
import { db } from "../services/db";

/** Ce que le jeton ne dit pas : le compte existe-t-il encore, et qu'est-il. */
export interface Compte {
  id: string;
  isSuperOwner: boolean;
  isSystemAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      orgId?: string;
      storeIds?: string[];
      role?: string;
      user?: JwtPayload;
      /** Le compte derrière le jeton, lu une fois par requête. */
      compte?: Compte;
    }
  }
}

/**
 * Le compte derrière un jeton.
 *
 * Un jeton reste valable jusqu'à son échéance, même si le compte a disparu
 * entre-temps — base remise à zéro, utilisateur supprimé. Les routes tombaient
 * alors sur des refus trompeurs : « User not found » en 404 sur `/auth/me`,
 * « Accès refusé » en 403 sur l'espace d'administration, là où le compte
 * n'existait simplement plus. Le navigateur, lui, n'y voyait pas une session à
 * refaire, et réessayait.
 *
 * Gardé trente secondes : la même requête traverse plusieurs contrôles qui ont
 * tous besoin de cette réponse.
 */
const DUREE_CACHE_MS = 30000;
const comptes = new Map<string, { compte: Compte | null; expireA: number }>();

export function oublierCompte(userId: string) {
  comptes.delete(userId);
}

export async function compteDuJeton(userId: string): Promise<Compte | null> {
  const connu = comptes.get(userId);
  if (connu && Date.now() < connu.expireA) return connu.compte;

  const utilisateur = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperOwner: true, isSystemAdmin: true },
  });

  comptes.set(userId, { compte: utilisateur ?? null, expireA: Date.now() + DUREE_CACHE_MS });

  return utilisateur ?? null;
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Missing or invalid authorization header", "MISSING_AUTH");
    }

    const token = authHeader.slice(7);
    const payload = AuthService.verifyAccessToken(token);

    // Un jeton signé pour un compte qui n'existe plus n'est pas une permission
    // manquante : c'est une session à refaire, et le dire en 401 est la seule
    // façon pour le navigateur de le comprendre.
    const compte = await compteDuJeton(payload.userId);

    if (!compte) {
      throw new ApiError(
        401,
        "Votre session n'est plus valable. Reconnectez-vous.",
        "SESSION_INVALIDE"
      );
    }

    req.userId = payload.userId;
    // orgId, storeIds, and role are no longer in JWT; routes must load them from DB
    req.user = payload;
    req.compte = compte;

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.role || !roles.includes(req.role)) {
      return next(new ApiError(403, "Insufficient permissions", "FORBIDDEN"));
    }
    next();
  };
}

export function requireStore(req: Request, _res: Response, next: NextFunction) {
  const storeId = req.query.storeId as string;

  if (!storeId || !req.storeIds?.includes(storeId)) {
    return next(new ApiError(403, "Store access denied", "STORE_ACCESS_DENIED"));
  }

  next();
}

export function verifyToken(token: string) {
  return AuthService.verifyAccessToken(token);
}

export async function checkOrgStatus(req: Request, _res: Response, next: NextFunction) {
  try {
    const orgId = req.orgId;
    if (!orgId) {
      return next(new ApiError(401, "Organisation non identifiée", "MISSING_ORG"));
    }

    const org = await db.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      return next(new ApiError(404, "Organisation non trouvée", "NOT_FOUND"));
    }

    if (org.status === "SUSPENDED") {
      return next(new ApiError(403, "Ce compte est temporairement suspendu", "ACCOUNT_SUSPENDED"));
    }

    if (org.status === "CLOSED") {
      return next(new ApiError(403, "Ce compte est fermé", "ACCOUNT_CLOSED"));
    }

    next();
  } catch (err) {
    next(err);
  }
}
