import { Router, Request, Response, NextFunction } from "express";
import { signupSchema, loginSchema, refreshTokenSchema } from "../utils/validation.js";
import { AuthService } from "../services/auth.service.js";
import { UserService } from "../services/user.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";
import { generateSlug } from "../utils/validation.js";

const router = Router();

// POST /auth/signup
router.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body);

    logger.info("Signup attempt", { email: body.email });

    // Create user
    const user = await UserService.createUser(body.email, body.password, body.name);

    // Create default organization for user
    const slug = generateSlug(body.name || body.email.split("@")[0]);
    const org = await UserService.createOrganization(
      body.name || body.email.split("@")[0],
      slug,
      user.id
    );

    // Generate tokens
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: org.id,
      storeIds: [],
      role: "ADMIN",
    });

    const refreshToken = AuthService.generateRefreshToken(user.id);

    res.status(201).json({
      message: "Compte créé avec succès",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
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

    // Find user
    const user = await UserService.getUserByEmail(body.email);

    // Verify password
    const isPasswordValid = await AuthService.comparePassword(body.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    // Get user's organizations
    const memberships = await UserService.getUserOrganizations(user.id);

    if (memberships.length === 0) {
      throw new ApiError(400, "User has no organization", "NO_ORGANIZATION");
    }

    const primaryMembership = memberships[0];
    const storeIds = primaryMembership.org.stores.map((s) => s.id);

    // Generate tokens
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: primaryMembership.org.id,
      storeIds,
      role: primaryMembership.role as any,
    });

    const refreshToken = AuthService.generateRefreshToken(user.id);

    res.json({
      message: "Connexion réussie",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organization: {
        id: primaryMembership.org.id,
        name: primaryMembership.org.name,
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

    // Get updated user info and orgs
    const user = await UserService.getUserById(decoded.userId);
    const memberships = await UserService.getUserOrganizations(decoded.userId);

    if (memberships.length === 0) {
      throw new ApiError(400, "User has no organization", "NO_ORGANIZATION");
    }

    const primaryMembership = memberships[0];
    const storeIds = primaryMembership.org.stores.map((s) => s.id);

    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: primaryMembership.org.id,
      storeIds,
      role: primaryMembership.role as any,
    });

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me - Get current user (requires auth)
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const user = await UserService.getUserById(userId);
    const memberships = await UserService.getUserOrganizations(userId);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      organizations: memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        role: m.role,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;