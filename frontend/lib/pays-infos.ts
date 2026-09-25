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

/**
 * Numéro au format international (« +32470123456 »), selon le pays choisi.
 * Un numéro déjà international (« +33… », « 0033… ») garde son indicatif ;
 * un numéro national (« 0470 12 34 56 ») reçoit celui du pays. Envoyé ainsi,
 * le serveur n'a plus à deviner le pays pour les SMS.
 */
export function telephoneInternational(numero: string, pays: Pays): string {
  const chiffres = numero.replace(/[^\d+]/g, '');
  if (!chiffres) return numero.trim();
  if (chiffres.startsWith('+')) return chiffres;
  if (chiffres.startsWith('00')) return `+${chiffres.slice(2)}`;
  const indicatif = PAYS[pays].indicatif;
  // « 32470… » tapé sans le « + » : l'indicatif est déjà là.
  if (chiffres.startsWith(indicatif.slice(1)) && chiffres.length > 10) return `+${chiffres}`;
  return `${indicatif}${chiffres.replace(/^0/, '')}`;
}
