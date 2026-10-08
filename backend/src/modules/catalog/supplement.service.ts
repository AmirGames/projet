import { randomUUID } from "crypto";
import { z } from "zod";

import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { TaxService } from "./tax.service";

/**
 * Les suppléments payants d'un plat : « Suppléments » (bacon +1,50 €,
 * cheddar +1 €), « Sauce » (une au choix, offerte)…
 *
 * Un groupe est un `ProductOption` ; ses choix vivent dans sa colonne JSON
 * `choices`, chacun avec un identifiant stable — c'est lui que le panier et
 * la commande désignent. Le prix d'un choix se saisit comme celui du plat :
 * hors taxe si la boutique travaille hors taxe, et il passe TTC au client
 * avec le même taux que le plat.
 *
 * Le serveur ne croit jamais le prix annoncé par le navigateur : il relit les
 * choix désignés, vérifie qu'ils appartiennent au plat, qu'ils sont
 * disponibles et que chaque groupe est respecté, puis en fait la somme.
 */

interface ChoixSupplement {
  id: string;
  label: string;
  price: number;
  isAvailable: boolean;
}

export interface GroupeSupplements {
  id: string;
  name: string;
  isRequired: boolean;
  maxChoices: number | null;
  displayOrder: number;
  choices: ChoixSupplement[];
}

/** Ce qu'une ligne de commande garde des suppléments choisis. */
export interface SupplementRetenu {
  id: string;
  groupe: string;
  label: string;
  /** TTC, tel que le client l'a payé. */
  price: number;
}

export const schemaGroupes = z
  .array(
    z.object({
      name: z.string().trim().min(1, "Un groupe de suppléments a besoin d'un nom").max(60),
      isRequired: z.boolean().optional().default(false),
      maxChoices: z.number().int().min(1).max(50).nullable().optional().default(null),
      choices: z
        .array(
          z.object({
            // Absent pour un choix nouveau : le serveur en attribue un.
            id: z.string().min(1).max(64).optional(),
            label: z.string().trim().min(1, "Un supplément a besoin d'un nom").max(60),
            price: z.number().min(0, "Un prix ne peut pas être négatif").max(1000),
            isAvailable: z.boolean().optional().default(true),
          })
        )
        .min(1, "Un groupe de suppléments a besoin d'au moins un choix")
        .max(50),
    })
  )
  .max(10, "Dix groupes de suppléments au plus par plat");

/** Les choix tels que la base les garde, lus sans jamais planter. */
function choixLisibles(brut: unknown): ChoixSupplement[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .filter((c): c is Record<string, unknown> & { id: string } => typeof c === "object" && c !== null && "id" in c && typeof c.id === "string")
    .map((c) => ({
      id: c.id as string,
      label: String(c.label ?? ""),
      price: Number(c.price ?? 0) || 0,
      isAvailable: c.isAvailable !== false,
    }));
}

function groupeLisible(option: {
  id: string;
  name: string;
  isRequired: boolean;
  maxChoices: number | null;
  displayOrder: number;
  choices: unknown;
}): GroupeSupplements {
  return {
    id: option.id,
    name: option.name,
    isRequired: option.isRequired,
    maxChoices: option.maxChoices,
    displayOrder: option.displayOrder,
    choices: choixLisibles(option.choices),
  };
}

const arrondi = (n: number) => Number(n.toFixed(2));

export class SupplementService {
  /** Les groupes d'un plat, dans l'ordre voulu par le commerçant. */
  static async lister(productId: string): Promise<GroupeSupplements[]> {
    const options = await db.productOption.findMany({
      where: { productId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });
    return options.map(groupeLisible);
  }

  /**
   * Remplace tous les groupes d'un plat par ceux donnés.
   *
   * Un choix qui garde son identifiant reste le même : un panier qui le
   * désigne reste valable. Un choix retiré disparaît ; les commandes passées
   * gardent leur copie (OrderItem.selectedOptions).
   */
  static async remplacer(productId: string, groupes: z.infer<typeof schemaGroupes>) {
    await db.$transaction(async (tx) => {
      await tx.productOption.deleteMany({ where: { productId } });
      for (const [ordre, groupe] of groupes.entries()) {
        await tx.productOption.create({
          data: {
            productId,
            name: groupe.name,
            isRequired: groupe.isRequired,
            maxChoices: groupe.maxChoices,
            displayOrder: ordre,
            pricingType: "fixed",
            choices: groupe.choices.map((choix) => ({
              id: choix.id || randomUUID(),
              label: choix.label,
              price: arrondi(choix.price),
              isAvailable: choix.isAvailable,
            })),
          },
        });
      }
    });

    return SupplementService.lister(productId);
  }

  /**
   * Les groupes de plusieurs plats, prix passés TTC là où la boutique
   * travaille hors taxe — ce que la vitrine montre.
   */
  static async auClient(
    storeId: string,
    produits: { id: string; categoryId?: string | null }[]
  ): Promise<Map<string, GroupeSupplements[]>> {
    const parPlat = new Map<string, GroupeSupplements[]>();
    if (produits.length === 0) return parPlat;

    const [options, taux] = await Promise.all([
      db.productOption.findMany({
        where: { productId: { in: produits.map((p) => p.id) } },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
      }),
      TaxService.tauxAAjouter(storeId, produits),
    ]);

    for (const option of options) {
      const groupe = groupeLisible(option);
      const t = taux.get(option.productId);
      if (t) {
        groupe.choices = groupe.choices.map((c) => ({ ...c, price: TaxService.ttc(c.price, t) }));
      }
      // Les choix épuisés restent listés, marqués : la vitrine les grise.
      parPlat.set(option.productId, [...(parPlat.get(option.productId) || []), groupe]);
    }

    return parPlat;
  }

  /**
   * Les suppléments choisis pour une ligne de commande, vérifiés et tarifés.
   *
   * `tauxHT` est le taux à ajouter quand la boutique saisit hors taxe : chaque
   * supplément passe TTC séparément, comme la vitrine l'a affiché, pour que
   * le total annoncé soit exactement celui qui est payé.
   */
  static async tarifer(
    productId: string,
    nomDuPlat: string,
    choisis: string[] | undefined,
    tauxHT?: number
  ): Promise<{ montant: number; retenus: SupplementRetenu[] }> {
    const groupes = await SupplementService.lister(productId);
    const demandes = [...new Set(choisis || [])];

    if (groupes.length === 0) {
      if (demandes.length > 0) {
        throw new ApiError(400, `« ${nomDuPlat} » n'a plus de suppléments`, "SUPPLEMENT_NOT_FOUND");
      }
      return { montant: 0, retenus: [] };
    }

    const retenus: SupplementRetenu[] = [];
    const trouves = new Set<string>();

    for (const groupe of groupes) {
      const dansCeGroupe = groupe.choices.filter((c) => demandes.includes(c.id));

      for (const choix of dansCeGroupe) {
        if (!choix.isAvailable) {
          throw new ApiError(
            400,
            `« ${choix.label} » n'est plus disponible pour « ${nomDuPlat} »`,
            "SUPPLEMENT_UNAVAILABLE"
          );
        }
        trouves.add(choix.id);
        const prix = tauxHT ? TaxService.ttc(choix.price, tauxHT) : choix.price;
        retenus.push({ id: choix.id, groupe: groupe.name, label: choix.label, price: arrondi(prix) });
      }

      if (groupe.isRequired && dansCeGroupe.length === 0) {
        throw new ApiError(
          400,
          `Choisissez « ${groupe.name} » pour « ${nomDuPlat} »`,
          "SUPPLEMENT_REQUIRED"
        );
      }

      if (groupe.maxChoices != null && dansCeGroupe.length > groupe.maxChoices) {
        throw new ApiError(
          400,
          `« ${groupe.name} » : ${groupe.maxChoices} choix au plus pour « ${nomDuPlat} »`,
          "SUPPLEMENT_TOO_MANY"
        );
      }
    }

    if (trouves.size !== demandes.length) {
      throw new ApiError(400, `Un supplément de « ${nomDuPlat} » n'existe plus`, "SUPPLEMENT_NOT_FOUND");
    }

    return {
      montant: arrondi(retenus.reduce((somme, s) => somme + s.price, 0)),
      retenus,
    };
  }
}
