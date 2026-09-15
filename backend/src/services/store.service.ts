import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

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
    latitude?: number;
    longitude?: number;
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
          latitude: data.latitude,
          longitude: data.longitude,
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
      where: { orgId, deletedAt: null },
      include: {
        products: { where: { deletedAt: null } },
        categories: true,
        theme: true,
      },
    });
  }

  static async getBySlug(slug: string) {
    const store = await db.store.findFirst({
      where: { slug, deletedAt: null },
      include: {
        products: { where: { status: "ACTIVE", deletedAt: null } },
        categories: true,
        theme: true,
        org: true,
      },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    return store;
  }

  static async update(id: string, data: any) {
    try {
      const settingsFields = ['logo', 'primaryColor', 'secondaryColor', 'timezone', 'currency'];
      const settings: any = {};

      settingsFields.forEach(field => {
        if (field in data) {
          settings[field] = data[field];
        }
      });

      return await db.store.update({
        where: { id },
        data: {
          ...(data.name && { name: data.name }),
          ...(data.slug && { slug: data.slug }),
          ...(data.address && { address: data.address }),
          ...(data.city && { city: data.city }),
          ...(data.postalCode && { postalCode: data.postalCode }),
          ...(data.phone && { phone: data.phone }),
          ...(data.email && { email: data.email }),
          ...(data.description && { description: data.description }),
          ...(data.latitude !== undefined && { latitude: data.latitude }),
          ...(data.longitude !== undefined && { longitude: data.longitude }),
          ...(Object.keys(settings).length > 0 && { settings }),
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

  static async toggleStatus(id: string) {
    try {
      const store = await db.store.findUnique({
        where: { id },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const settings = typeof store.settings === 'string'
        ? JSON.parse(store.settings)
        : (store.settings || {});

      const currentStatus = settings.status || 'OPEN';
      const newStatus = currentStatus === 'OPEN' ? 'CLOSED' : 'OPEN';

      return await db.store.update({
        where: { id },
        data: {
          settings: {
            ...settings,
            status: newStatus,
          },
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

  static async setStatus(id: string, status: 'OPEN' | 'CLOSED' | 'TEMPORARILY_CLOSED') {
    try {
      const store = await db.store.findUnique({
        where: { id },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const settings = typeof store.settings === 'string'
        ? JSON.parse(store.settings)
        : (store.settings || {});

      return await db.store.update({
        where: { id },
        data: {
          settings: {
            ...settings,
            status,
          },
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
}