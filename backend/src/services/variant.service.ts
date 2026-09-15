import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { emitStoreEvent } from "../config/socket";

/**
 * Les déclinaisons d'un plat.
 *
 * « Pâtes 4 fromages » se commande en penne, spaghetti ou tagliatelle. Le
 * modèle existait en base depuis le début, sans aucune route ni écran : le
 * commerçant ne pouvait pas en créer, et le client n'avait rien à choisir. Il
 * lui manquait surtout un libellé — le service des commandes ne pouvait
 * nommer que le plat parent.
 */

export interface DonneesVariante {
  label: string;
  price?: number | null;
  isAvailable?: boolean;
  displayOrder?: number;
}

/** Un identifiant lisible, dérivé du libellé. */
function referenceDepuis(label: string, rang: number) {
  const base = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

  return `${base || "VAR"}-${rang}`;
}

export class VariantService {
  /** Le produit et sa boutique, ou une erreur claire. */
  private static async produit(productId: string) {
    const produit = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, storeId: true, price: true, deletedAt: true },
    });

    if (!produit || produit.deletedAt) {
      throw new ApiError(404, "Produit introuvable", "PRODUCT_NOT_FOUND");
    }

    return produit;
  }

  /**
   * Les déclinaisons d'un plat, dans l'ordre voulu par le commerçant.
   *
   * Le prix rendu est celui qui sera payé : celui de la variante si elle en
   * porte un, sinon celui du plat. La page n'a pas à refaire ce calcul.
   */
  static async lister(productId: string) {
    const produit = await this.produit(productId);

    const variantes = await db.productVariant.findMany({
      where: { productId },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
    });

    return variantes.map((variante) => ({
      id: variante.id,
      label: variante.label,
      sku: variante.sku,
      // Le supplément propre à la variante, vide quand elle est au prix du plat.
      price: variante.price === null ? null : Number(variante.price),
      prixEffectif: Number(variante.price ?? produit.price),
      isAvailable: variante.isAvailable,
      displayOrder: variante.displayOrder,
    }));
  }

  static async creer(productId: string, donnees: DonneesVariante) {
    const produit = await this.produit(productId);

    const libelle = donnees.label.trim();
    if (libelle.length < 1) {
      throw new ApiError(400, "Une déclinaison a besoin d'un nom", "INVALID_LABEL");
    }

    const existantes = await db.productVariant.findMany({
      where: { productId },
      select: { label: true, displayOrder: true },
    });

    // Deux « Penne » sur le même plat n'apprennent rien au client.
    if (existantes.some((autre) => autre.label.toLowerCase() === libelle.toLowerCase())) {
      throw new ApiError(409, `« ${libelle} » existe déjà pour ce plat`, "DUPLICATE_LABEL");
    }

    if (donnees.price !== undefined && donnees.price !== null && donnees.price < 0) {
      throw new ApiError(400, "Un prix ne peut pas être négatif", "INVALID_PRICE");
    }

    const rang =
      donnees.displayOrder ??
      existantes.reduce((maximum, autre) => Math.max(maximum, autre.displayOrder + 1), 0);

    const variante = await db.productVariant.create({
      data: {
        productId,
        label: libelle,
        sku: referenceDepuis(libelle, existantes.length + 1),
        price: donnees.price ?? null,
        isAvailable: donnees.isAvailable ?? true,
        displayOrder: rang,
      },
    });

    this.pousserAuxVisiteurs(produit.storeId, productId);

    return variante;
  }

  static async modifier(variantId: string, donnees: Partial<DonneesVariante>) {
    const existante = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { storeId: true } } },
    });

    if (!existante) {
      throw new ApiError(404, "Déclinaison introuvable", "VARIANT_NOT_FOUND");
    }

    if (donnees.label !== undefined) {
      const libelle = donnees.label.trim();
      if (libelle.length < 1) {
        throw new ApiError(400, "Une déclinaison a besoin d'un nom", "INVALID_LABEL");
      }

      const homonyme = await db.productVariant.findFirst({
        where: {
          productId: existante.productId,
          id: { not: variantId },
          label: { equals: libelle, mode: "insensitive" },
        },
        select: { id: true },
      });

      if (homonyme) {
        throw new ApiError(409, `« ${libelle} » existe déjà pour ce plat`, "DUPLICATE_LABEL");
      }
    }

    if (donnees.price !== undefined && donnees.price !== null && donnees.price < 0) {
      throw new ApiError(400, "Un prix ne peut pas être négatif", "INVALID_PRICE");
    }

    const variante = await db.productVariant.update({
      where: { id: variantId },
      data: {
        ...(donnees.label !== undefined ? { label: donnees.label.trim() } : {}),
        ...(donnees.price !== undefined ? { price: donnees.price } : {}),
        ...(donnees.isAvailable !== undefined ? { isAvailable: donnees.isAvailable } : {}),
        ...(donnees.displayOrder !== undefined ? { displayOrder: donnees.displayOrder } : {}),
      },
    });

    this.pousserAuxVisiteurs(existante.product.storeId, existante.productId);

    return variante;
  }

  static async supprimer(variantId: string) {
    const existante = await db.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { select: { storeId: true } },
        _count: { select: { orderItems: true } },
      },
    });

    if (!existante) {
      throw new ApiError(404, "Déclinaison introuvable", "VARIANT_NOT_FOUND");
    }

    // Une déclinaison déjà commandée est de l'histoire : la supprimer
    // effacerait la ligne des commandes passées. On la retire de la vente.
    if (existante._count.orderItems > 0) {
      const retiree = await db.productVariant.update({
        where: { id: variantId },
        data: { isAvailable: false },
      });

      this.pousserAuxVisiteurs(existante.product.storeId, existante.productId);

      return { retiree: true, variante: retiree };
    }

    await db.productVariant.delete({ where: { id: variantId } });
    this.pousserAuxVisiteurs(existante.product.storeId, existante.productId);

    return { retiree: false };
  }

  /** L'ordre voulu par le commerçant, en un seul appel. */
  static async reordonner(productId: string, ordre: { id: string; displayOrder: number }[]) {
    const produit = await this.produit(productId);

    const siennes = await db.productVariant.findMany({
      where: { productId },
      select: { id: true },
    });
    const connues = new Set(siennes.map((variante) => variante.id));

    // Réordonner les variantes d'un autre plat au passage : non.
    const etrangeres = ordre.filter((ligne) => !connues.has(ligne.id));
    if (etrangeres.length > 0) {
      throw new ApiError(400, "Une déclinaison ne dépend pas de ce plat", "VARIANT_NOT_FOUND");
    }

    await db.$transaction(
      ordre.map((ligne) =>
        db.productVariant.update({
          where: { id: ligne.id },
          data: { displayOrder: ligne.displayOrder },
        })
      )
    );

    this.pousserAuxVisiteurs(produit.storeId, productId);

    return this.lister(productId);
  }

  /**
   * La question posée au client : « Type de pâtes », « Taille ».
   *
   * Sans elle, le client voit trois boutons sans savoir ce qu'il choisit.
   */
  static async nommerLeChoix(productId: string, libelle: string | null) {
    const produit = await this.produit(productId);

    const mis = await db.product.update({
      where: { id: productId },
      data: { variantLabel: libelle?.trim() || null },
      select: { id: true, variantLabel: true },
    });

    this.pousserAuxVisiteurs(produit.storeId, productId);

    return mis;
  }

  /**
   * Le prix à facturer pour une ligne, calculé côté serveur.
   *
   * Le prix arrivait du navigateur et n'était jamais recoupé : une pizza à
   * 14 € pouvait être commandée à un centime. Une variante ajoutant son propre
   * tarif, la question ne pouvait plus attendre.
   */
  static async prixDeLaLigne(productId: string, variantId?: string | null) {
    const produit = await db.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, price: true, isAvailable: true, deletedAt: true },
    });

    if (!produit || produit.deletedAt) {
      throw new ApiError(400, "Un article du panier n'existe plus", "PRODUCT_NOT_FOUND");
    }

    if (!variantId) {
      // Un plat qui se décline ne se commande pas « nu » : le client doit
      // choisir, sinon la cuisine ne sait pas quoi préparer.
      const declinaisons = await db.productVariant.count({ where: { productId } });

      if (declinaisons > 0) {
        throw new ApiError(
          400,
          `Choisissez une déclinaison de « ${produit.name} »`,
          "VARIANT_REQUIRED"
        );
      }

      return Number(produit.price);
    }

    const variante = await db.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, label: true, price: true, isAvailable: true, productId: true },
    });

    if (!variante || variante.productId !== productId) {
      throw new ApiError(400, "Cette déclinaison n'existe pas", "VARIANT_NOT_FOUND");
    }

    if (!variante.isAvailable) {
      throw new ApiError(
        400,
        `« ${produit.name} — ${variante.label} » n'est plus disponible`,
        "VARIANT_UNAVAILABLE"
      );
    }

    return Number(variante.price ?? produit.price);
  }

  /**
   * Pousse le menu du plat aux visiteurs de la boutique.
   *
   * Une déclinaison épuisée pendant que le client compose son panier doit
   * disparaître de ses choix sans qu'il ait à recharger, comme pour un plat.
   */
  private static pousserAuxVisiteurs(storeId: string, productId: string) {
    this.lister(productId)
      .then((variantes) => {
        emitStoreEvent(storeId, "produit-declinaisons", { productId, variantes });
      })
      .catch(() => undefined);
  }
}
