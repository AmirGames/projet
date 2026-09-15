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
    avantages: ["1 boutique", "Commandes illimitées", "Support par ticket"],
    ordre: 0,
  },
  {
    code: "PREMIUM",
    libelle: "Premium",
    maxBoutiques: 3,
    prixMensuel: 29,
    avantages: ["3 boutiques", "Statistiques détaillées", "Support prioritaire"],
    ordre: 1,
  },
  {
    code: "PRO",
    libelle: "Pro",
    maxBoutiques: 10,
    prixMensuel: 79,
    avantages: ["10 boutiques", "Accès API et webhooks", "Accompagnement dédié"],
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
      avantages?: string[];
      ordre?: number;
    }
  ) {
    // La grille est amorcée si besoin : on ne met pas à jour une ligne absente.
    await this.grille();

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
        ...(valeurs.avantages !== undefined ? { features: valeurs.avantages } : {}),
        ...(valeurs.ordre !== undefined ? { displayOrder: valeurs.ordre } : {}),
      },
    });

    return {
      code: ligne.code as Formule,
      libelle: ligne.label,
      maxBoutiques: ligne.maxStores,
      prixMensuel: Number(ligne.monthlyPrice),
      avantages: listeDeTextes(ligne.features),
      ordre: ligne.displayOrder,
    };
  }

  /** État du quota de boutiques d'une organisation. */
  static async quotaBoutiques(orgId: string) {
    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, tier: true },
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
      tierFeatures: formule.avantages,
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
