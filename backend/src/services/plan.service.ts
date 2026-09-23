import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Règles liées à la formule d'abonnement d'un commerçant.
 *
 * Le nombre de boutiques est la première limite appliquée. Le contenu des
 * formules vit en base, pas ici : un tarif ou un quota se règle depuis
 * l'espace plateforme, sans passer par une mise en production.
 */

export type Formule = "FREE" | "PREMIUM" | "PRO";

export interface FormuleDetail {
  code: Formule;
  libelle: string;
  maxBoutiques: number;
  prixMensuel: number;
  /**
   * La commission prélevée sur les ventes, en pourcentage.
   *
   * Elle n'existait qu'en réglage global : toutes les formules payaient le même
   * taux, et rien ne permettait de faire payer moins de commission à un
   * abonnement plus cher — ce qui est pourtant l'argument de vente.
   */
  commission: number;
  /**
   * La commission quand le commerçant livre avec les livreurs de la
   * plateforme. Toujours au moins égale à `commission` : la plateforme fournit
   * en plus le livreur.
   */
  commissionLivreursPlateforme: number;
  avantages: string[];
  ordre: number;
}

/**
 * La grille de départ, posée à la première lecture.
 *
 * Elle ne sert plus qu'à amorcer la table : une fois les lignes créées, c'est
 * la base qui fait foi, y compris si le superowner met tout à zéro.
 */
const GRILLE_INITIALE: FormuleDetail[] = [
  {
    code: "FREE",
    libelle: "Gratuit",
    maxBoutiques: 1,
    prixMensuel: 0,
    commission: 8,
    commissionLivreursPlateforme: 15,
    avantages: ["1 boutique", "Commandes illimitées", "Support par ticket"],
    ordre: 0,
  },
  {
    code: "PREMIUM",
    libelle: "Premium",
    maxBoutiques: 3,
    // Affiché 6,99 € / semaine, facturé au mois.
    prixMensuel: 30.29,
    commission: 5,
    commissionLivreursPlateforme: 12,
    avantages: ["3 boutiques", "10 photos de repas", "Statistiques détaillées", "Support prioritaire"],
    ordre: 1,
  },
  {
    code: "PRO",
    libelle: "Pro",
    maxBoutiques: 10,
    // Affiché 14,99 € / semaine, facturé au mois.
    prixMensuel: 64.96,
    commission: 3,
    commissionLivreursPlateforme: 10,
    avantages: [
      "10 boutiques",
      "Ajout des catégories et produits par notre équipe",
      "30 photos de repas",
      "Accès API et webhooks",
      "Accompagnement dédié",
    ],
    ordre: 2,
  },
];

/** Une valeur JSON quelconque ramenée à une liste de phrases. */
function listeDeTextes(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];

  return valeur
    .map((element) => (typeof element === "string" ? element.trim() : ""))
    .filter((element) => element.length > 0);
}

/**
 * La promo « zéro commission » court-elle ?
 *
 * Elle s'arrête d'elle-même à sa date de fin : personne n'a à penser à la
 * retirer.
 */
export function promoSansCommissionActive(
  organisation: { commissionFreeActive: boolean; commissionFreeUntil: Date | null } | null | undefined,
  maintenant = new Date()
) {
  if (!organisation?.commissionFreeActive) return false;
  return !organisation.commissionFreeUntil || organisation.commissionFreeUntil > maintenant;
}

export class PlanService {
  /**
   * La grille complète, ordonnée.
   *
   * Les lignes manquantes sont créées au passage : une base existante n'a pas
   * de table remplie, et une grille vide bloquerait toute création de
   * boutique.
   */
  static async grille(): Promise<FormuleDetail[]> {
    const lignes = await db.planTier.findMany({ orderBy: { displayOrder: "asc" } });
    const connues = new Set(lignes.map((ligne) => ligne.code));
    const manquantes = GRILLE_INITIALE.filter((formule) => !connues.has(formule.code));

    if (manquantes.length > 0) {
      await db.planTier.createMany({
        data: manquantes.map((formule) => ({
          code: formule.code,
          label: formule.libelle,
          maxStores: formule.maxBoutiques,
          monthlyPrice: formule.prixMensuel,
          commissionPercent: formule.commission,
          platformDeliveryCommissionPercent: formule.commissionLivreursPlateforme,
          features: formule.avantages,
          displayOrder: formule.ordre,
        })),
        skipDuplicates: true,
      });

      return this.grille();
    }

    return lignes.map((ligne) => ({
      code: ligne.code as Formule,
      libelle: ligne.label,
      maxBoutiques: ligne.maxStores,
      prixMensuel: Number(ligne.monthlyPrice),
      commission: Number(ligne.commissionPercent),
      commissionLivreursPlateforme: Number(ligne.platformDeliveryCommissionPercent),
      avantages: listeDeTextes(ligne.features),
      ordre: ligne.displayOrder,
    }));
  }

  /** Une formule précise, ou celle par défaut si le code est inconnu. */
  static async formule(code: string | null | undefined): Promise<FormuleDetail> {
    const grille = await this.grille();

    return (
      grille.find((formule) => formule.code === code) ||
      grille.find((formule) => formule.code === "FREE") ||
      grille[0]!
    );
  }

  /**
   * Remplace le contenu d'une formule.
   *
   * Le code reste intouchable : il sert de clé aux organisations déjà
   * abonnées, le renommer les rattacherait à une formule inexistante.
   */
  static async enregistrer(
    code: Formule,
    valeurs: {
      libelle?: string;
      maxBoutiques?: number;
      prixMensuel?: number;
      commission?: number;
      commissionLivreursPlateforme?: number;
      avantages?: string[];
      ordre?: number;
    }
  ) {
    // La grille est amorcée si besoin : on ne met pas à jour une ligne absente.
    const actuelle = await this.formule(code);

    if (valeurs.maxBoutiques !== undefined && valeurs.maxBoutiques < 1) {
      throw new ApiError(
        400,
        "Une formule doit autoriser au moins une boutique",
        "INVALID_MAX_STORES"
      );
    }

    if (valeurs.prixMensuel !== undefined && valeurs.prixMensuel < 0) {
      throw new ApiError(400, "Un tarif ne peut pas être négatif", "INVALID_PRICE");
    }

    if (valeurs.commission !== undefined && (valeurs.commission < 0 || valeurs.commission > 100)) {
      throw new ApiError(
        400,
        "Une commission s'exprime en pourcentage, entre 0 et 100",
        "INVALID_COMMISSION"
      );
    }

    if (
      valeurs.commissionLivreursPlateforme !== undefined &&
      (valeurs.commissionLivreursPlateforme < 0 || valeurs.commissionLivreursPlateforme > 100)
    ) {
      throw new ApiError(
        400,
        "Une commission s'exprime en pourcentage, entre 0 et 100",
        "INVALID_COMMISSION"
      );
    }

    // Livrer avec nos livreurs ne peut pas coûter moins cher que livrer soi-même :
    // le commerçant n'aurait plus aucune raison de garder ses propres livreurs.
    const commissionFinale = valeurs.commission ?? actuelle.commission;
    const livreursFinale = valeurs.commissionLivreursPlateforme ?? actuelle.commissionLivreursPlateforme;

    if (livreursFinale < commissionFinale) {
      throw new ApiError(
        400,
        `La commission avec les livreurs de la plateforme (${livreursFinale} %) ne peut pas être inférieure à la commission de base (${commissionFinale} %)`,
        "INVALID_COMMISSION"
      );
    }

    // Abaisser un quota sous ce que des commerçants exploitent déjà les
    // mettrait hors des clous sans qu'ils y soient pour rien.
    if (valeurs.maxBoutiques !== undefined) {
      const abonnes = await db.organization.findMany({
        where: { tier: code },
        select: {
          id: true,
          name: true,
          // Une boutique fermée a libéré sa place : la compter ferait refuser
          // une baisse de quota sans raison.
          _count: { select: { stores: { where: { deletedAt: null } } } },
        },
      });

      const depasses = abonnes.filter(
        (abonne) => abonne._count.stores > valeurs.maxBoutiques!
      );

      if (depasses.length > 0) {
        throw new ApiError(
          409,
          `${depasses.length} commerçant${depasses.length > 1 ? "s exploitent" : " exploite"} plus de ${
            valeurs.maxBoutiques
          } boutique${valeurs.maxBoutiques > 1 ? "s" : ""} sur cette formule (${depasses
            .slice(0, 3)
            .map((abonne) => abonne.name)
            .join(", ")}). Baissez le quota après les avoir fait migrer.`,
          "TIER_IN_USE"
        );
      }
    }

    const ligne = await db.planTier.update({
      where: { code },
      data: {
        ...(valeurs.libelle !== undefined ? { label: valeurs.libelle } : {}),
        ...(valeurs.maxBoutiques !== undefined ? { maxStores: valeurs.maxBoutiques } : {}),
        ...(valeurs.prixMensuel !== undefined ? { monthlyPrice: valeurs.prixMensuel } : {}),
        ...(valeurs.commission !== undefined ? { commissionPercent: valeurs.commission } : {}),
        ...(valeurs.commissionLivreursPlateforme !== undefined
          ? { platformDeliveryCommissionPercent: valeurs.commissionLivreursPlateforme }
          : {}),
        ...(valeurs.avantages !== undefined ? { features: valeurs.avantages } : {}),
        ...(valeurs.ordre !== undefined ? { displayOrder: valeurs.ordre } : {}),
      },
    });

    return {
      code: ligne.code as Formule,
      libelle: ligne.label,
      maxBoutiques: ligne.maxStores,
      prixMensuel: Number(ligne.monthlyPrice),
      commission: Number(ligne.commissionPercent),
      commissionLivreursPlateforme: Number(ligne.platformDeliveryCommissionPercent),
      avantages: listeDeTextes(ligne.features),
      ordre: ligne.displayOrder,
    };
  }

  /** État du quota de boutiques d'une organisation. */
  static async quotaBoutiques(orgId: string) {
    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tier: true, commissionFreeActive: true, commissionFreeUntil: true },
    });

    if (!organisation) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    const grille = await this.grille();
    const formule = await this.formule(organisation.tier);
    const maximum = formule.maxBoutiques;

    // Les boutiques supprimées ne comptent pas : fermer une boutique doit
    // libérer une place.
    const utilisees = await db.store.count({ where: { orgId, deletedAt: null } });

    // La formule suivante est celle qui vient après dans la grille, pas une
    // liste écrite à la main : ajouter un palier ne doit rien casser.
    const suivante = grille.find((autre) => autre.ordre > formule.ordre) || null;

    return {
      tier: formule.code,
      tierLabel: formule.libelle,
      tierPrice: formule.prixMensuel,
      // Le commerçant a le droit de savoir ce qu'on prélève sur ses ventes.
      tierCommission: formule.commission,
      tierPlatformDeliveryCommission: formule.commissionLivreursPlateforme,
      tierFeatures: formule.avantages,
      // La promo offerte par la plateforme : 0 % tant qu'elle court.
      commissionFree: promoSansCommissionActive(organisation),
      commissionFreeUntil: promoSansCommissionActive(organisation)
        ? organisation.commissionFreeUntil
        : null,
      used: utilisees,
      max: maximum,
      remaining: Math.max(0, maximum - utilisees),
      canCreate: utilisees < maximum,
      // Au sommet de la grille, la suite passe par une demande au support.
      upgradeAvailable: suivante !== null,
      nextTier: suivante?.code ?? null,
      nextTierLabel: suivante?.libelle ?? null,
      nextTierMax: suivante?.maxBoutiques ?? null,
      nextTierPrice: suivante?.prixMensuel ?? null,
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
        }. Passez à la formule ${quota.nextTierLabel} pour en ouvrir davantage.`
      : `Votre formule ${quota.tierLabel} autorise ${quota.max} boutique${
          quota.max > 1 ? "s" : ""
        }. Pour aller au-delà, adressez une demande au support.`;

    throw new ApiError(403, message, "STORE_QUOTA_REACHED");
  }
}
