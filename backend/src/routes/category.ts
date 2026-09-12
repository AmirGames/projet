import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { CategoryService } from "../services/category.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { logger } from "../config/logger.js";

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

// POST /categories - Create category
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
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
    const { id } = req.params;

    const category = await CategoryService.getById(id);

    if (!category) {
      throw new ApiError(404, "Catégorie non trouvée", "NOT_FOUND");
    }

    res.json(category);
  } catch (err) {
    next(err);
  }
});

// GET /categories/store/:storeId - Get categories by store
router.get("/store/:storeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId } = req.params;

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

// PUT /categories/:id - Update category
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
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

// POST /categories/reorder - Reorder categories
router.post("/reorder", async (req: Request, res: Response, next: NextFunction) => {
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

// DELETE /categories/:id - Delete category
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

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