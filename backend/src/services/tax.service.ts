import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;

export interface TaxSettingData {
  name: string;
  rate: number;
  applicableTo?: string;
  categoryIds?: string[];
  productIds?: string[];
}

export class TaxService {
  static async getTaxSettings(storeId: string, options?: { skip?: number; take?: number; status?: string }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      if (options?.status) {
        whereClause.status = options.status;
      }

      const [taxSettings, total] = await Promise.all([
        db.taxSetting.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.taxSetting.count({ where: whereClause }),
      ]);

      return {
        data: taxSettings,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getTaxSetting(storeId: string, taxSettingId: string) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      return taxSetting;
    } catch (error) {
      throw error;
    }
  }

  static async createTaxSetting(storeId: string, data: TaxSettingData) {
    try {
      if (data.rate < 0 || data.rate > 100) {
        throw new ApiError(400, "Tax rate must be between 0 and 100", "INVALID_TAX_RATE");
      }

      const taxSetting = await db.taxSetting.create({
        data: {
          storeId,
          name: data.name,
          rate: new Decimal(data.rate),
          applicableTo: data.applicableTo || "all",
          categoryIds: data.categoryIds || [],
          productIds: data.productIds || [],
          status: "ACTIVE",
        },
      });

      return taxSetting;
    } catch (error) {
      throw error;
    }
  }

  static async updateTaxSetting(storeId: string, taxSettingId: string, data: Partial<TaxSettingData>) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      if (data.rate !== undefined && (data.rate < 0 || data.rate > 100)) {
        throw new ApiError(400, "Tax rate must be between 0 and 100", "INVALID_TAX_RATE");
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.rate !== undefined) updateData.rate = new Decimal(data.rate);
      if (data.applicableTo !== undefined) updateData.applicableTo = data.applicableTo;
      if (data.categoryIds !== undefined) updateData.categoryIds = data.categoryIds;
      if (data.productIds !== undefined) updateData.productIds = data.productIds;

      const updated = await db.taxSetting.update({
        where: { id: taxSettingId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteTaxSetting(storeId: string, taxSettingId: string) {
    try {
      const taxSetting = await db.taxSetting.findUnique({
        where: { id: taxSettingId },
      });

      if (!taxSetting || taxSetting.storeId !== storeId) {
        throw new ApiError(404, "Tax setting not found", "TAX_SETTING_NOT_FOUND");
      }

      await db.taxSetting.delete({
        where: { id: taxSettingId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  /**
   * La taxe d'une commande, calculée au serveur.
   *
   * Le commerçant réglait sa TVA, l'écran l'enregistrait — et la commande
   * additionnait `taxAmount` tel que le *navigateur* l'annonçait. Comme aucun
   * écran ne l'envoyait, toute commande naissait avec zéro de taxe : le taux
   * réglé ne servait à rien, et le ticket n'avait rien à montrer.
   *
   * Deux choix de calcul importaient :
   *
   * - **Une seule taxe par ligne, la plus précise.** `calculateTax()` cumulait
   *   toutes les taxes applicables : une TVA « sur tout » et une TVA « sur les
   *   boissons » se seraient ajoutées sur une limonade. Ici, un réglage visant
   *   le produit l'emporte sur un réglage visant sa catégorie, qui l'emporte sur
   *   celui qui vise tout.
   * - **La taxe est comprise dans le prix** (`included`, vrai par défaut). Un
   *   prix montré à un particulier est TTC : la TVA s'en extrait, elle ne
   *   s'ajoute pas au moment de payer. Ajouter 12 % au passage en caisse ferait
   *   payer au client autre chose que ce qu'il a vu sur la carte.
   */
  static async taxeDesLignes(
    storeId: string,
    lignes: { productId: string; montant: number }[]
  ): Promise<{
    total: number;
    /** Ce qui s'ajoute au total : zéro quand la taxe est déjà comprise. */
    aAjouter: number;
    /** Le taux principal (celui qui porte le plus gros montant), pour le champ Order.taxRate. */
    taux: number;
    detail: { nom: string; taux: number; base: number; taxe: number; comprise: boolean }[];
    /**
     * Taux et montant de taxe par ligne, dans le même ordre que `lignes`.
     * Stockés sur OrderItem pour permettre le récapitulatif multi-taux sur le ticket.
     */
    parLigne: { taxRate: number; taxAmount: number }[];
  }> {
    if (lignes.length === 0) {
      return { total: 0, aAjouter: 0, taux: 0, detail: [], parLigne: [] };
    }

    const reglages = await db.taxSetting.findMany({ where: { storeId, status: "ACTIVE" } });

    if (reglages.length === 0) {
      return { total: 0, aAjouter: 0, taux: 0, detail: [], parLigne: lignes.map(() => ({ taxRate: 0, taxAmount: 0 })) };
    }

    const produits = await db.product.findMany({
      where: { id: { in: lignes.map((l) => l.productId) } },
      select: { id: true, categoryId: true },
    });

    const categorieDuProduit = new Map(produits.map((p) => [p.id, p.categoryId]));

    // Du plus précis au plus général : le premier qui correspond gagne.
    const parProduit = reglages.filter((r) => r.applicableTo === "products");
    const parCategorie = reglages.filter((r) => r.applicableTo === "categories");
    const surTout = reglages.filter((r) => r.applicableTo === "all");

    const cumul = new Map<
      string,
      { nom: string; taux: number; base: number; taxe: number; comprise: boolean }
    >();

    // Résultat par ligne (même ordre que `lignes`), pour stocker sur OrderItem.
    const parLigne: { taxRate: number; taxAmount: number }[] = [];

    for (const ligne of lignes) {
      const categorieId = categorieDuProduit.get(ligne.productId);

      const reglage =
        parProduit.find((r) => r.productIds.includes(ligne.productId)) ||
        (categorieId ? parCategorie.find((r) => r.categoryIds.includes(categorieId)) : undefined) ||
        surTout[0];

      if (!reglage) {
        // Aucune taxe ne s'applique à ce produit.
        parLigne.push({ taxRate: 0, taxAmount: 0 });
        continue;
      }

      const taux = Number(reglage.rate);

      // Comprise : on l'extrait du prix (12 % dans 112 € en font 12).
      // Ajoutée : elle se calcule sur le prix et grossit le total.
      const taxe = reglage.included
        ? (ligne.montant * taux) / (100 + taux)
        : (ligne.montant * taux) / 100;

      // Résultat arrondi pour cette ligne.
      parLigne.push({
        taxRate: taux,
        taxAmount: Number(taxe.toFixed(2)),
      });

      const vu = cumul.get(reglage.id);

      if (vu) {
        vu.base += ligne.montant;
        vu.taxe += taxe;
      } else {
        cumul.set(reglage.id, {
          nom: reglage.name,
          taux,
          base: ligne.montant,
          taxe,
          comprise: reglage.included,
        });
      }
    }

    const detail = [...cumul.values()].map((l) => ({
      ...l,
      base: Number(l.base.toFixed(2)),
      taxe: Number(l.taxe.toFixed(2)),
    }));

    const total = Number(detail.reduce((somme, l) => somme + l.taxe, 0).toFixed(2));
    const aAjouter = Number(
      detail.filter((l) => !l.comprise).reduce((somme, l) => somme + l.taxe, 0).toFixed(2)
    );

    // Le taux retenu sur la commande est celui qui porte le plus gros montant.
    // Le détail complet (multi-taux) reste dans `detail` et sur chaque OrderItem.
    const principal = [...detail].sort((a, b) => b.base - a.base)[0];

    return { total, aAjouter, taux: principal?.taux ?? 0, detail, parLigne };
  }

  static async calculateTax(storeId: string, amount: number, categoryIds?: string[], productIds?: string[]) {
    try {
      const whereClause: any = {
        storeId,
        status: "ACTIVE",
      };

      const taxSettings = await db.taxSetting.findMany({
        where: whereClause,
      });

      let totalTaxAmount = 0;

      for (const tax of taxSettings) {
        let applies = false;

        if (tax.applicableTo === "all") {
          applies = true;
        } else if (tax.applicableTo === "categories" && categoryIds) {
          applies = categoryIds.some((id) => tax.categoryIds.includes(id));
        } else if (tax.applicableTo === "products" && productIds) {
          applies = productIds.some((id) => tax.productIds.includes(id));
        }

        if (applies) {
          const taxAmount = amount * (Number(tax.rate) / 100);
          totalTaxAmount += taxAmount;
        }
      }

      return {
        totalTaxAmount: parseFloat(totalTaxAmount.toFixed(2)),
        breakdown: taxSettings.map((tax) => ({
          name: tax.name,
          rate: Number(tax.rate),
        })),
      };
    } catch (error) {
      throw error;
    }
  }
}
