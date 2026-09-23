/**
 * Répartition des pages entre les domaines du site.
 *
 * Un même code sert trois publics qui n'ont rien à faire les uns chez les
 * autres :
 *   - le domaine professionnel (commercant.monsite.fr) : commerçants,
 *     administration et superowner ;
 *   - le domaine livreur (livreur.monsite.fr) : les livreurs de la
 *     plateforme, avec leur propre panneau ;
 *   - le domaine public (monsite.fr) : la vitrine, les boutiques et les
 *     commandes des clients.
 *
 * Séparer les domaines donne des sessions cloisonnées (chaque domaine a son
 * propre stockage navigateur, un client et un commerçant ne se marchent plus
 * dessus) et laisse les espaces professionnels hors des moteurs de recherche.
 *
 * Chaque domaine est facultatif et se configure indépendamment : tant que le
 * domaine public et au moins un espace professionnel ne sont pas renseignés,
 * la répartition est inactive et le site fonctionne comme avant sur un
 * domaine unique.
 */

export type Espace = 'pro' | 'livreur' | 'public' | 'commun';

/** Un espace qui possède son propre domaine. */
export type EspaceHeberge = 'pro' | 'livreur' | 'public';

const lire = (valeur: string | undefined) => (valeur || '').trim().toLowerCase();

export const DOMAINE_PRO = lire(process.env.NEXT_PUBLIC_DOMAINE_PRO);
export const DOMAINE_PUBLIC = lire(process.env.NEXT_PUBLIC_DOMAINE_PUBLIC);
export const DOMAINE_LIVREUR = lire(process.env.NEXT_PUBLIC_DOMAINE_LIVREUR);

export const DOMAINES: Record<EspaceHeberge, string> = {
  pro: DOMAINE_PRO,
  livreur: DOMAINE_LIVREUR,
  public: DOMAINE_PUBLIC,
};

/**
 * La séparation demande le domaine public et au moins un espace
 * professionnel : sans point de comparaison, il n'y a rien à répartir.
 */
export const CLOISONNEMENT_ACTIF = Boolean(DOMAINE_PUBLIC && (DOMAINE_PRO || DOMAINE_LIVREUR));

/**
 * Premier segment des pages de chaque espace.
 *
 * Une page dont l'espace n'a pas de domaine configuré reste servie partout :
 * activer le domaine livreur seul ne doit pas rendre l'administration
 * injoignable.
 */
const SEGMENTS: Record<EspaceHeberge, string[]> = {
  pro: [
    'merchant',
    'superowner',
    'signup', // inscription commerçant : elle crée une organisation
  ],
  livreur: ['driver'],
  public: [
    'client',
    'store',
    'restaurant',
    'restaurants',
    'checkout',
    'payment',
    'order-confirmation',
    'track',
  ],
};

/**
 * Exceptions : des pages professionnelles rangées sous un segment public.
 * La création de boutique vit sous /store alors qu'elle appartient au
 * commerçant.
 */
const CHEMINS: Partial<Record<EspaceHeberge, string[]>> = {
  pro: ['/store/new'],
};

/**
 * Pages accessibles depuis tous les domaines : celles du compte lui-même.
 * Un lien de réinitialisation doit fonctionner quel que soit le domaine
 * depuis lequel la demande a été faite. Le dashboard est aussi commun car
 * c'est le sélecteur de rôles pour les utilisateurs multi-rôles.
 */
const SEGMENTS_COMMUNS = ['login', 'mot-de-passe-oublie', 'reinitialiser', 'verifier-email', 'dashboard'];

/** Accueil propre à chaque domaine. */
export const ACCUEIL: Record<EspaceHeberge, string> = {
  // La page d'accueil actuelle présente l'offre aux commerçants.
  pro: '/',
  // Le livreur arrive sur son tableau de bord, qui le renvoie à la connexion
  // s'il n'est pas identifié.
  livreur: '/driver',
  // Côté public, la liste des commerces qui livrent chez le visiteur.
  public: '/client',
};

/** Un espace n'est cloisonné que si son domaine est renseigné. */
export function espaceHeberge(espace: EspaceHeberge): boolean {
  return Boolean(DOMAINES[espace]);
}

/** À quel espace appartient une page. */
export function espaceDuChemin(chemin: string): Espace {
  const segment = chemin.split('/')[1] || '';

  if (SEGMENTS_COMMUNS.includes(segment)) return 'commun';

  for (const espace of ['pro', 'livreur', 'public'] as EspaceHeberge[]) {
    const exceptions = CHEMINS[espace] || [];

    if (exceptions.some((prefixe) => chemin === prefixe || chemin.startsWith(`${prefixe}/`))) {
      return espace;
    }
  }

  for (const espace of ['pro', 'livreur', 'public'] as EspaceHeberge[]) {
    if (SEGMENTS[espace].includes(segment)) return espace;
  }

  // Une page inconnue reste commune : mieux vaut l'afficher que renvoyer le
  // visiteur sur un autre domaine par excès de zèle.
  return 'commun';
}

/** L'espace desservi par un nom d'hôte, ou null s'il n'est pas reconnu. */
export function espaceDuDomaine(hote: string): EspaceHeberge | null {
  if (!CLOISONNEMENT_ACTIF) return null;

  // Le port ne fait pas partie du domaine ; en développement il est toujours là.
  const domaine = hote.split(':')[0].toLowerCase();

  for (const espace of ['pro', 'livreur', 'public'] as EspaceHeberge[]) {
    if (DOMAINES[espace] && DOMAINES[espace] === domaine) return espace;
  }

  // localhost et les adresses IP continuent de tout servir : le mode
  // « domaine unique » reste disponible pour le développement.
  return null;
}

/**
 * Adresse absolue d'une page sur son domaine, pour les liens qui traversent
 * les espaces (« Voir la boutique », « Espace commerçant »).
 *
 * Si l'espace visé n'a pas de domaine propre, on renvoie le chemin tel quel :
 * le lien reste relatif et fonctionne sur le domaine courant.
 */
export function lienVersEspace(espace: EspaceHeberge, chemin: string): string {
  const domaine = DOMAINES[espace];
  if (!CLOISONNEMENT_ACTIF || !domaine) return chemin;

  // Le port et le protocole du site courant : en développement on reste en
  // http sur 3000, en production en https sans port.
  if (typeof window === 'undefined') {
    return `https://${domaine}${chemin}`;
  }

  const port = window.location.port ? `:${window.location.port}` : '';
  return `${window.location.protocol}//${domaine}${port}${chemin}`;
}
