'use client';

import { cleDeLigne, enregistrerPanier, lirePanier, type LignePanier } from '@/lib/paniers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Une ligne d'une commande passée, telle que la renvoie /api/client/me/orders. */
export interface LigneCommandee {
  productId: string;
  variantId?: string | null;
  variantLabel?: string | null;
  name: string;
  quantity: number;
}

export interface Reprise {
  /** Les plats remis au panier. */
  reprises: number;
  /** Ceux qui ne sont plus à la carte, ou épuisés aujourd'hui. */
  absents: string[];
}

/**
 * « Commander à nouveau » : remet au panier de la boutique les plats d'une
 * commande passée.
 *
 * Tout est relu dans le menu du jour, jamais recopié de la commande : un plat
 * retiré ou épuisé reste dehors (le client le saura), et un prix qui a bougé
 * prend sa nouvelle valeur — c'est celle que le serveur exigera au paiement.
 * Ce qui était déjà dans le panier de cette boutique y reste ; les quantités
 * d'un même plat s'additionnent.
 */
export async function remettreAuPanier(
  storeId: string,
  storeName: string,
  storeSlug: string,
  lignes: LigneCommandee[],
): Promise<Reprise> {
  const reponse = await fetch(`${API_URL}/api/client/stores/${storeId}`);
  if (!reponse.ok) throw new Error('BOUTIQUE_INDISPONIBLE');

  const menu = ((await reponse.json())?.data?.menu || {}) as Record<string, any[]>;
  const plats = new Map(Object.values(menu).flat().map((plat) => [plat.id as string, plat]));

  const panier = new Map(lirePanier(storeId).map((ligne) => [cleDeLigne(ligne.productId, ligne.variantId), ligne]));
  const absents: string[] = [];
  let reprises = 0;

  for (const ligne of lignes) {
    const nom = ligne.variantLabel ? `${ligne.name} (${ligne.variantLabel})` : ligne.name;
    const plat = plats.get(ligne.productId);

    if (!plat || plat.isAvailable === false) {
      absents.push(nom);
      continue;
    }

    let prix = Number(plat.price || 0);
    let variantNom: string | undefined;

    if (ligne.variantId) {
      const variante = (plat.variants || []).find((v: any) => v.id === ligne.variantId);
      if (!variante || variante.isAvailable === false) {
        absents.push(nom);
        continue;
      }
      prix = Number(variante.prixEffectif ?? plat.price ?? 0);
      variantNom = variante.label || undefined;
    } else if ((plat.variants || []).length > 0) {
      // Le plat se décline désormais : le client doit choisir sur la vitrine.
      absents.push(nom);
      continue;
    }

    const cle = cleDeLigne(plat.id, ligne.variantId || undefined);
    const deja = panier.get(cle);
    const nouvelle: LignePanier = {
      productId: plat.id,
      name: plat.name,
      description: plat.description || undefined,
      price: prix,
      quantity: (deja?.quantity || 0) + ligne.quantity,
      isAvailable: true,
      ...(ligne.variantId ? { variantId: ligne.variantId, variantNom } : {}),
    };
    panier.set(cle, nouvelle);
    reprises += 1;
  }

  if (reprises > 0) enregistrerPanier(storeId, [...panier.values()], storeName, storeSlug);

  return { reprises, absents };
}
