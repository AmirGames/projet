import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

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

  static async reorderMedia(storeId: string, productId: string, mediaOrder: string[]) {
    try {
      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      for (let i = 0; i < mediaOrder.length; i++) {
        await db.productMedia.update({
          where: { id: mediaOrder[i] },
          data: { displayOrder: i },
        });
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }
}
