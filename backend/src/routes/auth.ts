import { Router, Request, Response, NextFunction } from "express";
import { signupSchema, loginSchema, refreshTokenSchema } from "../utils/validation.js";
import { AuthService } from "../services/auth.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { logger } from "../config/logger.js";

const router = Router();

// POST /auth/signup
router.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body);

    logger.info("Signup attempt", { email: body.email });

    const passwordHash = await AuthService.hashPassword(body.password);

    const accessToken = AuthService.generateAccessToken({
      userId: "user-123",
      orgId: "org-123",
      storeIds: [],
      role: "STORE_STAFF",
    });

    const refreshToken = AuthService.generateRefreshToken("user-123");

    res.status(201).json({
      message: "Compte créé avec succès",
      accessToken,
      refreshToken,
      user: {
        id: "user-123",
        email: body.email,
        name: body.name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    logger.info("Login attempt", { email: body.email });

    const isValid = true; // Dev mode

    if (!isValid) {
      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    const accessToken = AuthService.generateAccessToken({
      userId: "user-123",
      orgId: "org-123",
      storeIds: [],
      role: "STORE_STAFF",
    });

    const refreshToken = AuthService.generateRefreshToken("user-123");

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: "user-123",
        email: body.email,
        name: "John Doe",
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh
router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = refreshTokenSchema.parse(req.body);

    const decoded = AuthService.verifyRefreshToken(body.refreshToken);

    logger.info("Token refreshed", { userId: decoded.userId });

    const accessToken = AuthService.generateAccessToken({
      userId: decoded.userId,
      orgId: "org-123",
      storeIds: [],
      role: "STORE_STAFF",
    });

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

export default router;