import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface CategoryData {
  storeId: string;
  name: string;
  displayOrder?: number;
}

export class CategoryService {
  static async create(data: CategoryData) {
    try {
      const category = await db.category.create({
        data: {
          storeId: data.storeId,
          name: data.name,
          displayOrder: data.displayOrder || 0,
        },
      });
      return category;
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new ApiError(400, "Category name already exists for this store", "DUPLICATE_NAME");
      }
      throw err;
    }
  }

  static async getById(id: string) {
    const category = await db.category.findUnique({
      where: { id },
      include: { products: true },
    });

    if (!category) {
      throw new ApiError(404, "Category not found", "CATEGORY_NOT_FOUND");
    }

    return category;
  }

  static async getByStoreId(storeId: string) {
    return await db.category.findMany({
      where: { storeId },
      include: { products: true },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static async update(id: string, data: Partial<CategoryData>) {
    try {
      return await db.category.update({
        where: { id },
        data: {
          name: data.name,
          displayOrder: data.displayOrder,
        },
        include: { products: true },
      });
    } catch (err: any) {
      if (err.code === "P2025") {
        throw new ApiError(404, "Category not found", "CATEGORY_NOT_FOUND");
      }
      if (err.code === "P2002") {
        throw new ApiError(400, "Category name already exists for this store", "DUPLICATE_NAME");
      }
      throw err;
    }
  }

  static async reorder(storeId: string, ordering: { id: string; displayOrder: number }[]) {
    try {
      for (const item of ordering) {
        await db.category.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        });
      }

      return await this.getByStoreId(storeId);
    } catch (err) {
      throw err;
    }
  }

  static async delete(id: string) {
    try {
      await db.category.delete({
        where: { id },
      });
    } catch (err: any) {
      if (err.code === "P2025") {
        throw new ApiError(404, "Category not found", "CATEGORY_NOT_FOUND");
      }
      throw err;
    }
  }

  static async countByStoreId(storeId: string) {
    return await db.category.count({
      where: { storeId },
    });
  }

  static async getByOrgId(orgId: string) {
    return await db.category.findMany({
      where: {
        store: { orgId },
      },
      include: {
        products: true,
        store: true,
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static async countByOrgId(orgId: string) {
    return await db.category.count({
      where: {
        store: { orgId },
      },
    });
  }
}