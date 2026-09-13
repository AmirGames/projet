import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface ProductTagData {
  name: string;
  description?: string;
  color?: string;
}

export class ProductTagService {
  static async getTags(storeId: string, options?: { skip?: number; take?: number }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const [tags, total] = await Promise.all([
        db.productTag.findMany({
          where: { storeId },
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.productTag.count({ where: { storeId } }),
      ]);

      return { data: tags, total, skip, take };
    } catch (error) {
      throw error;
    }
  }

  static async getTag(storeId: string, tagId: string) {
    try {
      const tag = await db.productTag.findUnique({
        where: { id: tagId },
      });

      if (!tag || tag.storeId !== storeId) {
        throw new ApiError(404, "Tag not found", "TAG_NOT_FOUND");
      }

      return tag;
    } catch (error) {
      throw error;
    }
  }

  static async createTag(storeId: string, data: ProductTagData) {
    try {
      const slug = data.name.toLowerCase().replace(/\s+/g, "-");

      const tag = await db.productTag.create({
        data: {
          storeId,
          name: data.name,
          slug,
          description: data.description,
          color: data.color || "#3b82f6",
        },
      });

      return tag;
    } catch (error) {
      throw error;
    }
  }

  static async updateTag(storeId: string, tagId: string, data: Partial<ProductTagData>) {
    try {
      const tag = await db.productTag.findUnique({
        where: { id: tagId },
      });

      if (!tag || tag.storeId !== storeId) {
        throw new ApiError(404, "Tag not found", "TAG_NOT_FOUND");
      }

      const updateData: any = {};
      if (data.name) {
        updateData.name = data.name;
        updateData.slug = data.name.toLowerCase().replace(/\s+/g, "-");
      }
      if (data.description !== undefined) updateData.description = data.description;
      if (data.color !== undefined) updateData.color = data.color;

      const updated = await db.productTag.update({
        where: { id: tagId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteTag(storeId: string, tagId: string) {
    try {
      const tag = await db.productTag.findUnique({
        where: { id: tagId },
      });

      if (!tag || tag.storeId !== storeId) {
        throw new ApiError(404, "Tag not found", "TAG_NOT_FOUND");
      }

      await db.productTag.delete({
        where: { id: tagId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async addProductToTag(storeId: string, tagId: string, productId: string) {
    try {
      const tag = await db.productTag.findUnique({
        where: { id: tagId },
      });

      if (!tag || tag.storeId !== storeId) {
        throw new ApiError(404, "Tag not found", "TAG_NOT_FOUND");
      }

      const product = await db.product.findUnique({
        where: { id: productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const productIds = new Set(tag.productIds);
      productIds.add(productId);

      const updated = await db.productTag.update({
        where: { id: tagId },
        data: { productIds: Array.from(productIds) },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async removeProductFromTag(storeId: string, tagId: string, productId: string) {
    try {
      const tag = await db.productTag.findUnique({
        where: { id: tagId },
      });

      if (!tag || tag.storeId !== storeId) {
        throw new ApiError(404, "Tag not found", "TAG_NOT_FOUND");
      }

      const productIds = new Set(tag.productIds);
      productIds.delete(productId);

      const updated = await db.productTag.update({
        where: { id: tagId },
        data: { productIds: Array.from(productIds) },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }
}
