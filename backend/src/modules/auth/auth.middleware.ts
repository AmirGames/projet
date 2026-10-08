import { Request, Response, NextFunction } from "express";
import { AuthService, JwtPayload } from "./auth.service";
import { ApiError } from "../../middleware/errorHandler";
import { db } from "../../services/db";
import { SsoService } from "./sso.service";
import type { Acces } from "./permissions-plateforme.service";
import { lierIdentite } from "./origine";

/** Ce que le jeton ne dit pas : le compte existe-t-il encore, et qu'est-il. */
export interface Compte {
  id: string;
  isSuperOwner: boolean;
  isSystemAdmin: boolean;
  /** Rôle dans l'équipe, sur chaque plateforme où il en a un. */
  acces: Acces;
  /** Dernier changement de mot de passe, en secondes (comme `iat`). */
  motDePasseChangeA?: number | null;
}

declare global {
  // Seul moyen de compléter `Request` d'Express.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      /** Email de l'administrateur, posé par `isSuperOwner` pour les journaux. */
      actorEmail?: string;
      /** Identifiant de socket du client, s'il est posé par un middleware de temps réel. */
      socketId?: string;
      orgId?: string;
      storeIds?: string[];
      role?: string;
      user?: JwtPayload;
      /** Le compte derrière le jeton, lu une fois par requête. */
      compte?: Compte;
    }
  }
}

/** Les droits et l'existence du compte sont relus sans cache inter-requêtes. */
export function oublierCompte(_userId: string) {
  // Conservé pour les appelants historiques ; aucun droit n'est mis en cache.
}

// Compatibilité avec les lectures sensibles : le compte est toujours relu en base.
export async function compteDuJeton(userId: string, _fresh = false): Promise<Compte | null> {
  const utilisateur = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperOwner: true,
      isSystemAdmin: true,
      accesEquipe: { select: { plateforme: true, role: true } },
      passwordChangedAt: true,
      status: true,
    },
  });

  const compte: Compte | null = utilisateur && (!utilisateur.status || utilisateur.status === "ACTIVE")
    ? {
        id: utilisateur.id,
        isSuperOwner: utilisateur.isSuperOwner,
        isSystemAdmin: utilisateur.isSystemAdmin,
        acces: Object.fromEntries(utilisateur.accesEquipe.map((a) => [a.plateforme, a.role])),
        motDePasseChangeA: utilisateur.passwordChangedAt
          ? Math.floor(utilisateur.passwordChangedAt.getTime() / 1000)
          : null,
      }
    : null;

  return compte;
}

/**
 * Un jeton émis avant le dernier changement de mot de passe appartient à une
 * session que ce changement devait fermer.
 */
export function jetonPerime(compte: Compte, iat: number | undefined): boolean {
  if (compte.motDePasseChangeA == null) return false;
  return iat === undefined || iat < compte.motDePasseChangeA;
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    await authentifier(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Jeton facultatif : un compte connecté est reconnu, un visiteur passe sans.
 *
 * Un jeton absent, expiré ou invalide ne bloque rien — la route se comporte
 * comme pour un visiteur (`req.userId` reste vide).
 */
export async function authFacultative(req: Request, _res: Response, next: NextFunction) {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    try {
      await authentifier(req);
    } catch {
      // Visiteur.
    }
  }
  next();
}

/** Vérifie le jeton de la requête et y range le compte, ou lève une 401. */
async function authentifier(req: Request) {
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

  if (!compte || jetonPerime(compte, payload.iat)) {
    throw new ApiError(
      401,
      "Votre session n'est plus valable. Reconnectez-vous.",
      "SESSION_INVALIDE"
    );
  }

  // Une session fermée — déconnexion, sur ce domaine ou un autre — ne vaut
  // plus nulle part. Les jetons émis avant le SSO n'en portent pas : ils
  // échappent à la déconnexion, donc refusés en production.
  const sansSession = !payload.sid && process.env.NODE_ENV !== "test";
  if (sansSession || (payload.sid && !(await SsoService.sessionActive(payload.sid)))) {
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
  lierIdentite(payload.userId, payload.sid);
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
    // Load orgId from request body or query if not in JWT
    let orgId = req.orgId || (req.body?.orgId as string) || (req.query?.orgId as string);

    // If still no orgId, try to load it from storeId
    if (!orgId) {
      const storeId = (req.body?.storeId || req.query?.storeId) as string;
      if (storeId) {
        const store = await db.store.findUnique({
          where: { id: storeId },
          select: { orgId: true },
        });
        if (store) {
          orgId = store.orgId;
        }
      }
    }

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
