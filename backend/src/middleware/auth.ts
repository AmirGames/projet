import { Request, Response, NextFunction } from "express";
import { AuthService, JwtPayload } from "../services/auth.service";
import { ApiError } from "./errorHandler";
import { db } from "../services/db";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      orgId?: string;
      storeIds?: string[];
      role?: string;
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Missing or invalid authorization header", "MISSING_AUTH");
    }

    const token = authHeader.slice(7);
    const payload = AuthService.verifyAccessToken(token);

    req.userId = payload.userId;
    req.orgId = payload.orgId;
    req.storeIds = payload.storeIds;
    req.role = payload.role;
    req.user = payload;

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
