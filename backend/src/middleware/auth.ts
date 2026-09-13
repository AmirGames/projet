import { Request, Response, NextFunction } from "express";
import { AuthService, JwtPayload } from "../services/auth.service";
import { ApiError } from "./errorHandler";

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
