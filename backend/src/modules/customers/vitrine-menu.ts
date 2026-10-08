import type { Prisma } from "@prisma/client";
import { trierProduitsSelonCategorie } from "../catalog/category.service";

/**
 * Regroupe les produits par catégorie, dans l'ordre choisi par le commerçant.
 *
 * Les catégories sortent dans leur propre ordre d'affichage, et les produits
 * dans le leur : c'est tout l'intérêt du glisser-déposer côté commerçant, qui
 * était enregistré mais jamais relu ici.
 *
 * Un produit épuisé n'est pas retiré. Le masquer laisse le client chercher en
 * vain un plat qu'il commande d'habitude ; le montrer barré lui dit ce qui se
 * passe, et qu'il peut revenir demain.
 */
/**
 * Les déclinaisons telles que le client doit les recevoir.
 *
 * Elles arrivaient brutes : sans ordre, et sans le prix réellement payé. La
 * page n'a pas à savoir qu'un prix vide signifie « celui du plat ».
 */
export interface VarianteBrute {
  id: string;
  label: string;
  price: Prisma.Decimal | number | null;
  isAvailable: boolean;
  displayOrder: number;
}

export interface ProduitBrut {
  name: string;
  price: Prisma.Decimal | number;
  variants?: VarianteBrute[] | null;
  variantLabel?: string | null;
  category?: { name: string; displayOrder?: number | null; sortMode?: string | null } | null;
}

function declinaisonsLisibles(produit: ProduitBrut) {
  const variantes = Array.isArray(produit.variants) ? produit.variants : [];

  return variantes
    .slice()
    .sort((a, b) =>
      a.displayOrder !== b.displayOrder
        ? a.displayOrder - b.displayOrder
        : String(a.label).localeCompare(String(b.label), "fr")
    )
    .map((variante) => ({
      id: variante.id,
      label: variante.label,
      price: variante.price === null ? null : Number(variante.price),
      prixEffectif: Number(variante.price ?? produit.price),
      isAvailable: variante.isAvailable,
    }));
}

type ProduitLisible<P extends ProduitBrut> = Omit<P, "variants" | "variantLabel"> & {
  variants: ReturnType<typeof declinaisonsLisibles>;
  variantLabel: string | null;
};

export function regrouperParCategorie<P extends ProduitBrut>(produits: P[]) {
  const categories = new Map<string, { ordre: number; sortMode: string | null | undefined; produits: ProduitLisible<P>[] }>();

  for (const produit of produits) {
    const nom = produit.category?.name || "Autres";

    if (!categories.has(nom)) {
      categories.set(nom, {
        // Sans catégorie, on passe en dernier plutôt qu'en premier.
        ordre: produit.category ? produit.category.displayOrder ?? 0 : Number.MAX_SAFE_INTEGER,
        sortMode: produit.category?.sortMode,
        produits: [],
      });
    }

    categories.get(nom)!.produits.push({
      ...produit,
      variants: declinaisonsLisibles(produit),
      // La question posée au client, quand le plat se décline.
      variantLabel: produit.variantLabel || null,
    });
  }

  const ordonnees = [...categories.entries()].sort((a, b) => {
    if (a[1].ordre !== b[1].ordre) return a[1].ordre - b[1].ordre;
    return a[0].localeCompare(b[0], "fr");
  });

  return Object.fromEntries(
    ordonnees.map(([nom, groupe]) => [nom, trierProduitsSelonCategorie(groupe.produits, groupe.sortMode)])
  );
}
