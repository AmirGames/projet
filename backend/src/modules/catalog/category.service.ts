import type { Prisma } from "@prisma/client";
import { exigerBoutique, type Acteur } from "../auth/autorisation-boutique";
import { validerOrdre, exigerLotComplet } from "./reordonnancement";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { codeErreur } from "../../utils/code-erreur";

export interface CategoryData {
  storeId: string;
  name: string;
  displayOrder?: number;
  sortMode?: "MANUAL" | "ALPHA_ASC" | "ALPHA_DESC" | "PRICE_ASC" | "PRICE_DESC";
}

/**
 * Trie les produits d'une catégorie selon le mode choisi par le commerçant.
 *
 * MANUEL (ou absent) laisse l'ordre déjà voulu — celui du glisser-déposer,
 * porté par `displayOrder` en amont. Les autres modes recalculent l'ordre à
 * la volée : rien à ranger en base, et le tri suit un changement de prix
 * sans qu'on ait à y repenser.
 */
export function trierProduitsSelonCategorie<T extends { name: string; price: unknown }>(
  produits: T[],
  sortMode: string | null | undefined
): T[] {
  const prix = (p: T) => Number(p.price);

  switch (sortMode) {
    case "ALPHA_ASC":
      return [...produits].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    case "ALPHA_DESC":
      return [...produits].sort((a, b) => b.name.localeCompare(a.name, "fr", { sensitivity: "base" }));
    case "PRICE_ASC":
      return [...produits].sort((a, b) => prix(a) - prix(b));
    case "PRICE_DESC":
      return [...produits].sort((a, b) => prix(b) - prix(a));
    default:
      return produits;
  }
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
    } catch (err) {
      if (codeErreur(err) === "P2002") {
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
          sortMode: data.sortMode,
        },
        include: { products: true },
      });
    } catch (err) {
      if (codeErreur(err) === "P2025") {
        throw new ApiError(404, "Category not found", "CATEGORY_NOT_FOUND");
      }
      if (codeErreur(err) === "P2002") {
        throw new ApiError(400, "Category name already exists for this store", "DUPLICATE_NAME");
      }
      throw err;
    }
  }

  static async reorder(storeId: string, value: unknown, acteur: Acteur) {
    await exigerBoutique(acteur, storeId, "manage");
    const ordering = validerOrdre(value);
    await db.$transaction(async tx => {
      exigerLotComplet(ordering.length, await tx.category.count({ where: { storeId, id: { in: ordering.map(item => item.id) } } }));
      for (const item of ordering) {
        const result = await tx.category.updateMany({ where: { id: item.id, storeId }, data: { displayOrder: item.displayOrder } });
        exigerLotComplet(1, result.count);
      }
    });
    return this.getByStoreId(storeId);
  }

  static async delete(id: string) {
    try {
      await db.category.delete({
        where: { id },
      });
    } catch (err) {
      if (codeErreur(err) === "P2025") {
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

  static async getByOrgId(orgId: string, scope: Prisma.StoreWhereInput = {}) {
    return await db.category.findMany({
      where: {
        store: { AND: [{ orgId }, scope] },
      },
      include: {
        products: true,
        store: true,
      },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  static async countByOrgId(orgId: string, scope: Prisma.StoreWhereInput = {}) {
    return await db.category.count({
      where: {
        store: { AND: [{ orgId }, scope] },
      },
    });
  }
}