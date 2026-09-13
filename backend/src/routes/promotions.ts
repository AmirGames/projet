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
    const { code, orderAmount } = req.body;
    
    if (!code) throw new ApiError(400, "Code requis", "INVALID_INPUT");

    const promotion = await db.promotion.findUnique({
      where: { code: code.toUpperCase() },
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

    if (promotion.minOrderAmount && orderAmount < promotion.minOrderAmount) {
      throw new ApiError(
        400,
        `Commande minimum: €${(promotion.minOrderAmount / 100).toFixed(2)}`,
        "MINIMUM_ORDER_NOT_MET"
      );
    }

    if (promotion.maxUses && promotion.timesUsed >= promotion.maxUses) {
      throw new ApiError(400, "Code limite atteinte", "PROMOTION_LIMIT_REACHED");
    }

    const discount =
      promotion.discountType === "PERCENTAGE"
        ? Math.round((orderAmount * promotion.discountValue) / 100)
        : Math.round(promotion.discountValue * 100);

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
    const input = promotionInput.parse(req.body);

    const promotion = await db.promotion.create({
      data: {
        code: input.code.toUpperCase(),
        discountType: input.discountType,
        discountValue: input.discountValue,
        maxUses: input.maxUses,
        minOrderAmount: input.minOrderAmount,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        description: input.description,
        isActive: true,
      },
    });

    res.status(201).json({ success: true, data: promotion });
  } catch (err) {
    next(err);
  }
});

// GET /promotions - List promotions
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
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
