import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Règles liées à la formule d'abonnement d'un commerçant.
 *
 * Le nombre de boutiques est la première limite appliquée : au-delà du Pro,
 * l'ouverture se fait sur demande auprès du support, il n'y a pas de formule
 * supérieure à vendre en libre-service.
 */

export type Formule = "FREE" | "PREMIUM" | "PRO";

export const FORMULES: Record<Formule, { libelle: string; maxBoutiques: number }> = {
  FREE: { libelle: "Gratuit", maxBoutiques: 1 },
  PREMIUM: { libelle: "Premium", maxBoutiques: 3 },
  PRO: { libelle: "Pro", maxBoutiques: 10 },
};

export class PlanService {
  /** État du quota de boutiques d'une organisation. */
  static async quotaBoutiques(orgId: string) {
    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tier: true },
    });

    if (!organisation) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    const formule = (organisation.tier as Formule) || "FREE";
    const maximum = FORMULES[formule]?.maxBoutiques ?? FORMULES.FREE.maxBoutiques;

    // Les boutiques supprimées ne comptent pas : fermer une boutique doit
    // libérer une place.
    const utilisees = await db.store.count({ where: { orgId, deletedAt: null } });

    return {
      tier: formule,
      tierLabel: FORMULES[formule]?.libelle ?? formule,
      used: utilisees,
      max: maximum,
      remaining: Math.max(0, maximum - utilisees),
      canCreate: utilisees < maximum,
      // Au sommet de la grille, la suite passe par une demande au support.
      upgradeAvailable: formule !== "PRO",
      nextTier: formule === "FREE" ? "PREMIUM" : formule === "PREMIUM" ? "PRO" : null,
    };
  }

  /**
   * Refuse la création d'une boutique au-delà du quota, avec un message qui
   * indique la marche à suivre plutôt qu'un simple refus.
   */
  static async verifierCreationBoutique(orgId: string) {
    const quota = await this.quotaBoutiques(orgId);

    if (quota.canCreate) return quota;

    const message = quota.upgradeAvailable
      ? `Votre formule ${quota.tierLabel} autorise ${quota.max} boutique${
          quota.max > 1 ? "s" : ""
        }. Passez à la formule ${
          FORMULES[quota.nextTier as Formule].libelle
        } pour en ouvrir davantage.`
      : `Votre formule Pro autorise ${quota.max} boutiques. Pour aller au-delà, adressez une demande au support.`;

    throw new ApiError(403, message, "STORE_QUOTA_REACHED");
  }
}
