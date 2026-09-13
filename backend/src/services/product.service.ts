import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface ProductData {
  storeId: string;
  sku?: string;
  name: string;
  description?: string;
  price: number;
  categoryId?: string;
  stock?: number;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

export class ProductService {
  static async create(data: ProductData) {
    try {
      // Generate SKU if not provided
      const sku = data.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const product = await db.product.create({
        data: {
          storeId: data.storeId,
          sku: sku,
          name: data.name,
          description: data.description,
          price: data.price,
          categoryId: data.categoryId,
          stock: data.stock || 0,
          status: data.status || "ACTIVE",
        },
        include: {
          category: true,
          images: true,
        },
      });

      return product;
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new ApiError(409, "Product SKU already exists in store", "SKU_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        variants: true,
      },
    });

    if (!product) {
      throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }

    return product;
  }

  static async getByStoreId(storeId: string, limit: number = 100, offset: number = 0) {
    return await db.product.findMany({
      where: { storeId },
      include: {
        category: true,
        images: { take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async getByCategoryId(categoryId: string, limit: number = 100, offset: number = 0) {
    return await db.product.findMany({
      where: { categoryId },
      include: {
        category: true,
        images: { take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async search(storeId: string, query: string, limit: number = 100) {
    return await db.product.findMany({
      where: {
        storeId,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      include: {
        category: true,
        images: { take: 1 },
      },
      take: limit,
    });
  }

  static async update(id: string, data: Partial<ProductData>) {
    try {
      return await db.product.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.description && { description: data.description }),
          ...(data.price && { price: data.price }),
          ...(data.stock !== undefined && { stock: data.stock }),
          ...(data.status && { status: data.status }),
          ...(data.categoryId && { categoryId: data.categoryId }),
        },
        include: {
          category: true,
          images: true,
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
      throw error;
    }
  }

  static async updateStock(id: string, quantity: number) {
    try {
      const product = await db.product.findUnique({ where: { id } });
      if (!product) throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");

      return await db.product.update({
        where: { id },
        data: { stock: product.stock + quantity },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.product.delete({ where: { id } });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
      throw error;
    }
  }

  static async bulkCreate(data: ProductData[]) {
    return await db.product.createMany({
      data: data.map((item) => ({
        storeId: item.storeId,
        sku: item.sku,
        name: item.name,
        description: item.description,
        price: item.price,
        categoryId: item.categoryId,
        stock: item.stock || 0,
        status: item.status || "ACTIVE",
      })),
    });
  }

  static async countByStoreId(storeId: string) {
    return await db.product.count({
      where: { storeId },
    });
  }

  static async getByOrgId(orgId: string, limit: number = 100, offset: number = 0) {
    return await db.product.findMany({
      where: {
        store: { orgId },
      },
      include: {
        category: true,
        images: { orderBy: { order: "asc" } },
        store: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async countByOrgId(orgId: string) {
    return await db.product.count({
      where: {
        store: { orgId },
      },
    });
  }

  static async isStockAvailable(productId: string, quantity: number) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
    return product.stock >= quantity;
  }

  static async getLowStockProducts(storeId: string) {
    return await db.product.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        stock: {
          lte: db.product.fields.lowStockThreshold,
        },
      },
      include: {
        category: true,
      },
      orderBy: { stock: "asc" },
    });
  }

  static async getLowStockProductsByOrgId(orgId: string) {
    return await db.product.findMany({
      where: {
        store: { orgId },
        status: "ACTIVE",
      },
      include: {
        category: true,
        store: true,
      },
    }).then(products =>
      products.filter(p => p.stock <= p.lowStockThreshold).sort((a, b) => a.stock - b.stock)
    );
  }

  static async setLowStockThreshold(id: string, threshold: number) {
    try {
      return await db.product.update({
        where: { id },
        data: { lowStockThreshold: threshold },
        include: {
          category: true,
          images: true,
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
      throw error;
    }
  }

  static async reorder(storeId: string, ordering: { id: string; displayOrder: number }[]) {
    try {
      for (const item of ordering) {
        await db.product.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        });
      }

      return await this.getByStoreId(storeId);
    } catch (err) {
      throw err;
    }
  }

  static async reorderByCategory(categoryId: string, ordering: { id: string; displayOrder: number }[]) {
    try {
      for (const item of ordering) {
        await db.product.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        });
      }

      return await this.getByCategoryId(categoryId);
    } catch (err) {
      throw err;
    }
  }
}