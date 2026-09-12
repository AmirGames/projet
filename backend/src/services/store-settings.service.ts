import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

export interface StoreSettingsData {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  banner?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  notifications?: {
    orderNotifications?: boolean;
    lowStockAlerts?: boolean;
    reviewNotifications?: boolean;
    emailNotifications?: boolean;
  };
  businessHours?: {
    defaultOpen?: string;
    defaultClose?: string;
  };
}

export class StoreSettingsService {
  static async getSettings(storeId: string) {
    try {
      const store = await db.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      return {
        id: store.id,
        name: store.name,
        slug: store.slug,
        description: store.description,
        address: store.address,
        city: store.city,
        postalCode: store.postalCode,
        phone: store.phone,
        email: store.email,
        settings: store.settings || {},
      };
    } catch (error) {
      throw error;
    }
  }

  static async updateSettings(storeId: string, data: StoreSettingsData) {
    try {
      const store = await db.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const currentSettings = store.settings || {};
      const updatedSettings = {
        ...currentSettings,
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.currency && { currency: data.currency }),
        ...(data.language && { language: data.language }),
        ...(data.website && { website: data.website }),
        ...(data.logo && { logo: data.logo }),
        ...(data.banner && { banner: data.banner }),
        ...(data.notifications && { notifications: data.notifications }),
        ...(data.businessHours && { businessHours: data.businessHours }),
      };

      const updateData: any = {
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
        ...(data.address && { address: data.address }),
        ...(data.city && { city: data.city }),
        ...(data.postalCode && { postalCode: data.postalCode }),
        ...(data.phone && { phone: data.phone }),
        ...(data.email && { email: data.email }),
        settings: updatedSettings,
      };

      const updated = await db.store.update({
        where: { id: storeId },
        data: updateData,
      });

      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        address: updated.address,
        city: updated.city,
        postalCode: updated.postalCode,
        phone: updated.phone,
        email: updated.email,
        settings: updated.settings || {},
      };
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }
      throw error;
    }
  }

  static async uploadLogo(storeId: string, logoUrl: string) {
    try {
      const store = await db.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const settings = store.settings || {};
      settings.logo = logoUrl;

      return await db.store.update({
        where: { id: storeId },
        data: { settings },
      });
    } catch (error) {
      throw error;
    }
  }

  static async uploadBanner(storeId: string, bannerUrl: string) {
    try {
      const store = await db.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const settings = store.settings || {};
      settings.banner = bannerUrl;

      return await db.store.update({
        where: { id: storeId },
        data: { settings },
      });
    } catch (error) {
      throw error;
    }
  }
}
