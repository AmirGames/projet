import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CategoryService } from "../services/category.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createCategorySchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(2, "Nom minimum 2 caractères"),
  displayOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

// POST /categories - Create category (protected)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const category = await CategoryService.getById(id);

    if (!category) {
      throw new ApiError(404, "Catégorie non trouvée", "NOT_FOUND");
    }

    res.json(category);
  } catch (err) {
    next(err);
  }
});

// GET /categories?orgId=:orgId - Get categories by organization (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;

    if (!orgId) {
      throw new ApiError(400, "Paramètre 'orgId' requis", "MISSING_PARAM");
    }

    const categories = await CategoryService.getByOrgId(orgId);
    const total = await CategoryService.countByOrgId(orgId);

    res.json({
      categories,
      total,
    });
  } catch (err) {
    next(err);
  }
});

// GET /categories/store/:storeId - Get categories by store
router.get("/store/:storeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    const categories = await CategoryService.getByStoreId(storeId);
    const total = await CategoryService.countByStoreId(storeId);

    res.json({
      categories,
      total,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /categories/:id - Update category (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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
router.post("/reorder", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, ordering } = req.body;

    if (!storeId || !Array.isArray(ordering)) {
      throw new ApiError(400, "storeId et ordering requis", "INVALID_INPUT");
    }

    logger.info("Reordering categories", { storeId });

    const categories = await CategoryService.reorder(storeId, ordering);

    res.json({
      message: "Catégories réordonnées",
      categories,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /categories/:id - Delete category (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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