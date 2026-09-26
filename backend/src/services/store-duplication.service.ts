import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { StoreService } from "./store.service";
import { PlanService } from "./plan.service";

/**
 * Ouvrir une boutique de plus sur le modèle d'une autre.
 *
 * Le patron de dix night shops remplissait dix fois le même catalogue : mêmes
 * catégories, mêmes articles, mêmes horaires, mêmes zones. Seuls changent le
 * nom, l'adresse et le téléphone ; le reste est recopié depuis la boutique
 * modèle.
 *
 * Recopié : réglages, horaires, créneaux, options de livraison, thème,
 * catégories, produits (photos, options, variantes, médias, SEO), étiquettes,
 * taxes, zones de livraison, promotions, moyens de paiement de la boutique.
 *
 * Jamais recopié : commandes, avis, factures, notifications, personnel, paniers
 * et favoris des clients — l'histoire d'une boutique ne se duplique pas.
 */
export interface DuplicationBoutique {
  name: string;
  slug: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
}

export class StoreDuplicationService {
  static async duplicate(sourceId: string, data: DuplicationBoutique) {
    const source = await db.store.findFirst({
      where: { id: sourceId, deletedAt: null },
      include: {
        theme: true,
        categories: true,
        products: {
          where: { deletedAt: null },
          include: { images: true, options: true, variants: true, media: true, seo: true },
        },
        tags: true,
        taxSettings: true,
        deliveryZones: true,
        promotions: true,
        paymentMethods: { where: { userId: null } },
      },
    });

    if (!source) {
      throw new ApiError(404, "Boutique modèle introuvable", "STORE_NOT_FOUND");
    }

    // Le nombre de boutiques dépend de la formule souscrite.
    await PlanService.verifierCreationBoutique(source.orgId);

    // La création géocode la nouvelle adresse et décide si la boutique naît
    // ouverte, comme pour toute boutique.
    const store = await StoreService.create({
      orgId: source.orgId,
      name: data.name,
      slug: data.slug,
      address: data.address,
      city: data.city,
      postalCode: data.postalCode,
      phone: data.phone,
      email: data.email ?? source.email ?? undefined,
      description: source.description ?? undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      businessType: source.businessType ?? undefined,
      cuisineType: source.cuisineType ?? undefined,
      settings: (source.settings ?? {}) as Record<string, unknown>,
    });

    try {
      await db.$transaction(
        async (tx) => {
          await tx.store.update({
            where: { id: store.id },
            data: {
              legalName: source.legalName,
              vatNumber: source.vatNumber,
              registrationNumber: source.registrationNumber,
              operatingHours: source.operatingHours as any,
              pickupSlots: source.pickupSlots as any,
              acceptsDelivery: source.acceptsDelivery,
              acceptsPickup: source.acceptsPickup,
              deliveryCost: source.deliveryCost,
              minDeliveryAmount: source.minDeliveryAmount,
            },
          });

          if (source.theme) {
            await tx.theme.create({
              data: {
                storeId: store.id,
                config: source.theme.config as any,
                customCss: source.theme.customCss,
                status: source.theme.status,
              },
            });
          }

          // Les anciens identifiants vers les nouveaux : taxes, étiquettes et
          // promotions désignent catégories et produits par leur identifiant.
          const categories = new Map<string, string>();
          for (const c of source.categories) {
            const copie = await tx.category.create({
              data: { storeId: store.id, name: c.name, displayOrder: c.displayOrder, sortMode: c.sortMode },
            });
            categories.set(c.id, copie.id);
          }

          const produits = new Map<string, string>();
          for (const p of source.products) {
            const copie = await tx.product.create({
              data: {
                storeId: store.id,
                sku: p.sku,
                name: p.name,
                description: p.description,
                price: p.price,
                categoryId: p.categoryId ? categories.get(p.categoryId) ?? null : null,
                stock: p.stock,
                lowStockThreshold: p.lowStockThreshold,
                isAvailable: p.isAvailable,
                displayOrder: p.displayOrder,
                status: p.status,
                variantLabel: p.variantLabel,
              },
            });
            produits.set(p.id, copie.id);

            // Les fichiers ne sont pas recopiés : les deux boutiques pointent
            // vers la même photo, qu'aucune suppression de produit n'efface.
            if (p.images.length) {
              await tx.productImage.createMany({
                data: p.images.map((i) => ({ productId: copie.id, url: i.url, order: i.order })),
              });
            }
            if (p.media.length) {
              await tx.productMedia.createMany({
                data: p.media.map((m) => ({
                  productId: copie.id,
                  url: m.url,
                  alt: m.alt,
                  type: m.type,
                  displayOrder: m.displayOrder,
                })),
              });
            }

            const options = new Map<string, string>();
            for (const o of p.options) {
              const opt = await tx.productOption.create({
                data: {
                  productId: copie.id,
                  name: o.name,
                  choices: o.choices as any,
                  isRequired: o.isRequired,
                  pricingType: o.pricingType,
                },
              });
              options.set(o.id, opt.id);
            }

            for (const v of p.variants) {
              await tx.productVariant.create({
                data: {
                  productId: copie.id,
                  sku: v.sku,
                  label: v.label,
                  displayOrder: v.displayOrder,
                  combination: remapperCles(v.combination, options) as any,
                  price: v.price,
                  stock: v.stock,
                  isAvailable: v.isAvailable,
                },
              });
            }

            if (p.seo) {
              // Le slug SEO est unique sur toute la plateforme.
              await tx.productSeo.create({
                data: {
                  productId: copie.id,
                  metaTitle: p.seo.metaTitle,
                  metaDescription: p.seo.metaDescription,
                  metaKeywords: p.seo.metaKeywords,
                  slug: `${p.seo.slug}-${store.slug}`,
                  ogImage: p.seo.ogImage,
                  ogDescription: p.seo.ogDescription,
                },
              });
            }
          }

          const versCategories = (ids: string[]) => remapper(ids, categories);
          const versProduits = (ids: string[]) => remapper(ids, produits);

          if (source.tags.length) {
            await tx.productTag.createMany({
              data: source.tags.map((t) => ({
                storeId: store.id,
                name: t.name,
                slug: t.slug,
                description: t.description,
                color: t.color,
                productIds: versProduits(t.productIds),
              })),
            });
          }

          if (source.taxSettings.length) {
            await tx.taxSetting.createMany({
              data: source.taxSettings.map((t) => ({
                storeId: store.id,
                name: t.name,
                rate: t.rate,
                included: t.included,
                applicableTo: t.applicableTo,
                categoryIds: versCategories(t.categoryIds),
                productIds: versProduits(t.productIds),
                status: t.status,
              })),
            });
          }

          if (source.deliveryZones.length) {
            await tx.deliveryZone.createMany({
              data: source.deliveryZones.map((z) => ({
                storeId: store.id,
                name: z.name,
                type: z.type,
                radiusKm: z.radiusKm,
                deliveryMinutes: z.deliveryMinutes,
                isActive: z.isActive,
                // Une zone dessinée suit les rues autour de la boutique modèle :
                // elle est recopiée, mais désactivée, à redessiner autour de la
                // nouvelle adresse. Un rayon, lui, suit la boutique.
                ...(z.type === "POLYGON" && { isActive: false }),
                polygon: z.polygon ?? undefined,
                color: z.color,
                opacity: z.opacity,
                baseFee: z.baseFee,
                minOrder: z.minOrder,
              })) as any,
            });
          }

          if (source.promotions.length) {
            // Compteurs d'utilisation remis à zéro : la nouvelle boutique n'a
            // encore servi personne.
            await tx.promotion.createMany({
              data: source.promotions.map((p) => ({
                storeId: store.id,
                code: p.code,
                description: p.description,
                type: p.type,
                discountType: p.discountType,
                discountValue: p.discountValue,
                applicableToAll: p.applicableToAll,
                productIds: versProduits(p.productIds),
                categoryIds: versCategories(p.categoryIds),
                startDate: p.startDate,
                endDate: p.endDate,
                expiresAt: p.expiresAt,
                isActive: p.isActive,
                activeFromTime: p.activeFromTime,
                activeToTime: p.activeToTime,
                activeDays: p.activeDays,
                minOrderAmount: p.minOrderAmount,
                maxUses: p.maxUses,
                maxUsesPerCustomer: p.maxUsesPerCustomer,
                status: p.status,
              })),
            });
          }

          if (source.paymentMethods.length) {
            // L'identifiant Stripe est unique : il reste à la boutique modèle.
            await tx.paymentMethod.createMany({
              data: source.paymentMethods.map((m) => ({
                storeId: store.id,
                type: m.type,
                name: m.name,
                config: m.config as any,
                isDefault: m.isDefault,
                isActive: m.isActive,
                commissionPercent: m.commissionPercent,
                fixedFee: m.fixedFee,
              })),
            });
          }
        },
        { timeout: 120_000, maxWait: 10_000 }
      );
    } catch (error) {
      // Une copie à moitié faite serait pire que pas de copie.
      logger.error("Store duplication failed", { sourceId, storeId: store.id, error });
      await db.store.delete({ where: { id: store.id } }).catch(() => undefined);
      throw error;
    }

    logger.info("Store duplicated", {
      sourceId,
      storeId: store.id,
      categories: source.categories.length,
      products: source.products.length,
    });

    return db.store.findUnique({ where: { id: store.id } });
  }
}

function remapper(ids: string[], table: Map<string, string>) {
  return ids.map((id) => table.get(id)).filter((id): id is string => !!id);
}

function remapperCles(valeur: unknown, table: Map<string, string>) {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return valeur ?? {};
  return Object.fromEntries(
    Object.entries(valeur as Record<string, unknown>).map(([cle, v]) => [table.get(cle) ?? cle, v])
  );
}
