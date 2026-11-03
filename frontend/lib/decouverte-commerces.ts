export interface CommerceDecouvrable {
  id: string;
  name: string;
  city?: string | null;
  description?: string | null;
  genreLibelle?: string | null;
  isOpenNow?: boolean;
  rating?: number | string | null;
  totalRatings?: number;
  distance?: number | null;
  deliveryCost?: number | string | null;
  estimatedDeliveryTime?: string | null;
  products?: { name: string }[];
  searchProducts?: { name: string }[];
  livraison?: { livrable: boolean; frais: number; deliveryMinutes: number | null } | null;
}

const normaliser = (texte: string) => texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Une seule insertion, suppression ou substitution ; jamais pour les mots courts. */
function presqueIdentiques(a: string, b: string) {
  if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, erreurs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++erreurs > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return erreurs + (a.length - i) + (b.length - j) <= 1;
}

/** Tous les mots doivent correspondre ; les noms et plats précis pèsent davantage. */
export function pertinenceCommerce(commerce: CommerceDecouvrable, recherche: string) {
  const termes = normaliser(recherche).slice(0, 120).split(' ').filter(Boolean).slice(0, 12);
  if (!termes.length) return 1;
  const champs = [
    { texte: commerce.name, poids: 8 },
    ...(commerce.searchProducts ?? commerce.products ?? []).map((p) => ({ texte: p.name, poids: 6 })),
    { texte: commerce.genreLibelle ?? '', poids: 4 },
    { texte: commerce.city ?? '', poids: 2 },
    { texte: commerce.description ?? '', poids: 1 },
  ].map((c) => ({ mots: normaliser(c.texte).split(' ').filter(Boolean), poids: c.poids }));
  let score = 0;
  for (const terme of termes) {
    let meilleur = 0;
    for (const champ of champs) for (const mot of champ.mots) {
      const qualite = mot === terme ? 3 : mot.startsWith(terme) ? 2 : presqueIdentiques(terme, mot) ? 1 : 0;
      meilleur = Math.max(meilleur, qualite * champ.poids);
    }
    if (!meilleur) return 0;
    score += meilleur;
  }
  return score;
}

export function minutesCommerce(commerce: CommerceDecouvrable) {
  if (commerce.livraison?.livrable === false) return null;
  const valeur = commerce.livraison?.deliveryMinutes ?? (commerce.estimatedDeliveryTime ? Number.parseInt(commerce.estimatedDeliveryTime, 10) : null);
  return valeur != null && Number.isFinite(valeur) && valeur >= 0 ? valeur : null;
}

export function fraisCommerce(commerce: CommerceDecouvrable) {
  const valeur = commerce.livraison ? (commerce.livraison.livrable ? commerce.livraison.frais : null) : commerce.deliveryCost;
  return valeur != null && Number.isFinite(Number(valeur)) && Number(valeur) >= 0 ? Number(valeur) : null;
}

const disponibilite = (c: CommerceDecouvrable) => c.isOpenNow === true ? 2 : c.isOpenNow === false ? 0 : 1;
const livrabilite = (c: CommerceDecouvrable) => c.livraison?.livrable === true ? 2 : c.livraison?.livrable === false ? 0 : 1;
const noteFiable = (c: CommerceDecouvrable) => c.totalRatings && c.rating != null && Number.isFinite(Number(c.rating)) ? (Number(c.rating) * c.totalRatings + 4 * 10) / (c.totalRatings + 10) : 4;

export function comparerRecommandations(a: CommerceDecouvrable, b: CommerceDecouvrable, scoreA = 1, scoreB = 1) {
  return disponibilite(b) - disponibilite(a) || livrabilite(b) - livrabilite(a) || scoreB - scoreA
    || (minutesCommerce(a) ?? Infinity) - (minutesCommerce(b) ?? Infinity)
    || noteFiable(b) - noteFiable(a)
    || (fraisCommerce(a) ?? Infinity) - (fraisCommerce(b) ?? Infinity)
    || (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
