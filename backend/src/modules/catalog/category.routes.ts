import { autoriserCatalogue, perimetreBoutiques } from "../auth/autorisation-boutique";
import { CataloguePublicService } from "./catalogue-public.service";
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CategoryService } from "./category.service";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware, authFacultative } from "../auth/auth.middleware";
import { logger } from "../../config/logger";

const router = Router();

const createCategorySchema = z.object({
  storeId: z.string().min(1, "storeId requis"),
  name: z.string().min(2, "Nom minimum 2 caractères"),
  displayOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  displayOrder: z.number().int().min(0).optional(),
  sortMode: z.enum(["MANUAL", "ALPHA_ASC", "ALPHA_DESC", "PRICE_ASC", "PRICE_DESC"]).optional(),
});

// POST /categories - Create category (protected)
router.post("/", authMiddleware, autoriserCatalogue, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createCategorySchema.parse(req.body);

    logger.info("Creating category", { name: body.name, storeId: body.storeId });

    const category = await CategoryService.create(body);

    res.status(201).json({
      message: "Catégorie créée",
      category,
    });
  } catch (err) {
    next(err);
  }
});

// GET /categories/:id - Get category by ID
router.get("/:id", authFacultative, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const category = await CataloguePublicService.categoryById(id, req);

    if (!category) {
      throw new ApiError(404, "Catégorie non trouvée", "NOT_FOUND");
    }

    res.json(category);
  } catch (err) {
    next(err);
  }
});

// GET /categories?orgId=:orgId or ?storeId=:storeId - Get categories by organization or store (protected)
router.get("/", authMiddleware, autoriserCatalogue, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;
    const storeId = req.query.storeId as string;

    if (!orgId && !storeId) {
      throw new ApiError(400, "Paramètre 'orgId' ou 'storeId' requis", "MISSING_PARAM");
    }

    let categories;
    let total;

    if (storeId) {
      categories = await CategoryService.getByStoreId(storeId);
      total = await CategoryService.countByStoreId(storeId);
    } else {
      categories = await CategoryService.getByOrgId(orgId, await perimetreBoutiques(req));
      total = await CategoryService.countByOrgId(orgId, await perimetreBoutiques(req));
    }

    res.json({
      categories,
      total,
    });
  } catch (err) {
    next(err);
  }
});

// GET /categories/store/:storeId - Get categories by store
router.get("/store/:storeId", authFacultative, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    const categories = await CataloguePublicService.categoriesByStore(storeId, req);
    const total = categories.length;

    res.json({
      categories,
      total,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /categories/:id - Update category (protected)
router.put("/:id", authMiddleware, autoriserCatalogue, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateCategorySchema.parse(req.body);

    logger.info("Updating category", { id });

    const category = await CategoryService.update(id, body);

    if (!category) {
      throw new ApiError(404, "Catégorie non trouvée", "NOT_FOUND");
    }

    res.json({
      message: "Catégorie mise à jour",
      category,
    });
  } catch (err) {
    next(err);
  }
});

// POST /categories/reorder - Reorder categories (protected)
router.post("/reorder", authMiddleware, autoriserCatalogue, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, ordering } = req.body;

    if (!storeId || !Array.isArray(ordering)) {
      throw new ApiError(400, "storeId et ordering requis", "INVALID_INPUT");
    }

    logger.info("Reordering categories", { storeId });

    const categories = await CategoryService.reorder(storeId, ordering, req);

    res.json({
      message: "Catégories réordonnées",
      categories,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /categories/:id - Delete category (protected)
router.delete("/:id", authMiddleware, autoriserCatalogue, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const category = await CategoryService.getById(id);

    if (!category) {
      throw new ApiError(404, "Catégorie non trouvée", "NOT_FOUND");
    }

    logger.info("Deleting category", { id });

    await CategoryService.delete(id);

    res.json({
      message: "Catégorie supprimée",
    });
  } catch (err) {
    next(err);
  }
});

export default router;