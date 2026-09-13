import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PromotionService } from "../services/promotion.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createPromotionSchema = z.object({
  storeId: z.string().cuid(),
  code: z.string().min(2, "Code minimum 2 caractères").max(20),
  description: z.string().optional(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.number().positive("Valeur doit être positive"),
  applicableToAll: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const updatePromotionSchema = z.object({
  description: z.string().optional(),
  discountValue: z.number().positive().optional(),
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
  applicableToAll: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.string()).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  maxUses: z.number().int().positive().optional(),
});

const validatePromotionSchema = z.object({
  code: z.string(),
  cartTotal: z.number().positive(),
  productIds: z.array(z.string()).optional(),
});

// POST /promotions - Create promotion (protected)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createPromotionSchema.parse(req.body);

    logger.info("Creating promotion", { code: body.code, storeId: body.storeId });

    const promotion = await PromotionService.create({
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    res.status(201).json({
      message: "Code promo créé",
      promotion,
    });
  } catch (err) {
    next(err);
  }
});

// GET /promotions/:id - Get promotion by ID
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const promotion = await PromotionService.getById(id);

    res.json(promotion);
  } catch (err) {
    next(err);
  }
});

// GET /promotions?storeId=:storeId - Get promotions by store (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;

    if (orgId) {
      const promotions = await PromotionService.getByOrgId(orgId);
      const total = promotions.length;

      return res.json({
        promotions,
        total,
      });
    }

    if (!storeId) {
      throw new ApiError(400, "Paramètre 'storeId' ou 'orgId' requis", "MISSING_PARAM");
    }

    const promotions = await PromotionService.getByStoreId(storeId);
    const total = await PromotionService.countByStoreId(storeId);

    return res.json({
      promotions,
      total,
    });
  } catch (err) {
    next(err);
  }
});

// GET /promotions/active/:storeId - Get active promotions for a store
router.get("/active/:storeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    const promotions = await PromotionService.getActiveByStoreId(storeId);

    res.json({
      promotions,
      count: promotions.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /promotions/validate - Validate and calculate discount
router.post("/validate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = validatePromotionSchema.parse(req.body);
    const storeId = req.query.storeId as string;

    if (!storeId) {
      throw new ApiError(400, "Paramètre 'storeId' requis", "MISSING_PARAM");
    }

    const result = await PromotionService.validateAndApply(
      storeId,
      body.code,
      body.cartTotal,
      body.productIds
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PUT /promotions/:id - Update promotion (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updatePromotionSchema.parse(req.body);

    logger.info("Updating promotion", { id });

    const promotion = await PromotionService.update(id, {
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    res.json({
      message: "Code promo mis à jour",
      promotion,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /promotions/:id/toggle - Toggle promotion status (protected)
router.patch("/:id/toggle", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    logger.info("Toggling promotion status", { id });

    const promotion = await PromotionService.toggleStatus(id);

    res.json({
      message: "Statut du code promo mis à jour",
      promotion,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /promotions/:id - Delete promotion (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const promotion = await PromotionService.getById(id);

    if (!promotion) {
      throw new ApiError(404, "Code promo non trouvé", "NOT_FOUND");
    }

    logger.info("Deleting promotion", { id });

    await PromotionService.delete(id);

    res.json({
      message: "Code promo supprimé",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
