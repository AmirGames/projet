/**
 * Répartition des pages entre les deux domaines du site.
 *
 * Un même code sert deux publics qui n'ont rien à faire l'un chez l'autre :
 *   - le domaine professionnel (commercant.monsite.fr) : commerçants,
 *     livreurs, administration et superowner ;
 *   - le domaine public (monsite.fr) : la vitrine, les boutiques et les
 *     commandes des clients.
 *
 * Séparer les deux donne des sessions cloisonnées (chaque domaine a son propre
 * stockage navigateur, un client et un commerçant ne se marchent plus dessus)
 * et laisse l'espace professionnel hors des moteurs de recherche.
 *
 * Tant que les deux domaines ne sont pas renseignés, la répartition est
 * inactive et le site fonctionne comme avant sur un domaine unique.
 */

export type Espace = 'pro' | 'public' | 'commun';

export const DOMAINE_PRO = (process.env.NEXT_PUBLIC_DOMAINE_PRO || '').trim().toLowerCase();
export const DOMAINE_PUBLIC = (process.env.NEXT_PUBLIC_DOMAINE_PUBLIC || '').trim().toLowerCase();

/** La séparation ne s'applique que si les deux domaines sont connus. */
export const CLOISONNEMENT_ACTIF = Boolean(DOMAINE_PRO && DOMAINE_PUBLIC);

/** Premier segment des pages réservées aux professionnels. */
const SEGMENTS_PRO = new Set([
  'merchant',
  'superowner',
  'super-admin',
  'admin',
  'dashboard',
  'driver',
  'signup', // inscription commerçant : elle crée une organisation
]);

/** Premier segment des pages destinées aux clients. */
const SEGMENTS_PUBLIC = new Set([
  'client',
  'store',
  'restaurant',
  'restaurants',
  'checkout',
  'payment',
  'order-confirmation',
  'track',
]);

/**
 * Exceptions : des pages professionnelles rangées sous un segment public.
 * La création de boutique vit sous /store alors qu'elle appartient au
 * commerçant.
 */
const CHEMINS_PRO = ['/store/new'];

/** Pages accessibles depuis les deux domaines. */
const SEGMENTS_COMMUNS = new Set(['login']);

/** À quel espace appartient une page. */
export function espaceDuChemin(chemin: string): Espace {
  if (CHEMINS_PRO.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))) {
    return 'pro';
  }

  const segment = chemin.split('/')[1] || '';

  if (SEGMENTS_COMMUNS.has(segment)) return 'commun';
  if (SEGMENTS_PRO.has(segment)) return 'pro';
  if (SEGMENTS_PUBLIC.has(segment)) return 'public';

  // Une page inconnue reste commune : mieux vaut l'afficher que renvoyer le
  // visiteur sur un autre domaine par excès de zèle.
  return 'commun';
}

/** L'espace desservi par un nom d'hôte, ou null s'il n'est pas reconnu. */
export function espaceDuDomaine(hote: string): 'pro' | 'public' | null {
  if (!CLOISONNEMENT_ACTIF) return null;

  // Le port ne fait pas partie du domaine ; en développement il est toujours là.
  const domaine = hote.split(':')[0].toLowerCase();

  if (domaine === DOMAINE_PRO) return 'pro';
  if (domaine === DOMAINE_PUBLIC) return 'public';

  // localhost et les adresses IP continuent de tout servir : le mode
  // « domaine unique » reste disponible pour le développement.
  return null;
}

/**
 * Adresse absolue d'une page sur son domaine, pour les liens qui traversent
 * les deux espaces (« Voir la boutique », « Espace commerçant »).
 *
 * Sans cloisonnement, on renvoie le chemin tel quel : le lien reste relatif et
 * fonctionne sur le domaine unique.
 */
export function lienVersEspace(espace: 'pro' | 'public', chemin: string): string {
  if (!CLOISONNEMENT_ACTIF) return chemin;

  const domaine = espace === 'pro' ? DOMAINE_PRO : DOMAINE_PUBLIC;

  // Le port et le protocole du site courant : en développement on reste en
  // http sur 3000, en production en https sans port.
  if (typeof window === 'undefined') {
    return `https://${domaine}${chemin}`;
  }

  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${domaine}${port}${chemin}`;
}
