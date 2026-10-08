import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { champEmail, champMotDePasse } from "../../utils/validation";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "./auth.middleware";
import { limiterInscriptions } from "../../middleware/throttle";
import { champAcceptation } from "../legal/acceptation-conditions.service";
import { AuthInscriptionService } from "./auth-inscription.service";

// Devenir commerçant ou livreur, et inscription d'un commerçant.
// Monté sur /api/auth (voir app.ts).
const router = Router();

// POST /me/become-merchant - Existing user becomes merchant
router.post("/me/become-merchant", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const body = z.object({
      businessName: z.string().min(1).max(200),
      storeName: z.string().min(1).max(200),
      storeSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      // Le genre en code (« restaurant ») ; les anciennes graphies
      // (« Restaurant », « RESTAURANT ») sont encore comprises.
      businessType: z.string().min(1).max(50),
      cuisineType: z.string().max(50).optional().nullable(),
      // Les coordonnées de l'adresse retenue, quand la suggestion les donne.
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      phone: z.string().min(1).max(20),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      description: z.string().min(1).max(1000),
    }).parse(req.body);

    const { organization, store } = await AuthInscriptionService.devenirCommercant(userId, body);

    res.status(201).json({
      message: "Rôle de commerçant activé avec succès",
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /me/become-driver - Existing user becomes driver
router.post("/me/become-driver", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId;
    const sid = req.user?.sid;
    if (!sid) throw new ApiError(401, "Session requise", "SESSION_INVALIDE");

    if (!userId) {
      throw new ApiError(401, "Not authenticated", "NOT_AUTHENTICATED");
    }

    const body = z.object({
      phone: z.string().min(1).max(20),
      vehicleType: z.enum(["car", "scooter", "bike"]),
      vehiclePlate: z.string().optional(),
    }).parse(req.body);

    const { accessToken, refreshToken, driver } = await AuthInscriptionService.devenirLivreur(userId, sid, body);

    res.status(201).json({
      message: "Candidature de livreur soumise avec succès",
      accessToken,
      refreshToken,
      driver: {
        id: driver.id,
        name: driver.name,
        status: driver.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/merchant-register - Merchant registration with automatic store creation
router.post("/merchant-register", limiterInscriptions, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      businessName: z.string().min(1).max(200),
      email: champEmail(),
      password: champMotDePasse(),
      // Le genre en code (« restaurant ») ; les anciennes graphies
      // (« Restaurant », « RESTAURANT ») sont encore comprises.
      businessType: z.string().min(1).max(50),
      cuisineType: z.string().max(50).optional().nullable(),
      // Les coordonnées de l'adresse retenue, quand la suggestion les donne.
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      phone: z.string().min(1).max(20),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      postalCode: z.string().min(1).max(20),
      // Pays du commerce (« BE », « FR ») : fixe les règles de facturation.
      country: z.enum(["BE", "FR"]).optional(),
      website: z.string().url().optional().nullable(),
      description: z.string().min(1).max(1000),
      storeName: z.string().min(1).max(200),
      storeSlug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
      ...champAcceptation,
    });

    const body = schema.parse(req.body);

    const { accessToken, refreshToken, user, organization, store } =
      await AuthInscriptionService.inscrireCommercant(req, body);

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
