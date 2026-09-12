import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

export interface PromotionData {
  storeId: string;
  code: string;
  description?: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  applicableToAll?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  startDate?: Date;
  endDate?: Date;
  maxUses?: number;
}

export class PromotionService {
  static async create(data: PromotionData) {
    try {
      const promotion = await db.promotion.create({
        data: {
          storeId: data.storeId,
          code: data.code.toUpperCase(),
          description: data.description,
          type: data.type,
          discountValue: data.discountValue,
          applicableToAll: data.applicableToAll ?? true,
          productIds: data.productIds || [],
          categoryIds: data.categoryIds || [],
          startDate: data.startDate,
          endDate: data.endDate,
          maxUses: data.maxUses,
        },
      });

      return promotion;
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new ApiError(409, "Code promo déjà utilisé dans ce store", "CODE_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const promotion = await db.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
    }

    return promotion;
  }

  static async getByCode(storeId: string, code: string) {
    const promotion = await db.promotion.findFirst({
      where: {
        storeId,
        code: code.toUpperCase(),
      },
    });

    if (!promotion) {
      throw new ApiError(404, "Code promo invalide", "INVALID_CODE");
    }

    return promotion;
  }

  static async getByStoreId(storeId: string) {
    return await db.promotion.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getActiveByStoreId(storeId: string) {
    const now = new Date();

    return await db.promotion.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        OR: [
          { startDate: null, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: null },
          { startDate: { lte: now }, endDate: { gte: now } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async validateAndApply(
    storeId: string,
    code: string,
    cartTotal: number,
    productIds: string[] = []
  ) {
    const promotion = await this.getByCode(storeId, code);

    const now = new Date();

    if (promotion.status !== "ACTIVE") {
      throw new ApiError(400, "Ce code promo est inactif", "INACTIVE_CODE");
    }

    if (promotion.startDate && promotion.startDate > now) {
      throw new ApiError(400, "Ce code promo n'est pas encore valide", "FUTURE_CODE");
    }

    if (promotion.endDate && promotion.endDate < now) {
      throw new ApiError(400, "Ce code promo a expiré", "EXPIRED_CODE");
    }

    if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
      throw new ApiError(400, "Ce code promo a atteint sa limite d'utilisation", "MAX_USES_REACHED");
    }

    if (
      !promotion.applicableToAll &&
      productIds.length > 0 &&
      !productIds.some((id) => promotion.productIds.includes(id))
    ) {
      throw new ApiError(400, "Ce code promo ne s'applique pas à ces produits", "NOT_APPLICABLE");
    }

    let discountAmount = 0;

    if (promotion.type === "PERCENTAGE") {
      discountAmount = (cartTotal * Number(promotion.discountValue)) / 100;
    } else {
      discountAmount = Number(promotion.discountValue);
    }

    discountAmount = Math.min(discountAmount, cartTotal);

    return {
      promotion,
      discountAmount,
      finalTotal: cartTotal - discountAmount,
    };
  }

  static async applyPromotion(id: string) {
    try {
      return await db.promotion.update({
        where: { id },
        data: { currentUses: { increment: 1 } },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async update(id: string, data: Partial<PromotionData>) {
    try {
      return await db.promotion.update({
        where: { id },
        data: {
          ...(data.description && { description: data.description }),
          ...(data.discountValue && { discountValue: data.discountValue }),
          ...(data.type && { type: data.type }),
          ...(data.applicableToAll !== undefined && { applicableToAll: data.applicableToAll }),
          ...(data.productIds && { productIds: data.productIds }),
          ...(data.categoryIds && { categoryIds: data.categoryIds }),
          ...(data.startDate && { startDate: data.startDate }),
          ...(data.endDate && { endDate: data.endDate }),
          ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async toggleStatus(id: string) {
    try {
      const promotion = await db.promotion.findUnique({ where: { id } });
      if (!promotion) {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }

      return await db.promotion.update({
        where: { id },
        data: {
          status: promotion.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.promotion.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async countByStoreId(storeId: string) {
    return await db.promotion.count({
      where: { storeId },
    });
  }

  static async getByOrgId(orgId: string) {
    return await db.promotion.findMany({
      where: {
        store: { orgId },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
