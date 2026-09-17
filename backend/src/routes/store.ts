import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { emailFacultatif } from "../utils/validation";
import { StoreService } from "../services/store.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware, checkOrgStatus } from "../middleware/auth";
import { logger } from "../config/logger";
import { PlanService } from "../services/plan.service";
import {
  TYPES_ETABLISSEMENT,
  TYPES_CUISINE,
  CODES_ETABLISSEMENT,
  CODES_CUISINE,
} from "../services/store-type.service";

const router = Router();

const createStoreSchema = z.object({
  orgId: z.string(),
  name: z.string().min(2, "Nom minimum 2 caractères"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: emailFacultatif,
  description: z.string().optional(),
  // Coordonnées de la boutique. Sans elles, la boutique n'apparaît ni dans
  // « les commerces près de chez moi » ni dans la recherche d'un livreur : le
  // modèle portait ces colonnes, aucune route ne permettait de les remplir.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Ce que vend ce commerce, et ce qu'on y mange : l'inscription ne le
  // demandait pas, et toute boutique était un « restaurant » sans genre.
  businessType: z.enum(CODES_ETABLISSEMENT as [string, ...string[]]).optional(),
  cuisineType: z.enum(CODES_CUISINE as [string, ...string[]]).optional(),
});

const updateStoreSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  phone: z.string().optional(),
  email: emailFacultatif,
  description: z.string().optional(),
  logo: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  // Coordonnées de la boutique. Sans elles, la boutique n'apparaît ni dans
  // « les commerces près de chez moi » ni dans la recherche d'un livreur : le
  // modèle portait ces colonnes, aucune route ne permettait de les remplir.
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  // Ce que vend ce commerce, et ce qu'on y mange : l'inscription ne le
  // demandait pas, et toute boutique était un « restaurant » sans genre.
  businessType: z.enum(CODES_ETABLISSEMENT as [string, ...string[]]).optional(),
  cuisineType: z.enum(CODES_CUISINE as [string, ...string[]]).optional(),
});

const storeStatusSchema = z.object({
  status: z.enum(["OPEN", "CLOSED", "TEMPORARILY_CLOSED"]),
});

// POST /stores - Create store (protected)
router.post("/", authMiddleware, checkOrgStatus, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createStoreSchema.parse(req.body);

    logger.info("Creating store", { name: body.name, orgId: body.orgId });

    // Le nombre de boutiques dépend de la formule souscrite.
    await PlanService.verifierCreationBoutique(body.orgId);

    const store = await StoreService.create(body);

    res.status(201).json({
      message: "Store créée",
      store,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /stores/types - Les genres de commerce et de cuisine.
 *
 * Publique : le formulaire d'inscription en a besoin avant qu'un compte
 * n'existe. La liste vit côté serveur pour que l'écran, l'API et la recherche
 * parlent des mêmes valeurs — recopiée dans un `<select>`, elle aurait dérivé
 * dès la première addition.
 *
 * Déclarée avant `/:id`, qui capterait sinon « types » pour un identifiant.
 */
router.get("/types", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: { etablissements: TYPES_ETABLISSEMENT, cuisines: TYPES_CUISINE },
  });
});

// GET /stores/slug/:slug - Get store by slug (public)
router.get("/slug/:slug", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug as string;

    const store = await StoreService.getBySlug(slug);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    res.json({ store });
  } catch (err) {
    next(err);
  }
});

// GET /stores/:id - Get store by ID
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const store = await StoreService.getById(id);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    res.json(store);
  } catch (err) {
    next(err);
  }
});

// GET /stores/org/:orgId - Get stores by organization
// GET /stores/org/:orgId/quota - Boutiques autorisées par la formule
router.get("/org/:orgId/quota", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quota = await PlanService.quotaBoutiques(req.params.orgId as string);
    res.json(quota);
  } catch (err) {
    next(err);
  }
});

router.get("/org/:orgId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const stores = await StoreService.getByOrgId(orgId);

    res.json(stores);
  } catch (err) {
    next(err);
  }
});

// PUT /stores/:id - Update store (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateStoreSchema.parse(req.body);

    logger.info("Updating store", { id });

    const store = await StoreService.update(id, body);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    res.json({
      message: "Store mise à jour",
      store,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /stores/:id/status - Toggle store status (protected)
router.patch("/:id/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = storeStatusSchema.parse(req.body);

    logger.info("Setting store status", { id, status: body.status });

    const store = await StoreService.setStatus(id, body.status);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    res.json({
      message: "Statut de la boutique mis à jour",
      store,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /stores/:id/toggle - Toggle store open/closed (protected)
router.patch("/:id/toggle", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    logger.info("Toggling store status", { id });

    const store = await StoreService.toggleStatus(id);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    res.json({
      message: "Statut de la boutique basculé",
      store,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /stores/:id - Delete store (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const store = await StoreService.getById(id);

    if (!store) {
      throw new ApiError(404, "Store non trouvée", "NOT_FOUND");
    }

    logger.info("Deleting store", { id });

    await StoreService.delete(id);

    res.json({
      message: "Store supprimée",
    });
  } catch (err) {
    next(err);
  }
});

export default router;