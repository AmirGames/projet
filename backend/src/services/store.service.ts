import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

export class StoreService {
  static async create(data: {
    orgId: string;
    name: string;
    slug: string;
    address?: string;
    city?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    description?: string;
  }) {
    try {
      const store = await db.store.create({
        data: {
          orgId: data.orgId,
          name: data.name,
          slug: data.slug,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
          phone: data.phone,
          email: data.email,
          description: data.description,
        },
        include: {
          products: true,
          categories: true,
          theme: true,
        },
      });

      return store;
    } catch (error: any) {
      if (error.code === "P2002") {
        throw new ApiError(409, "Store slug already exists in organization", "SLUG_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const store = await db.store.findUnique({
      where: { id },
      include: {
        products: { where: { status: "ACTIVE" } },
        categories: true,
        theme: true,
        orders: { take: 10, orderBy: { createdAt: "desc" } },
      },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    return store;
  }

  static async getByOrgId(orgId: string) {
    return await db.store.findMany({
      where: { orgId },
      include: {
        products: true,
        categories: true,
        theme: true,
      },
    });
  }

  static async update(id: string, data: any) {
    try {
      return await db.store.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.address && { address: data.address }),
          ...(data.city && { city: data.city }),
          ...(data.postalCode && { postalCode: data.postalCode }),
          ...(data.phone && { phone: data.phone }),
          ...(data.email && { email: data.email }),
          ...(data.description && { description: data.description }),
          ...(data.settings && { settings: data.settings }),
          ...(data.pickupSlots && { pickupSlots: data.pickupSlots }),
        },
        include: {
          products: true,
          categories: true,
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.store.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }
      throw error;
    }
  }
}