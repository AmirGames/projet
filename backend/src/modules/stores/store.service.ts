import type { Prisma } from "@prisma/client";
import { db, type ClientTransaction } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { AddressService, paysDeLAdresse } from "../customers/address.service";
import { logger } from "../../config/logger";
import { codeErreur } from "../../utils/code-erreur";

/**
 * Les taux de TVA belges préajoutés à la création d'une boutique (en %).
 * Le commerçant les modifie ou les supprime ensuite comme n'importe quel réglage.
 */
export const TAUX_TVA_PAR_DEFAUT_BE = [6, 12, 21] as const;

/** Ce que la route de mise à jour d'une boutique accepte (voir `updateStoreSchema`). */
export interface UpdateStoreData {
  name?: string;
  slug?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  description?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  timezone?: string;
  currency?: string;
  latitude?: number;
  longitude?: number;
  businessType?: string;
  cuisineType?: string;
}

export class StoreService {
  /** Résout l'adresse avant les écritures, notamment avant une transaction d'inscription. */
  static async situer(data: {
    address?: string;
    city?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  }) {
    let { latitude, longitude } = data;
    let countryCode = paysDeLAdresse(data);

    if (latitude == null || longitude == null) {
      const texte = [data.address, data.postalCode, data.city].filter(Boolean).join(" ");
      if (texte.trim().length >= 3) {
        const situation = await AddressService.situer(texte);
        countryCode = paysDeLAdresse(data, situation.adresse);
        if (situation.point) {
          latitude = situation.point.latitude;
          longitude = situation.point.longitude;
        } else {
          logger.warn("Store created without coordinates", { texte });
        }
      }
    }
    return { latitude, longitude, countryCode };
  }

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
    /** Réglages de départ : le site web saisi à l'inscription, par exemple. */
    settings?: Record<string, unknown>;
  }, options: {
    client?: Pick<ClientTransaction, "organization" | "store">;
    situation?: Awaited<ReturnType<typeof StoreService.situer>>;
  } = {}) {
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
    const { latitude, longitude, countryCode } = options.situation ?? await this.situer(data);
    const client = options.client ?? db;

    // Une nouvelle boutique d'un commerce pas encore validé naît fermée.
    const org = await client.organization.findUnique({
      where: { id: data.orgId },
      select: { approvedAt: true },
    });

    try {
      const store = await client.store.create({
        data: {
          orgId: data.orgId,
          // Les trois taux de TVA belges, préajoutés : le commerçant n'a qu'à
          // affecter ses catégories et ses articles. Il peut les modifier ou
          // les supprimer comme les autres réglages. Pas de taux par défaut
          // pour une boutique établie en France (taux différents).
          ...(countryCode !== "FR" && {
            taxSettings: {
              create: TAUX_TVA_PAR_DEFAUT_BE.map((taux) => ({
                name: `TVA ${taux} %`,
                rate: taux,
                applicableTo: "all",
                included: true,
                status: "ACTIVE",
              })),
            },
          }),
          isOpen: !!org?.approvedAt,
          name: data.name,
          slug: data.slug,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
          countryCode,
          phone: data.phone,
          email: data.email,
          description: data.description,
          latitude,
          longitude,
          businessType: data.businessType,
          // Une cuisine n'a de sens qu'en restauration : la retenir pour une
          // épicerie brouillerait la recherche du client.
          cuisineType: data.businessType === "restaurant" ? data.cuisineType : null,
          ...(data.settings && { settings: data.settings }),
        },
        include: {
          products: true,
          categories: true,
          theme: true,
        },
      });

      return store;
    } catch (error) {
      if (codeErreur(error) === "P2002") {
        throw new ApiError(409, "Store slug already exists in organization", "SLUG_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    // Jamais de commandes ici : elles portent nom, e-mail, téléphone et
    // adresse des clients. Elles ont leurs propres routes, cloisonnées.
    const store = await db.store.findFirst({
      where: { id, deletedAt: null },
      include: {
        products: { where: { status: "ACTIVE" } },
        categories: true,
        theme: true,
      },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    return store;
  }

  /** `scope` : le périmètre de boutiques de l'appelant (MANAGER/STAFF : les siennes). */
  static async getByOrgId(orgId: string, scope: Prisma.StoreWhereInput = {}) {
    return await db.store.findMany({
      where: { AND: [{ orgId, deletedAt: null }, scope] },
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
        // Route publique : seulement ce qui décrit le commerce aux clients.
        // L'organisation entière partait avec la vitrine — IBAN, date de
        // naissance et coordonnées du propriétaire compris.
        org: { select: { id: true, name: true, slug: true, status: true, approvedAt: true } },
      },
    });

    if (!store) {
      throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
    }

    return store;
  }

  static async update(id: string, data: UpdateStoreData) {
    try {
      const settingsFields = ['logo', 'primaryColor', 'secondaryColor', 'timezone', 'currency'] as const;
      const settings: Prisma.JsonObject = {};

      for (const field of settingsFields) {
        const valeur = data[field];
        if (valeur !== undefined) settings[field] = valeur;
      }

      /**
       * L'adresse change sans position posée à la main : la position suit.
       * Une position fournie explicitement — la carte des zones — l'emporte.
       */
      let position: { latitude: number | null; longitude: number | null; pays: string | null } | null =
        null;

      if (
        (data.address || data.city || data.postalCode) &&
        data.latitude === undefined &&
        data.longitude === undefined
      ) {
        const avant = await db.store.findUnique({
          where: { id },
          select: { address: true, city: true, postalCode: true },
        });

        if (avant) {
          position = await AddressService.repositionner(avant, {
            address: data.address || avant.address,
            city: data.city || avant.city,
            postalCode: data.postalCode || avant.postalCode,
          });
        }
      }

      return await db.store.update({
        where: { id },
        data: {
          ...(position && {
            latitude: position.latitude,
            longitude: position.longitude,
            countryCode: position.pays,
          }),
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
        },
        include: {
          products: true,
          categories: true,
        },
      });
    } catch (error) {
      if (codeErreur(error) === "P2025") {
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
    } catch (error) {
      if (codeErreur(error) === "P2025") {
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
    } catch (error) {
      if (codeErreur(error) === "P2025") {
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
    } catch (error) {
      if (codeErreur(error) === "P2025") {
        throw new ApiError(404, "Store not found", "STORE_NOT_FOUND");
      }
      throw error;
    }
  }
}
