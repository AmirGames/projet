import { Router, Request, Response, NextFunction } from "express";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { z } from "zod";

const router = Router();

const promotionInput = z.object({
  code: z.string().min(3).max(20),
  discountType: z.enum(["PERCENTAGE", "FIXED"]),
  discountValue: z.number().positive(),
  maxUses: z.number().int().positive().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
  description: z.string().optional(),
});

// GET /promotions/validate - Validate coupon code
router.post("/validate", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, orderAmount, storeId } = req.body;

    if (!code) throw new ApiError(400, "Code requis", "INVALID_INPUT");
    if (!storeId) throw new ApiError(400, "storeId requis", "INVALID_INPUT");

    const promotion = await db.promotion.findUnique({
      where: { storeId_code: { storeId, code: code.toUpperCase() } },
    });

    if (!promotion) {
      throw new ApiError(404, "Code invalide", "PROMOTION_NOT_FOUND");
    }

    if (!promotion.isActive) {
      throw new ApiError(400, "Code expiré", "PROMOTION_EXPIRED");
    }

    if (promotion.expiresAt && new Date(promotion.expiresAt) < new Date()) {
      throw new ApiError(400, "Code expiré", "PROMOTION_EXPIRED");
    }

    const minOrderAmountNum = promotion.minOrderAmount ? Number(promotion.minOrderAmount) : null;
    if (minOrderAmountNum && orderAmount < minOrderAmountNum) {
      throw new ApiError(
        400,
        `Commande minimum: €${(minOrderAmountNum / 100).toFixed(2)}`,
        "MINIMUM_ORDER_NOT_MET"
      );
    }

    if (promotion.maxUses && promotion.timesUsed >= promotion.maxUses) {
      throw new ApiError(400, "Code limite atteinte", "PROMOTION_LIMIT_REACHED");
    }

    const discountValueNum = Number(promotion.discountValue);
    const discount =
      promotion.discountType === "PERCENTAGE"
        ? Math.round((orderAmount * discountValueNum) / 100)
        : Math.round(discountValueNum * 100);

    res.json({
      success: true,
      data: {
        code: promotion.code,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        discount,
        description: promotion.description,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /promotions - Create promotion (admin only)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { storeId, ...input } = req.body;
    if (!storeId) throw new ApiError(400, "storeId requis", "INVALID_INPUT");

    const validated = promotionInput.parse(input);

    const promotion = await db.promotion.create({
      data: {
        storeId,
        code: validated.code.toUpperCase(),
        type: validated.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT",
        discountType: validated.discountType,
        discountValue: validated.discountValue,
        maxUses: validated.maxUses,
        minOrderAmount: validated.minOrderAmount,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        description: validated.description,
        isActive: true,
      },
    });

    res.status(201).json({ success: true, data: promotion });
  } catch (err) {
    next(err);
  }
});

// GET /promotions - List promotions
router.get("/", authMiddleware, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const promotions = await db.promotion.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: promotions });
  } catch (err) {
    next(err);
  }
});

export default router;
