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
 *
 * Connecté, le client retrouve ses paniers partout : chaque modification part
 * au serveur, qui l'annonce en direct à ses autres appareils (l'application,
 * un autre onglet). Le navigateur garde sa copie pour les visiteurs sans
 * compte et pour rester utilisable hors ligne. Voir `SynchroPaniers`.
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

/** Ce qui compte pour dire qu'un panier a changé : les plats, leurs choix, les quantités et les prix. */
const empreinte = (lignes: LignePanier[]) =>
  JSON.stringify(lignes.map((l) => [l.productId, l.variantId || '', l.quantity, l.price]));

/** Enregistre le panier d'une boutique. Un panier vide est effacé. */
export function enregistrerPanier(
  storeId: string | undefined,
  lignes: LignePanier[],
  storeName = '',
  storeSlug = ''
) {
  if (!storeId) return;

  const magasin = lireMagasin();

  // Rien n'a changé (la vitrine réenregistre le panier qu'elle vient de
  // relire) : ni écriture, ni envoi au serveur, sans quoi deux appareils se
  // renverraient le même panier sans fin.
  if (empreinte(magasin[storeId]?.lignes || []) === empreinte(lignes)) return;

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
  prevenir();
  envoyerAuServeur(storeId);
}

/** Le panier de l'accueil se met à jour sans recharger la page. (L'événement `storage` ne prévient que les autres onglets.) */
function prevenir(storeIdDistant?: string) {
  try {
    window.dispatchEvent(new Event(EVENEMENT_PANIERS));
    if (storeIdDistant) {
      window.dispatchEvent(new CustomEvent(EVENEMENT_PANIER_DISTANT, { detail: { storeId: storeIdDistant } }));
    }
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

/**
 * Émis quand un panier a été modifié sur un autre appareil du compte
 * (`detail.storeId`) : la vitrine ouverte le relit.
 */
export const EVENEMENT_PANIER_DISTANT = 'zupone-panier-distant';

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

// ---------------------------------------------------------------------------
// Synchronisation avec le serveur, pour un client connecté
// ---------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Un panier tel que le serveur le garde et l'annonce (« panier-modifie »). */
export interface PanierDistant {
  storeId: string;
  storeName: string;
  storeSlug: string | null;
  lignes: LignePanier[];
  majA: string;
  /** L'appareil qui l'a écrit : chacun ignore sa propre annonce. */
  appareil?: string | null;
}

function jetonClient(): string | null {
  try {
    return localStorage.getItem('accessToken');
  } catch {
    return null;
  }
}

/** Identifie cet onglet auprès du serveur, le temps de la visite. */
let appareil = '';
export function identifiantAppareil() {
  if (!appareil) appareil = `web-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  return appareil;
}

const enAttente = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Envoie le panier d'une boutique au serveur, un instant après la dernière
 * modification : cliquer trois fois sur « + » ne fait qu'un envoi.
 */
function envoyerAuServeur(storeId: string) {
  if (typeof window === 'undefined' || !jetonClient()) return;

  clearTimeout(enAttente.get(storeId));
  enAttente.set(
    storeId,
    setTimeout(() => {
      enAttente.delete(storeId);
      const jeton = jetonClient();
      if (!jeton) return;
      const panier = lireMagasin()[storeId];

      fetch(`${API_URL}/api/client/me/paniers/${storeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({
          storeName: panier?.storeName || undefined,
          storeSlug: panier?.storeSlug || undefined,
          lignes: (panier?.lignes || []).map(ligneEnvoyee),
          appareil: identifiantAppareil(),
        }),
      })
        .then((reponse) => (reponse.ok ? reponse.json() : null))
        .then((corps) => {
          // L'heure du serveur fait foi pour départager deux appareils : celle
          // du navigateur peut avancer ou retarder.
          const enregistre: PanierDistant | undefined = corps?.data;
          if (!enregistre || enAttente.has(storeId)) return;
          const actuel = lireMagasin();
          if (actuel[storeId] && empreinte(actuel[storeId].lignes) === empreinte(enregistre.lignes)) {
            actuel[storeId] = { ...actuel[storeId], majA: enregistre.majA };
            ecrireMagasin(actuel);
          }
        })
        .catch(() => {
          // Hors ligne : la prochaine synchronisation le renverra.
        });
    }, 400)
  );
}

/** Le serveur n'accepte que ce qu'il connaît d'une ligne. */
function ligneEnvoyee(ligne: LignePanier) {
  return {
    productId: ligne.productId,
    ...(ligne.variantId ? { variantId: ligne.variantId } : {}),
    name: ligne.name,
    ...(ligne.variantNom ? { variantNom: ligne.variantNom } : {}),
    price: ligne.price,
    quantity: ligne.quantity,
    ...(ligne.description ? { description: ligne.description.slice(0, 1000) } : {}),
    ...(ligne.isAvailable !== undefined ? { isAvailable: ligne.isAvailable } : {}),
  };
}

/**
 * Un panier modifié sur un autre appareil du compte remplace celui d'ici :
 * l'annonce vient du serveur, c'est la dernière écriture. Seule exception, une
 * modification faite ici et pas encore partie, qui l'emportera à son envoi.
 * Vide, il efface celui d'ici : il a été commandé ou vidé ailleurs.
 */
export function appliquerPanierDistant(distant: PanierDistant) {
  if (!distant?.storeId || distant.appareil === identifiantAppareil()) return;
  if (enAttente.has(distant.storeId)) return;

  const magasin = lireMagasin();
  const local = magasin[distant.storeId];

  if (distant.lignes.length === 0) {
    if (!local) return;
    delete magasin[distant.storeId];
  } else {
    magasin[distant.storeId] = {
      storeId: distant.storeId,
      storeName: distant.storeName || local?.storeName || '',
      storeSlug: distant.storeSlug || local?.storeSlug || undefined,
      lignes: distant.lignes,
      majA: distant.majA,
    };
  }

  ecrireMagasin(magasin);
  prevenir(distant.storeId);
}

/**
 * À la connexion (et au retour sur l'onglet) : les paniers du serveur et
 * ceux du navigateur se rejoignent. Pour chaque commerce, le plus récent
 * l'emporte ; ceux que le serveur ne connaît pas encore — composés avant de
 * se connecter — lui sont envoyés.
 */
export async function synchroniserPaniers() {
  const jeton = jetonClient();
  if (!jeton) return;

  let distants: PanierDistant[];
  try {
    const reponse = await fetch(`${API_URL}/api/client/me/paniers`, {
      headers: { Authorization: `Bearer ${jeton}` },
    });
    if (!reponse.ok) return;
    distants = (await reponse.json()).data || [];
  } catch {
    return;
  }

  const magasin = lireMagasin();
  const connus = new Set<string>();
  const aEnvoyer: string[] = [];
  const modifies: string[] = [];

  for (const distant of distants) {
    connus.add(distant.storeId);
    const local = magasin[distant.storeId];

    if (local && local.majA > distant.majA) {
      if (empreinte(local.lignes) !== empreinte(distant.lignes)) aEnvoyer.push(distant.storeId);
      continue;
    }
    if (distant.lignes.length === 0) {
      if (local) {
        delete magasin[distant.storeId];
        modifies.push(distant.storeId);
      }
      continue;
    }
    if (!local || empreinte(local.lignes) !== empreinte(distant.lignes)) modifies.push(distant.storeId);
    magasin[distant.storeId] = {
      storeId: distant.storeId,
      storeName: distant.storeName || local?.storeName || '',
      storeSlug: distant.storeSlug || local?.storeSlug || undefined,
      lignes: distant.lignes,
      majA: distant.majA,
    };
  }

  for (const storeId of Object.keys(magasin)) {
    if (!connus.has(storeId) && magasin[storeId].lignes.length > 0) aEnvoyer.push(storeId);
  }

  ecrireMagasin(magasin);
  modifies.forEach((storeId) => prevenir(storeId));
  if (modifies.length === 0) prevenir();
  aEnvoyer.forEach(envoyerAuServeur);
}
