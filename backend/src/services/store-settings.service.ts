import { db } from "./db";
import { AddressService } from "./address.service";
import { ApiError } from "../middleware/errorHandler";
import { verifierLaTva } from "./merchant-profile.service";
import {
  libelleDeLEtablissement,
  libelleDeLaCuisine,
  CODES_ETABLISSEMENT,
  CODES_CUISINE,
} from "./store-type.service";

export interface StoreSettingsData {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  /** Position de la suggestion d'adresse retenue, si l'écran en a une. */
  latitude?: number | null;
  longitude?: number | null;
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
  delivery?: {
    useOwnDelivery?: boolean;
  };
  businessType?: string;
  cuisineType?: string | null;
  /**
   * L'identité de facturation propre à cette boutique.
   *
   * Vide, c'est celle de la société qui s'applique. Renseignée, elle prime :
   * trois commerces peuvent relever de trois sociétés, donc de trois numéros
   * de TVA.
   */
  legalName?: string | null;
  vatNumber?: string | null;
  registrationNumber?: string | null;
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

      const org = await db.organization.findUnique({
        where: { id: store.orgId },
        select: {
          legalName: true,
          vatNumber: true,
          registrationNumber: true,
          billingCountry: true,
          name: true,
        },
      });

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
        businessType: store.businessType,
        businessTypeLibelle: libelleDeLEtablissement(store.businessType),
        cuisineType: store.cuisineType,
        cuisineTypeLibelle: libelleDeLaCuisine(store.cuisineType),
        legalName: store.legalName,
        vatNumber: store.vatNumber,
        registrationNumber: store.registrationNumber,
        /**
         * Ce que la société fournit par défaut, et ce qui s'appliquera.
         *
         * L'écran doit pouvoir dire « hérité de votre société » plutôt que de
         * laisser trois champs vides que le commerçant croirait manquants.
         */
        facturation: {
          societe: {
            legalName: org?.legalName || null,
            vatNumber: org?.vatNumber || null,
            registrationNumber: org?.registrationNumber || null,
            pays: org?.billingCountry || "France",
          },
          effective: {
            legalName: store.legalName || org?.legalName || null,
            vatNumber: store.vatNumber || org?.vatNumber || null,
            registrationNumber: store.registrationNumber || org?.registrationNumber || null,
          },
          propre: !!(store.legalName || store.vatNumber || store.registrationNumber),
        },
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

      const currentSettings = (typeof store.settings === 'object' && store.settings ? store.settings : {}) as Record<string, any>;
      const updatedSettings = {
        ...currentSettings,
        ...(data.timezone && { timezone: data.timezone }),
        ...(data.currency && { currency: data.currency }),
        ...(data.language && { language: data.language }),
        ...(data.website && { website: data.website }),
        ...(data.logo && { logo: data.logo }),
        ...(data.banner && { banner: data.banner }),
        ...(data.notifications && { notifications: data.notifications }),
        ...(data.delivery && { delivery: data.delivery }),
      };

    const texte = (valeur: unknown) => {
      const propre = String(valeur ?? "").trim();
      return propre || null;
    };

    const facturation: Record<string, string | null> = {};

    for (const champ of ["legalName", "registrationNumber"] as const) {
      if (data[champ] !== undefined) facturation[champ] = texte(data[champ]);
    }

    if (data.vatNumber !== undefined) {
      const tva = texte(data.vatNumber)?.replace(/\s+/g, "").toUpperCase() || null;

      if (tva) {
        // Le pays est celui de la société : la boutique ne déclare pas le sien.
        const org = await db.organization.findUnique({
          where: { id: store.orgId },
          select: { billingCountry: true },
        });

        verifierLaTva(tva, org?.billingCountry || "France");
      }

      facturation.vatNumber = tva;
    }

    if (data.businessType !== undefined && !CODES_ETABLISSEMENT.includes(data.businessType as never)) {
      throw new ApiError(400, "Type d'établissement inconnu", "UNKNOWN_BUSINESS_TYPE");
    }

    if (data.cuisineType !== undefined && data.cuisineType && !CODES_CUISINE.includes(data.cuisineType as never)) {
      throw new ApiError(400, "Type de cuisine inconnu", "UNKNOWN_CUISINE_TYPE");
    }

      const updateData: any = {
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
        ...(data.address && { address: data.address }),
        ...(data.city && { city: data.city }),
        ...(data.postalCode && { postalCode: data.postalCode }),
        ...(data.phone && { phone: data.phone }),
        ...(data.email && { email: data.email }),
        ...(data.businessType !== undefined && { businessType: data.businessType }),
        // Une cuisine n'a de sens qu'en restauration.
        ...(data.cuisineType !== undefined && {
          cuisineType:
            (data.businessType ?? store.businessType) === "restaurant" ? data.cuisineType : null,
        }),
        ...facturation,
        settings: updatedSettings,
      };

      // L'adresse change : la position suit.
      const position = await AddressService.repositionner(store, {
        address: updateData.address ?? store.address,
        city: updateData.city ?? store.city,
        postalCode: updateData.postalCode ?? store.postalCode,
      }, { latitude: data.latitude, longitude: data.longitude });

      if (position) {
        updateData.latitude = position.latitude;
        updateData.longitude = position.longitude;
        updateData.countryCode = position.pays;
      }

      await db.store.update({ where: { id: storeId }, data: updateData });

      // Relu par le même chemin que la lecture : l'écran reçoit l'héritage
      // depuis la société, et non un objet à moitié rempli. `position` dit à
      // l'écran si la nouvelle adresse a pu être située.
      const relus = await this.getSettings(storeId);
      return position
        ? { ...relus, position: position.trouvee ? "recalculee" : "introuvable" }
        : relus;
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

      const settings = (typeof store.settings === 'object' && store.settings ? store.settings : {}) as Record<string, any>;
      settings.logo = logoUrl;

      return await db.store.update({
        where: { id: storeId },
        data: { settings },
      });
    } catch (error) {
      throw error;
    }
  }

  /** La boutique retrouve son initiale sur fond coloré. */
  static async removeLogo(storeId: string) {
    const store = await db.store.findUnique({ where: { id: storeId } });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    const { logo: _retire, ...settings } = (
      typeof store.settings === "object" && store.settings ? store.settings : {}
    ) as Record<string, any>;

    return db.store.update({ where: { id: storeId }, data: { settings } });
  }

  static async uploadBanner(storeId: string, bannerUrl: string) {
    try {
      const store = await db.store.findUnique({
        where: { id: storeId },
      });

      if (!store) {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }

      const settings = (typeof store.settings === 'object' && store.settings ? store.settings : {}) as Record<string, any>;
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
