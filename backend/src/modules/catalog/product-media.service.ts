import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { exigerBoutique, type Acteur } from "../auth/autorisation-boutique";
import { validerOrdre, exigerLotComplet } from "./reordonnancement";

export interface ProductMediaData {
  url: string;
  alt?: string;
  type?: string;
  displayOrder?: number;
}

export class ProductMediaService {
  static async getProductMedia(storeId: string, productId: string) {
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const media = await db.productMedia.findMany({
        where: { productId },
        orderBy: { displayOrder: "asc" },
      });

      return media;
    } catch (error) {
      throw error;
    }
  }

  static async addMedia(storeId: string, productId: string, data: ProductMediaData) {
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const maxOrder = await db.productMedia.findFirst({
        where: { productId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true },
      });

      const media = await db.productMedia.create({
        data: {
          productId,
          url: data.url,
          alt: data.alt,
          type: data.type || "image",
          displayOrder: (maxOrder?.displayOrder || 0) + 1,
        },
      });

      return media;
    } catch (error) {
      throw error;
    }
  }

  static async deleteMedia(storeId: string, mediaId: string) {
    try {
      const media = await db.productMedia.findUnique({
        where: { id: mediaId },
        include: { product: true },
      });

      if (!media || media.product.storeId !== storeId) {
        throw new ApiError(404, "Media not found", "MEDIA_NOT_FOUND");
      }

      await db.productMedia.delete({
        where: { id: mediaId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async reorderMedia(storeId: string, productId: string, mediaOrder: string[], acteur: Acteur) {
    await exigerBoutique(acteur, storeId, "manage");
    if (!Array.isArray(mediaOrder)) throw new ApiError(400, "Ordre des médias requis", "INVALID_ORDERING");
    const ordering = validerOrdre(mediaOrder.map((id, displayOrder) => ({ id, displayOrder })));
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      await db.$transaction(async tx => {
        exigerLotComplet(ordering.length, await tx.productMedia.count({ where: { productId, id: { in: ordering.map(item => item.id) } } }));
        for (const item of ordering) {
          const result = await tx.productMedia.updateMany({ where: { id: item.id, productId, product: { storeId } }, data: { displayOrder: item.displayOrder } });
          exigerLotComplet(1, result.count);
        }
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }
}
