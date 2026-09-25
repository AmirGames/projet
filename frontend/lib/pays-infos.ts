/**
 * Pays où la plateforme opère, et ce qui change d'un pays à l'autre dans les
 * formulaires. Sans dépendance serveur : lisible côté client comme serveur.
 */
export const PAYS = {
  BE: {
    nom: 'Belgique',
    drapeau: '🇧🇪',
    // Nom tel que le serveur l'attend pour la facturation (billingCountry).
    nomFacturation: 'Belgique',
    indicatif: '+32',
    exempleTelephone: '+32 470 12 34 56',
    codePostal: /^\d{4}$/,
    exempleCodePostal: '1000',
    exempleVille: 'Bruxelles',
    exempleRue: 'Rue Neuve 12',
  },
  FR: {
    nom: 'France',
    drapeau: '🇫🇷',
    nomFacturation: 'France',
    indicatif: '+33',
    exempleTelephone: '+33 6 12 34 56 78',
    codePostal: /^\d{5}$/,
    exempleCodePostal: '75001',
    exempleVille: 'Paris',
    exempleRue: '12 rue de la Paix',
  },
} as const;

export type Pays = keyof typeof PAYS;

/** Le projet démarre en Belgique : c'est le pays par défaut. */
export const PAYS_PAR_DEFAUT: Pays = 'BE';

/** Cookie qui retient le pays choisi par le visiteur. */
export const COOKIE_PAYS = 'pays';

export function paysValide(code: string | null | undefined): Pays | null {
  const c = (code || '').toUpperCase();
  return c in PAYS ? (c as Pays) : null;
}
