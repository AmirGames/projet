import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { AddressService } from "./address.service";
import { logger } from "../config/logger";

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
    businessType?: string;
    cuisineType?: string;
  }) {
    /**
     * Une boutique naît située.
     *
     * Elle naissait sans coordonnées dès que le formulaire n'en fournissait
     * pas : invisible de l'attribution des courses et de ses propres zones de
     * livraison, sans que rien ne le dise. Le commerçant créait sa boutique,
     * réglait ses zones, et aucun livreur ne venait jamais.
     *
     * Le géocodage ne bloque pas la création : un service d'adresses en panne
     * ne doit pas empêcher d'ouvrir un commerce. La fiche de la plateforme
     * signale alors la boutique comme non située.
     */
    let { latitude, longitude } = data;

    if (latitude == null || longitude == null) {
      const texte = [data.address, data.postalCode, data.city].filter(Boolean).join(" ");

      if (texte.trim().length >= 3) {
        const situation = await AddressService.situer(texte);

        if (situation.point) {
          latitude = situation.point.latitude;
          longitude = situation.point.longitude;
        } else {
          logger.warn("Store created without coordinates", { slug: data.slug, texte });
        }
      }
    }

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
          latitude,
          longitude,
          businessType: data.businessType,
          // Une cuisine n'a de sens qu'en restauration : la retenir pour une
          // épicerie brouillerait la recherche du client.
          cuisineType: data.businessType === "restaurant" ? data.cuisineType : null,
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
          ...(data.businessType !== undefined && { businessType: data.businessType }),
          ...(data.cuisineType !== undefined && { cuisineType: data.cuisineType }),
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