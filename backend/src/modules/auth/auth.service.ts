import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getEnv } from "../../config/env";
import { ApiError } from "../../middleware/errorHandler";

export interface JwtPayload {
  userId: string;
  /** La session de connexion (SessionConnexion) : absente des jetons émis avant le SSO. */
  sid?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshPayload {
  userId: string;
  sid?: string;
  /** Identifiant du jeton (rotation) : absent des jetons émis avant la rotation. */
  jti?: string;
  iat?: number;
  exp?: number;
}

export class AuthService {
  private static chargeValide(decoded: string | jwt.JwtPayload, dureeMax: number): boolean {
    return typeof decoded === "object" && typeof decoded.userId === "string" && decoded.userId.length > 0 &&
      Number.isInteger(decoded.iat) && Number.isInteger(decoded.exp) &&
      decoded.exp! > decoded.iat! && decoded.exp! - decoded.iat! <= dureeMax &&
      decoded.iat! <= Math.floor(Date.now() / 1000) &&
      (decoded.sid === undefined || (typeof decoded.sid === "string" && decoded.sid.length > 0));
  }
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate access token (JWT)
   */
  static generateAccessToken(userId: string, sid?: string): string {
    const env = getEnv();
    const token = (jwt.sign as any)(sid ? { userId, sid } : { userId }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
      algorithm: "HS256",
    });
    return token;
  }

  /**
   * Generate refresh token (JWT)
   */
  static generateRefreshToken(userId: string, sid?: string, jti?: string): string {
    const env = getEnv();
    const charge: Record<string, string> = { userId };
    if (sid) charge.sid = sid;
    if (jti) charge.jti = jti;
    const token = (jwt.sign as any)(charge, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      algorithm: "HS256",
    });
    return token;
  }

  /**
   * Verify and decode access token
   */
  static verifyAccessToken(token: string): JwtPayload {
    const env = getEnv();
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
      if (!this.chargeValide(decoded, 15 * 60)) {
        throw new jwt.JsonWebTokenError("Invalid access token claims");
      }
      return decoded as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, "Token expired", "TOKEN_EXPIRED");
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, "Invalid token", "INVALID_TOKEN");
      }
      throw err;
    }
  }

  /**
   * Verify and decode refresh token
   */
  static verifyRefreshToken(token: string): RefreshPayload {
    const env = getEnv();
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        algorithms: ["HS256"],
      });
      if (!this.chargeValide(decoded, 7 * 24 * 60 * 60)) {
        throw new jwt.JsonWebTokenError("Invalid refresh token claims");
      }
      return decoded as RefreshPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, "Refresh token expired", "REFRESH_TOKEN_EXPIRED");
      }
      throw new ApiError(401, "Invalid refresh token", "INVALID_REFRESH_TOKEN");
    }
  }
}
