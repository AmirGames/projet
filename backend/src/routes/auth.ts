import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { signupSchema, loginSchema, refreshTokenSchema } from "../utils/validation";
import { AuthService } from "../services/auth.service";
import { UserService } from "../services/user.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware, compteDuJeton } from "../middleware/auth";
import { limiterCadence, parDestinataire } from "../middleware/throttle";
import { logger } from "../config/logger";
import { SecurityEventService } from "../services/security-event.service";
import { EmailService } from "../services/email.service";
import {
  AccountTokenService,
  DUREE_CONFIRMATION_MS,
  DUREE_REINITIALISATION_MS,
} from "../services/account-token.service";
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

    // Le lien de confirmation part à l'inscription. Il ne bloque rien : tant
    // que REQUIRE_EMAIL_VERIFICATION n'est pas activé, le compte est
    // utilisable immédiatement.
    if (process.env.ENABLE_EMAIL_VERIFICATION !== "false") {
      await envoyerConfirmation(user);
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

    // Une empreinte bcrypt commence toujours par $2. Des comptes ont été créés
    // avec le mot de passe enregistré en clair : leur connexion échouait
    // systématiquement. On les accepte une dernière fois, puis on remplace la
    // valeur par une vraie empreinte — le mot de passe en clair disparaît de la
    // base à la première connexion réussie.
    const empreinteValide = user.passwordHash.startsWith("$2");

    let isPasswordValid = empreinteValide
      ? await AuthService.comparePassword(body.password, user.passwordHash)
      : user.passwordHash === body.password;

    if (isPasswordValid && !empreinteValide) {
      const passwordHash = await AuthService.hashPassword(body.password);
      await db.user.update({ where: { id: user.id }, data: { passwordHash } });

      logger.warn("Mot de passe en clair converti en empreinte", { userId: user.id });

      SecurityEventService.record({
        action: "PASSWORD_REHASHED",
        actor: user.email,
        severity: "HIGH",
        details: "Mot de passe stocké en clair, converti à la connexion",
        ipAddress: req.ip,
      });
    }

    if (!isPasswordValid) {
      SecurityEventService.record({
        action: "LOGIN_FAILED",
        actor: body.email,
        severity: user.isSuperOwner || user.isSystemAdmin ? "HIGH" : "MEDIUM",
        status: "FAILED",
        details: "Mot de passe incorrect",
        ipAddress: req.ip,
      });

      throw new ApiError(401, "Email ou mot de passe incorrect", "INVALID_CREDENTIALS");
    }

    // L'exigence de confirmation est facultative et désactivée par défaut :
    // l'activer d'office enfermerait dehors tous les comptes déjà créés, le
    // vôtre compris. À activer une fois votre propre adresse confirmée.
    if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerified) {
      throw new ApiError(
        403,
        "Confirmez votre adresse e-mail avant de vous connecter.",
        "EMAIL_NOT_VERIFIED"
      );
    }

    SecurityEventService.record({
      action: "LOGIN_SUCCESS",
      actor: user.email,
      severity: user.isSuperOwner || user.isSystemAdmin ? "MEDIUM" : "LOW",
      details: user.isSuperOwner ? "Connexion superowner" : "Connexion réussie",
      ipAddress: req.ip,
    });

    // Get user's organizations
    const memberships = await UserService.getUserOrganizations(user.id);

    // Tous les comptes n'appartiennent pas à une organisation : un livreur,
    // par exemple, n'en a aucune. Le refuser ici l'empêchait de se connecter.
    const primaryMembership = memberships[0];
    const storeIds = primaryMembership ? primaryMembership.org.stores.map((s) => s.id) : [];

    const livreur = primaryMembership
      ? null
      : await db.driver.findUnique({ where: { userId: user.id }, select: { id: true } });

    if (!primaryMembership && !livreur && !user.isSuperOwner && !user.isSystemAdmin) {
      throw new ApiError(403, "Ce compte n'est rattaché à aucun espace", "NO_WORKSPACE");
    }

    // Generate tokens
    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: primaryMembership?.org.id || "",
      storeIds,
      role: (primaryMembership?.role || (livreur ? "DRIVER" : "ADMIN")) as any,
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
        emailVerified: user.emailVerified,
      },
      organization: primaryMembership
        ? { id: primaryMembership.org.id, name: primaryMembership.org.name }
        : null,
      driver: livreur ? { id: livreur.id } : null,
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

    // Le compte a pu disparaître depuis la signature du jeton — base remise à
    // zéro, utilisateur supprimé. Ce n'est pas une ressource introuvable mais
    // une session à refaire : dit en 404, le navigateur réessayait sans fin.
    const compte = await compteDuJeton(decoded.userId);

    if (!compte) {
      throw new ApiError(
        401,
        "Votre session n'est plus valable. Reconnectez-vous.",
        "SESSION_INVALIDE"
      );
    }

    logger.info("Token refreshed", { userId: decoded.userId });

    // Get updated user info and orgs
    const user = await UserService.getUserById(decoded.userId);
    const memberships = await UserService.getUserOrganizations(decoded.userId);

    // Tous les comptes n'appartiennent pas à une organisation : un livreur,
    // par exemple, n'en a aucune. Le refuser ici l'empêchait de se connecter.
    const primaryMembership = memberships[0];
    const storeIds = primaryMembership ? primaryMembership.org.stores.map((s) => s.id) : [];

    const livreur = primaryMembership
      ? null
      : await db.driver.findUnique({ where: { userId: user.id }, select: { id: true } });

    if (!primaryMembership && !livreur && !user.isSuperOwner && !user.isSystemAdmin) {
      throw new ApiError(403, "Ce compte n'est rattaché à aucun espace", "NO_WORKSPACE");
    }

    const accessToken = AuthService.generateAccessToken({
      userId: user.id,
      orgId: primaryMembership?.org.id || "",
      storeIds,
      role: (primaryMembership?.role || (livreur ? "DRIVER" : "ADMIN")) as any,
    });

    /**
     * Le compte accompagne le jeton.
     *
     * La route ne rendait que `accessToken`. Le navigateur, lui, rangeait
     * `data.user` — absent — et se retrouvait déconnecté juste après un
     * renouvellement réussi : la session repartait toutes les cinq minutes.
     */
    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSuperOwner: user.isSuperOwner,
        isSystemAdmin: user.isSystemAdmin,
        emailVerified: user.emailVerified,
      },
      organization: primaryMembership
        ? { id: primaryMembership.org.id, name: primaryMembership.org.name }
        : null,
      driver: livreur ? { id: livreur.id } : null,
    });
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
        emailVerified: user.emailVerified,
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

// ============================================================================
// CONFIRMATION D'ADRESSE ET MOT DE PASSE OUBLIÉ
// ============================================================================

/**
 * Adresse du site pour les liens envoyés par courriel. Les pages visées sont
 * communes à tous les domaines, n'importe lequel convient donc.
 */
const adresseDuSite = () =>
  (process.env.SITE_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

/** Envoie un lien de confirmation, sans jamais faire échouer l'appelant. */
async function envoyerConfirmation(user: { id: string; email: string; name: string | null }) {
  const { jeton, empreinte, expireLe } = AccountTokenService.emettre(DUREE_CONFIRMATION_MS);

  await db.user.update({
    where: { id: user.id },
    data: { emailTokenHash: empreinte, emailTokenExpiresAt: expireLe },
  });

  const lien = `${adresseDuSite()}/verifier-email?jeton=${jeton}`;

  try {
    await EmailService.sendEmailVerification(user.email, user.name, lien);
  } catch (err) {
    // Un serveur de courriel indisponible ne doit pas empêcher l'inscription :
    // le message peut être redemandé plus tard.
    logger.warn("Envoi de la confirmation d'adresse impossible", {
      email: user.email,
      error: err instanceof Error ? err.message : err,
    });
  }
}

// POST /auth/forgot-password - Demande de réinitialisation
router.post(
  "/forgot-password",
  limiterCadence({
    max: 3,
    fenetreMs: 15 * 60 * 1000,
    message: "Trop de demandes. Réessayez dans quelques minutes.",
    cle: parDestinataire,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ email: z.string().email() }).parse(req.body);
      const email = body.email.toLowerCase();

      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, status: true },
      });

      // La réponse ne dit jamais si l'adresse existe : sinon ce formulaire
      // devient un moyen de vérifier qui est inscrit chez nous.
      const reponse = {
        message:
          "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé.",
      };

      if (!user || user.status !== "ACTIVE") {
        logger.info("Réinitialisation demandée pour une adresse sans compte actif", { email });
        res.json(reponse);
        return;
      }

      const { jeton, empreinte, expireLe } = AccountTokenService.emettre(
        DUREE_REINITIALISATION_MS
      );

      await db.user.update({
        where: { id: user.id },
        data: { resetTokenHash: empreinte, resetTokenExpiresAt: expireLe },
      });

      const lien = `${adresseDuSite()}/reinitialiser?jeton=${jeton}`;

      try {
        await EmailService.sendPasswordReset(user.email, user.name, lien);
      } catch (err) {
        logger.error("Envoi du lien de réinitialisation impossible", {
          email,
          error: err instanceof Error ? err.message : err,
        });
      }

      await SecurityEventService.record({
        action: "PASSWORD_RESET_REQUESTED",
        actor: user.email,
        severity: "LOW",
        details: "Lien de réinitialisation demandé",
      });

      res.json(reponse);
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/reset-password - Nouveau mot de passe via le lien reçu
router.post(
  "/reset-password",
  // Compté par jeton : ce qu'on protège ici, c'est une tentative de deviner
  // un lien précis. Compter par IP mettrait tous les utilisateurs d'un même
  // réseau dans le même seau, sans rien empêcher de plus — un jeton de 32
  // octets est hors de portée d'une recherche exhaustive.
  limiterCadence({
    max: 10,
    fenetreMs: 15 * 60 * 1000,
    cle: (req) => `reinit|${typeof req.body?.jeton === "string" ? req.body.jeton : req.ip}`,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          jeton: z.string().min(32),
          password: z.string().min(6, "Minimum 6 caractères"),
        })
        .parse(req.body);

      // On retrouve le compte par l'empreinte : le jeton en clair n'est nulle
      // part en base.
      const user = await db.user.findUnique({
        where: { resetTokenHash: AccountTokenService.empreinte(body.jeton) },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          resetTokenHash: true,
          resetTokenExpiresAt: true,
        },
      });

      const lienInvalide = new ApiError(
        400,
        "Ce lien n'est plus valable. Demandez-en un nouveau.",
        "INVALID_RESET_TOKEN"
      );

      if (!user || !AccountTokenService.correspond(body.jeton, user.resetTokenHash)) {
        throw lienInvalide;
      }

      if (AccountTokenService.expire(user.resetTokenExpiresAt)) {
        throw lienInvalide;
      }

      if (user.status !== "ACTIVE") {
        throw new ApiError(403, "Ce compte est désactivé", "ACCOUNT_DISABLED");
      }

      const passwordHash = await AuthService.hashPassword(body.password);

      await db.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          // Un jeton ne sert qu'une fois.
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          // Recevoir ce lien prouve que l'adresse est bien la sienne.
          emailVerified: true,
          emailTokenHash: null,
          emailTokenExpiresAt: null,
        },
      });

      await SecurityEventService.record({
        action: "PASSWORD_RESET",
        actor: user.email,
        severity: "HIGH",
        details: "Mot de passe changé via un lien de réinitialisation",
      });

      logger.info("Mot de passe réinitialisé", { userId: user.id });

      res.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
    } catch (err) {
      next(err);
    }
  }
);

// POST /auth/verify-email - Confirmation d'adresse via le lien reçu
router.post("/verify-email", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ jeton: z.string().min(32) }).parse(req.body);

    const user = await db.user.findUnique({
      where: { emailTokenHash: AccountTokenService.empreinte(body.jeton) },
      select: { id: true, email: true, emailTokenHash: true, emailTokenExpiresAt: true },
    });

    if (!user || !AccountTokenService.correspond(body.jeton, user.emailTokenHash)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation n'est pas valable.",
        "INVALID_EMAIL_TOKEN"
      );
    }

    if (AccountTokenService.expire(user.emailTokenExpiresAt)) {
      throw new ApiError(
        400,
        "Ce lien de confirmation a expiré. Demandez-en un nouveau.",
        "EXPIRED_EMAIL_TOKEN"
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null },
    });

    logger.info("Adresse confirmée", { userId: user.id });

    res.json({ message: "Adresse confirmée.", email: user.email });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /auth/resend-verification - Nouveau lien de confirmation
 *
 * Volontairement ouverte aux deux cas : connecté, où l'on peut dire
 * précisément où en est le compte, et non connecté avec une adresse, car
 * quelqu'un à qui l'on refuse la connexion faute de confirmation n'a
 * justement pas de session pour demander un nouveau lien.
 */
router.post(
  "/resend-verification",
  // Compté par compte visé : c'est lui qui reçoit les messages. La session,
  // quand il y en a une, désigne le compte ; sinon c'est l'adresse fournie.
  // Sans l'un ni l'autre la demande n'a pas de destinataire et sera refusée,
  // il n'y a donc rien à compter.
  limiterCadence({
    max: 3,
    fenetreMs: 15 * 60 * 1000,
    cle: (req) => {
      const session = req.headers.authorization || "";
      if (session) return `renvoi|session|${session}`;

      const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase() : "";
      return email ? `renvoi|${req.ip}|${email}` : `renvoi|sans-destinataire|${Math.random()}`;
    },
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Une session, si elle existe, prime sur l'adresse fournie : sinon
      // n'importe qui pourrait viser le compte d'un autre.
      const entete = req.headers.authorization;
      let userId: string | null = null;

      if (entete?.startsWith("Bearer ")) {
        try {
          userId = AuthService.verifyAccessToken(entete.slice(7)).userId;
        } catch {
          throw new ApiError(401, "Session expirée", "INVALID_TOKEN");
        }
      }

      const demande = z.object({ email: z.string().email().optional() }).parse(req.body || {});

      if (!userId && !demande.email) {
        throw new ApiError(400, "Indiquez votre adresse e-mail", "MISSING_EMAIL");
      }

      const user = await db.user.findUnique({
        where: userId ? { id: userId } : { email: demande.email!.toLowerCase() },
        select: { id: true, email: true, name: true, emailVerified: true, status: true },
      });

      // Connecté, on peut être précis. Sans session, la réponse est la même
      // que le compte existe ou non : sinon ce formulaire dirait qui est
      // inscrit.
      if (!userId) {
        if (user && !user.emailVerified && user.status === "ACTIVE") {
          await envoyerConfirmation(user);
        }

        res.json({
          message:
            "Si un compte existe pour cette adresse et n'est pas encore confirmé, un lien vient d'y être envoyé.",
        });
        return;
      }

      if (!user) {
        throw new ApiError(404, "Compte introuvable", "USER_NOT_FOUND");
      }

      if (user.emailVerified) {
        res.json({ message: "Votre adresse est déjà confirmée.", emailVerified: true });
        return;
      }

      await envoyerConfirmation(user);

      res.json({ message: "Un nouveau lien vient de vous être envoyé.", emailVerified: false });
    } catch (err) {
      next(err);
    }
  }
);

export default router;