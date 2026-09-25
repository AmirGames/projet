'use client';

/**
 * Un panier par boutique.
 *
 * Tout était rangé sous une seule clé `cart`, sans identifiant de boutique :
 * le panier composé chez le commerce 1 réapparaissait chez le commerce 2. Pire,
 * la commande partait avec des articles qui n'appartenaient pas à la boutique
 * visée — le serveur les refuse désormais, mais le client ne comprenait pas
 * pourquoi.
 *
 * Pire encore : trois pages écrivaient sous cette même clé trois formats
 * incompatibles — une liste à plat en euros, un tableau groupé par boutique en
 * centimes, et une liste de produits brute. Chacune écrasait les autres.
 *
 * Désormais : une clé, un format, et les paniers rangés par boutique. Passer
 * d'un commerce à l'autre montre le panier de ce commerce, les autres attendent
 * leur tour.
 */

const CLE = 'zupone-paniers';

/** L'ancienne clé, dont le contenu n'est pas récupérable de façon fiable. */
const CLE_HERITEE = 'cart';

export interface LignePanier {
  productId: string;
  /** La déclinaison choisie, quand le plat se décline. */
  variantId?: string;
  name: string;
  variantNom?: string;
  /** En euros, comme partout ailleurs dans l'application. */
  price: number;
  quantity: number;
  description?: string;
  isAvailable?: boolean;
}

export interface PanierBoutique {
  storeId: string;
  storeName: string;
  /** Pour revenir à la vitrine depuis le panier de l'accueil. */
  storeSlug?: string;
  lignes: LignePanier[];
  /** Pour afficher « il y a deux jours » et trier les paniers en attente. */
  majA: string;
}

type Magasin = Record<string, PanierBoutique>;

/**
 * La clé d'une ligne : produit et déclinaison.
 *
 * Indexer par produit seul ferait de « penne » et « spaghetti » du même plat
 * une seule ligne.
 */
export const cleDeLigne = (productId: string, variantId?: string) =>
  variantId ? `${productId}:${variantId}` : productId;

function lireMagasin(): Magasin {
  try {
    // L'ancienne clé portait trois formats mêlés : la relire importerait des
    // données douteuses. On s'en débarrasse une fois pour toutes.
    localStorage.removeItem(CLE_HERITEE);

    const brut = localStorage.getItem(CLE);
    if (!brut) return {};

    const lu = JSON.parse(brut);
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {};

    // Un contenu abîmé ne doit pas faire planter la page : on garde ce qui a
    // la bonne forme et on jette le reste.
    return Object.fromEntries(
      Object.entries(lu as Magasin).filter(
        ([storeId, panier]) =>
          typeof storeId === 'string' && panier && Array.isArray(panier.lignes)
      )
    );
  } catch {
    // Stockage refusé (navigation privée, réglages) : on travaille en mémoire.
    return {};
  }
}

function ecrireMagasin(magasin: Magasin) {
  try {
    localStorage.setItem(CLE, JSON.stringify(magasin));
  } catch {
    // Rien à faire : le panier en mémoire suffit pour cette visite.
  }
}

/** Le panier d'une boutique, vide s'il n'y en a pas. */
export function lirePanier(storeId: string | undefined): LignePanier[] {
  if (!storeId) return [];
  return lireMagasin()[storeId]?.lignes || [];
}

/** Enregistre le panier d'une boutique. Un panier vide est effacé. */
export function enregistrerPanier(
  storeId: string | undefined,
  lignes: LignePanier[],
  storeName = '',
  storeSlug = ''
) {
  if (!storeId) return;

  const magasin = lireMagasin();

  if (lignes.length === 0) {
    delete magasin[storeId];
  } else {
    magasin[storeId] = {
      storeId,
      // Le nom connu est conservé si l'appelant ne le repasse pas.
      storeName: storeName || magasin[storeId]?.storeName || '',
      storeSlug: storeSlug || magasin[storeId]?.storeSlug || undefined,
      lignes,
      majA: new Date().toISOString(),
    };
  }

  ecrireMagasin(magasin);

  // Le panier de l'accueil se met à jour sans recharger la page. (L'événement
  // `storage` ne prévient que les autres onglets.)
  try {
    window.dispatchEvent(new Event(EVENEMENT_PANIERS));
  } catch {
    // Hors navigateur : rien à prévenir.
  }
}

/**
 * Retient l'adresse de la vitrine d'un panier créé avant qu'on la garde.
 *
 * Ni les articles ni la date du panier ne changent : il ne remonte pas en
 * tête de liste pour autant.
 */
export function retenirVitrineDuPanier(storeId: string, storeSlug: string) {
  const magasin = lireMagasin();
  const panier = magasin[storeId];
  if (!panier || !storeSlug || panier.storeSlug === storeSlug) return;

  magasin[storeId] = { ...panier, storeSlug };
  ecrireMagasin(magasin);

  try {
    window.dispatchEvent(new Event(EVENEMENT_PANIERS));
  } catch {
    // Hors navigateur : rien à prévenir.
  }
}

/** Émis à chaque modification d'un panier, dans l'onglet courant. */
export const EVENEMENT_PANIERS = 'zupone-paniers-modifies';

export function viderPanier(storeId: string | undefined) {
  enregistrerPanier(storeId, []);
}

/**
 * Les paniers des autres boutiques, du plus récent au plus ancien.
 *
 * Sert à dire au client qu'il a laissé un panier ailleurs : sans cela, il
 * l'oublie, et le retrouve par surprise des jours plus tard.
 */
export function autresPaniers(storeId: string | undefined): PanierBoutique[] {
  return Object.values(lireMagasin())
    .filter((panier) => panier.storeId !== storeId && panier.lignes.length > 0)
    .sort((a, b) => (a.majA < b.majA ? 1 : -1));
}

/** Tous les paniers non vides, du plus récent au plus ancien. */
export function tousLesPaniers(): PanierBoutique[] {
  return autresPaniers(undefined);
}

/** Le nombre d'articles d'un panier, quantités comprises. */
export const nombreDArticles = (lignes: LignePanier[]) =>
  lignes.reduce((somme, ligne) => somme + ligne.quantity, 0);

/** Le total d'un panier, hors frais. */
export const totalDuPanier = (lignes: LignePanier[]) =>
  lignes.reduce((somme, ligne) => somme + ligne.price * ligne.quantity, 0);
