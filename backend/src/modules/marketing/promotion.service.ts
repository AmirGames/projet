import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { codeErreur } from "../../utils/code-erreur";

export interface PromotionData {
  storeId: string;
  code: string;
  description?: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  applicableToAll?: boolean;
  productIds?: string[];
  categoryIds?: string[];
  startDate?: Date;
  endDate?: Date;
  maxUses?: number;
  /** Heure de début HH:MM, null = pas de restriction */
  activeFromTime?: string | null;
  /** Heure de fin HH:MM, null = pas de restriction */
  activeToTime?: string | null;
  /** Jours actifs : 0=dim … 6=sam. Vide = tous les jours */
  activeDays?: number[];
}

/** Convertit "HH:MM" en nombre de minutes depuis minuit. */
function enMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export interface LigneRemisable {
  productId: string;
  categoryId?: string | null;
  /** Prix unitaire TTC, suppléments compris. */
  price: number;
  quantity: number;
}

const enCentimes = (montant: number) => Math.round(montant * 100);

/** Total (en euros) des lignes que la promotion couvre : produits ou catégories choisis. */
export function totalDesLignesEligibles(
  promotion: { applicableToAll: boolean; productIds: string[]; categoryIds: string[] },
  lignes: LigneRemisable[],
): number {
  if (promotion.applicableToAll) {
    return lignes.reduce((somme, l) => somme + enCentimes(l.price) * l.quantity, 0) / 100;
  }
  const centimes = lignes
    .filter(
      (l) =>
        promotion.productIds.includes(l.productId) ||
        (!!l.categoryId && promotion.categoryIds.includes(l.categoryId)),
    )
    .reduce((somme, l) => somme + enCentimes(l.price) * l.quantity, 0);
  return centimes / 100;
}

/**
 * La remise sur une base remisable. Calcul en centimes ; le pourcentage est
 * arrondi au centime le plus proche (0,5 vers le haut), et la remise ne
 * dépasse jamais la base.
 */
export function calculerRemise(
  promotion: { type: string; discountValue: unknown },
  baseRemisable: number,
): number {
  const base = enCentimes(baseRemisable);
  const remise =
    promotion.type === "PERCENTAGE"
      ? Math.round((base * Number(promotion.discountValue)) / 100)
      : enCentimes(Number(promotion.discountValue));
  return Math.min(remise, base) / 100;
}

export class PromotionService {
  static async create(data: PromotionData) {
    try {
      const promotion = await db.promotion.create({
        data: {
          storeId: data.storeId,
          code: data.code.toUpperCase(),
          description: data.description,
          type: data.type,
          discountValue: data.discountValue,
          applicableToAll: data.applicableToAll ?? true,
          productIds: data.productIds || [],
          categoryIds: data.categoryIds || [],
          startDate: data.startDate,
          endDate: data.endDate,
          maxUses: data.maxUses,
          activeFromTime: data.activeFromTime ?? null,
          activeToTime:   data.activeToTime   ?? null,
          activeDays:     data.activeDays     ?? [],
        },
      });

      return promotion;
    } catch (error) {
      if (codeErreur(error) === "P2002") {
        throw new ApiError(409, "Code promo déjà utilisé dans ce store", "CODE_EXISTS");
      }
      throw error;
    }
  }

  static async getById(id: string) {
    const promotion = await db.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
    }

    return promotion;
  }

  static async getByCode(storeId: string, code: string) {
    const promotion = await db.promotion.findFirst({
      where: {
        storeId,
        code: code.toUpperCase(),
      },
    });

    if (!promotion) {
      throw new ApiError(404, "Code promo invalide", "INVALID_CODE");
    }

    return promotion;
  }

  static async getByStoreId(storeId: string) {
    return await db.promotion.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getActiveByStoreId(storeId: string) {
    const now = new Date();

    return await db.promotion.findMany({
      where: {
        storeId,
        status: "ACTIVE",
        OR: [
          { startDate: null, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: null },
          { startDate: { lte: now }, endDate: { gte: now } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async validateAndApply(
    storeId: string,
    code: string,
    cartTotal: number,
    productIds: string[] = [],
    /**
     * Les lignes du panier, tarifées par le serveur. Avec elles, une remise
     * limitée à certains produits ne porte que sur ces lignes ; sans elles
     * (aperçu public), seul le total annoncé est connu.
     */
    lignes?: LigneRemisable[]
  ) {
    const promotion = await this.getByCode(storeId, code);

    const now = new Date();

    if (promotion.status !== "ACTIVE") {
      throw new ApiError(400, "Ce code promo est inactif", "INACTIVE_CODE");
    }

    if (promotion.startDate && promotion.startDate > now) {
      throw new ApiError(400, "Ce code promo n'est pas encore valide", "FUTURE_CODE");
    }

    if (promotion.endDate && promotion.endDate < now) {
      throw new ApiError(400, "Ce code promo a expiré", "EXPIRED_CODE");
    }

    if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
      throw new ApiError(400, "Ce code promo a atteint sa limite d'utilisation", "MAX_USES_REACHED");
    }

    // ── Plage horaire ──────────────────────────────────────────────────────
    // Les prix sont TTC et vérifiés côté serveur : la plage horaire doit l'être
    // aussi. Un client qui sait que la promo est valable de 12h à 14h n'a qu'à
    // attendre que l'heure tourne côté serveur si on ne vérifie que le frontend.
    if (promotion.activeFromTime || promotion.activeToTime) {
      const now2 = new Date();
      const minutesMaintenant = now2.getHours() * 60 + now2.getMinutes();
      const debut = promotion.activeFromTime ? enMinutes(promotion.activeFromTime) : 0;
      const fin   = promotion.activeToTime   ? enMinutes(promotion.activeToTime)   : 24 * 60;

      const dansLaPlage =
        fin > debut
          ? minutesMaintenant >= debut && minutesMaintenant < fin   // même jour (12h–14h)
          : minutesMaintenant >= debut || minutesMaintenant < fin;  // passe minuit (22h–02h)

      if (!dansLaPlage) {
        const de = promotion.activeFromTime ?? "00:00";
        const a  = promotion.activeToTime   ?? "24:00";
        throw new ApiError(
          400,
          `Ce code promo n'est valable qu'entre ${de} et ${a}`,
          "OUTSIDE_TIME_WINDOW"
        );
      }
    }

    // ── Jours de la semaine ────────────────────────────────────────────────
    const jours = promotion.activeDays;
    if (jours && jours.length > 0) {
      const jourSemaine = new Date().getDay(); // 0 = dimanche
      if (!jours.includes(jourSemaine)) {
        const NOMS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
        const joursNoms = jours.map((j) => NOMS[j]).join(", ");
        throw new ApiError(
          400,
          `Ce code promo n'est valable que le : ${joursNoms}`,
          "OUTSIDE_DAY_WINDOW"
        );
      }
    }

    let baseRemisable = cartTotal;

    if (!promotion.applicableToAll) {
      if (lignes) {
        baseRemisable = totalDesLignesEligibles(promotion, lignes);
        if (baseRemisable <= 0) {
          throw new ApiError(400, "Ce code promo ne s'applique pas à ces produits", "NOT_APPLICABLE");
        }
      } else if (
        productIds.length > 0 &&
        !productIds.some((id) => promotion.productIds.includes(id))
      ) {
        throw new ApiError(400, "Ce code promo ne s'applique pas à ces produits", "NOT_APPLICABLE");
      }
    }

    // Jamais sur les frais de livraison : `cartTotal` est le total des lignes.
    const discountAmount = calculerRemise(promotion, baseRemisable);

    return {
      promotion,
      discountAmount,
      finalTotal: Number((cartTotal - discountAmount).toFixed(2)),
    };
  }

  /**
   * Rend l'utilisation réservée par une commande jamais payée, retirée ensuite.
   * Ne descend jamais sous zéro.
   */
  static async libererUtilisation(storeId: string, code: string) {
    await db.promotion.updateMany({
      where: { storeId, code, currentUses: { gt: 0 } },
      data: { currentUses: { decrement: 1 } },
    });
  }

  static async applyPromotion(id: string) {
    try {
      return await db.promotion.update({
        where: { id },
        data: { currentUses: { increment: 1 } },
      });
    } catch (error) {
      if (codeErreur(error) === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async update(id: string, data: Partial<PromotionData>) {
    try {
      return await db.promotion.update({
        where: { id },
        data: {
          ...(data.description && { description: data.description }),
          ...(data.discountValue && { discountValue: data.discountValue }),
          ...(data.type && { type: data.type }),
          ...(data.applicableToAll !== undefined && { applicableToAll: data.applicableToAll }),
          ...(data.productIds && { productIds: data.productIds }),
          ...(data.categoryIds && { categoryIds: data.categoryIds }),
          ...(data.startDate && { startDate: data.startDate }),
          ...(data.endDate && { endDate: data.endDate }),
          ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
          ...(data.activeFromTime !== undefined && { activeFromTime: data.activeFromTime }),
          ...(data.activeToTime   !== undefined && { activeToTime:   data.activeToTime }),
          ...(data.activeDays     !== undefined && { activeDays:     data.activeDays }),
        },
      });
    } catch (error) {
      if (codeErreur(error) === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async toggleStatus(id: string) {
    try {
      const promotion = await db.promotion.findUnique({ where: { id } });
      if (!promotion) {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }

      return await db.promotion.update({
        where: { id },
        data: {
          status: promotion.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        },
      });
    } catch (error) {
      if (codeErreur(error) === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async delete(id: string) {
    try {
      return await db.promotion.delete({
        where: { id },
      });
    } catch (error) {
      if (codeErreur(error) === "P2025") {
        throw new ApiError(404, "Promotion non trouvée", "PROMOTION_NOT_FOUND");
      }
      throw error;
    }
  }

  static async countByStoreId(storeId: string) {
    return await db.promotion.count({
      where: { storeId },
    });
  }

  static async getByOrgId(orgId: string) {
    return await db.promotion.findMany({
      where: {
        store: { orgId },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
