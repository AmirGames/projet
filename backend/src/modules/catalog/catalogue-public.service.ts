import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { perimetreBoutiques, type Acteur } from "../auth/autorisation-boutique";
import { ProductService } from "./product.service";
import { CategoryService } from "./category.service";
import { VariantService } from "./variant.service";

const boutiquePublique = {
  deletedAt: null,
  org: { status: "ACTIVE", approvedAt: { not: null } },
} satisfies Prisma.StoreWhereInput;

export const produitPublic = {
  status: "ACTIVE", deletedAt: null, store: boutiquePublique,
} satisfies Prisma.ProductWhereInput;

/** Liste explicite : un nouveau champ de gestion ne devient jamais public par défaut. */
export const champsProduitPublic = {
  id: true, storeId: true, name: true, description: true, price: true,
  categoryId: true, isAvailable: true, displayOrder: true, variantLabel: true,
  category: { select: { id: true, storeId: true, name: true, displayOrder: true, sortMode: true } },
  images: { select: { id: true, url: true, order: true }, orderBy: { order: "asc" } },
  media: { select: { id: true, url: true, alt: true, type: true, displayOrder: true }, orderBy: { displayOrder: "asc" } },
  variants: { select: { id: true, label: true, price: true, isAvailable: true, displayOrder: true }, orderBy: { displayOrder: "asc" } },
} satisfies Prisma.ProductSelect;

async function vueGestion(storeId: string, acteur: Acteur) {
  if (!acteur.userId) return false;
  const scope = await perimetreBoutiques(acteur);
  return !!await db.store.findFirst({ where: { AND: [{ id: storeId }, scope] }, select: { id: true } });
}

export class CataloguePublicService {
  static async productById(id: string, acteur: Acteur) {
    const resource = await db.product.findUnique({ where: { id }, select: { storeId: true } });
    if (resource && await vueGestion(resource.storeId, acteur)) return ProductService.getById(id);
    const product = await db.product.findFirst({ where: { id, ...produitPublic }, select: champsProduitPublic });
    if (!product) throw new ApiError(404, "Produit introuvable", "PRODUCT_NOT_FOUND");
    return product;
  }

  static async productsByStore(storeId: string, limit: number, offset: number, acteur: Acteur) {
    if (await vueGestion(storeId, acteur)) {
      return { products: await ProductService.getByStoreId(storeId, limit, offset), total: await ProductService.countByStoreId(storeId) };
    }
    const where = { storeId, ...produitPublic };
    const [products, total] = await Promise.all([
      db.product.findMany({ where, select: champsProduitPublic, orderBy: { displayOrder: "asc" }, take: limit, skip: offset }),
      db.product.count({ where }),
    ]);
    return { products, total };
  }

  static async productsByCategory(categoryId: string, limit: number, offset: number, acteur: Acteur) {
    const category = await db.category.findUnique({ where: { id: categoryId }, select: { storeId: true } });
    if (!category) throw new ApiError(404, "Catégorie introuvable", "CATEGORY_NOT_FOUND");
    if (await vueGestion(category.storeId, acteur)) return ProductService.getByCategoryId(categoryId, limit, offset);
    return db.product.findMany({ where: { categoryId, storeId: category.storeId, ...produitPublic }, select: champsProduitPublic, take: limit, skip: offset, orderBy: { displayOrder: "asc" } });
  }

  static async search(storeId: string, query: string, limit: number, acteur: Acteur) {
    if (await vueGestion(storeId, acteur)) return ProductService.search(storeId, query, limit);
    return db.product.findMany({
      where: { storeId, ...produitPublic, OR: [{ name: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] },
      select: champsProduitPublic, take: limit,
    });
  }

  private static categorySelect(storeId?: string) {
    return {
      id: true, storeId: true, name: true, displayOrder: true, sortMode: true,
      products: { where: { ...produitPublic, ...(storeId ? { storeId } : {}) }, select: champsProduitPublic, orderBy: { displayOrder: "asc" } },
    } satisfies Prisma.CategorySelect;
  }

  static async categoryById(id: string, acteur: Acteur) {
    const resource = await db.category.findUnique({ where: { id }, select: { storeId: true } });
    if (resource && await vueGestion(resource.storeId, acteur)) return CategoryService.getById(id);
    const category = await db.category.findFirst({ where: { id, store: boutiquePublique }, select: this.categorySelect(resource?.storeId) });
    if (!category) throw new ApiError(404, "Catégorie introuvable", "CATEGORY_NOT_FOUND");
    return category;
  }

  static async categoriesByStore(storeId: string, acteur: Acteur) {
    if (await vueGestion(storeId, acteur)) return CategoryService.getByStoreId(storeId);
    return db.category.findMany({ where: { storeId, store: boutiquePublique }, select: this.categorySelect(storeId), orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] });
  }

  static async variants(productId: string, acteur: Acteur) {
    const product = await this.productById(productId, acteur);
    if (await vueGestion(product.storeId, acteur)) return VariantService.lister(productId);
    return product.variants.map(variant => ({
      id: variant.id, label: variant.label, price: variant.price === null ? null : Number(variant.price),
      prixEffectif: Number(variant.price ?? product.price), isAvailable: variant.isAvailable, displayOrder: variant.displayOrder,
    }));
  }
}
