import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { signupSchema, loginSchema, refreshTokenSchema } from "../utils/validation";
import { AuthService } from "../services/auth.service";
import { UserService } from "../services/user.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";
import { generateSlug } from "../utils/validation";
import { db } from "../services/db";

const router = Router();

// POST /auth/signup
router.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = signupSchema.parse(req.body);

    logger.info("Signup attempt", { email: body.email });

    // Check if this is the first user
    const userCount = await db.user.count();
    const isFirstUser = userCount === 0;

    // Create user with super owner flag if first
    const passwordHash = await AuthService.hashPassword(body.password);
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        isSuperOwner: isFirstUser,
        isSystemAdmin: isFirstUser,
      },
    });

    if (isFirstUser) {
      logger.info("First user created - marked as Super Owner", { userId: user.id });
    }

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
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
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
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
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
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
      },
      organizations: memberships.map((m) => ({
        id: m.org.id,
        name: m.org.name,
        role: m.role,
        status: m.org.status,
        suspensionReason: m.org.suspensionReason,
        closureReason: m.org.closureReason,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/merchant-register - Merchant registration with automatic store creation
router.post("/merchant-register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      businessName: z.string().min(1).max(200),
      email: z.string().email(),
      password: z.string().min(8),
      businessType: z.string().min(1).max(50),
      phone: z.string().min(1).max(20),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      website: z.string().url().optional().nullable(),
      description: z.string().min(1).max(1000),
      storeName: z.string().min(1).max(200),
      storeSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
    });

    const body = schema.parse(req.body);

    logger.info("Merchant registration attempt", { email: body.email, businessName: body.businessName });

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      throw new ApiError(400, "Cet email est déjà utilisé", "EMAIL_EXISTS");
    }

    // Check if organization slug exists
    const existingOrg = await db.organization.findUnique({
      where: { slug: body.storeSlug },
    });

    if (existingOrg) {
      throw new ApiError(400, "Cette URL est déjà utilisée", "SLUG_EXISTS");
    }

    // Hash password
    const passwordHash = await AuthService.hashPassword(body.password);

    // Check if this is the first user
    const userCount = await db.user.count();
    const isFirstUser = userCount === 0;

    // Create user with super owner flag if first
    const user = await db.user.create({
      data: {
        email: body.email,
        name: body.businessName,
        passwordHash,
        emailVerified: false,
        status: "ACTIVE",
        isSuperOwner: isFirstUser,
        isSystemAdmin: isFirstUser,
      },
    });

    if (isFirstUser) {
      logger.info("First merchant user created - marked as Super Owner", { userId: user.id });
    }

    // Create organization
    const organization = await db.organization.create({
      data: {
        name: body.businessName,
        email: body.email,
        slug: body.storeSlug,
        tier: "FREE",
        plan: "STARTER",
        status: "ACTIVE",
      },
    });

    // Create membership
    await db.membership.create({
      data: {
        userId: user.id,
        orgId: organization.id,
        role: "ADMIN",
        storeIds: [],
      },
    });

    // Create store
    const store = await db.store.create({
      data: {
        orgId: organization.id,
        name: body.storeName,
        slug: body.storeSlug,
        address: body.address,
        city: body.city,
        postalCode: body.postalCode,
        phone: body.phone,
        email: body.email,
        description: body.description,
        settings: {
          businessType: body.businessType,
          website: body.website || null,
          createdAt: new Date().toISOString(),
        },
      },
    });

    // Update membership with store ID
    await db.membership.update({
      where: {
        userId_orgId: {
          userId: user.id,
          orgId: organization.id,
        },
      },
      data: {
        storeIds: [store.id],
      },
    });

    // Generate tokens
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: organization.id,
      storeIds: [store.id],
      role: "ADMIN",
    });

    const refreshToken = AuthService.generateRefreshToken(user.id);

    logger.info("Merchant registered successfully", {
      userId: user.id,
      organizationId: organization.id,
      storeId: store.id,
    });

    res.status(201).json({
      message: "Inscription réussie et boutique créée!",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        url: `/store/${store.slug}`,
      },
      organizationId: organization.id,
    });
  } catch (err) {
    next(err);
  }
});

export default router;