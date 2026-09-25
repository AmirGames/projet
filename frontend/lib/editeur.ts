/**
 * Identité de l'éditeur, reprise par toutes les pages légales.
 *
 * Les valeurs entre crochets sont à remplacer AVANT l'ouverture au public :
 * une mention légale incomplète vaut une mention absente (LCEN, art. 6-III).
 */
export const EDITEUR = {
  nomCommercial: 'Zupone',
  raisonSociale: '[Raison sociale]',
  formeJuridique: '[SAS / SARL / EI…]',
  capital: '[montant] €',
  siege: '[Adresse du siège social]',
  rcs: '[Ville d’immatriculation] [numéro SIREN]',
  tva: '[Numéro de TVA intracommunautaire]',
  directeurPublication: '[Nom du directeur de la publication]',
  email: 'contact@zupone.com',
  emailDonnees: 'dpo@zupone.com',
  telephone: '[Téléphone]',
  site: 'zupone.com',
  hebergeur: {
    nom: '[Nom de l’hébergeur]',
    adresse: '[Adresse de l’hébergeur]',
    telephone: '[Téléphone de l’hébergeur]',
  },
  mediateur: {
    nom: '[Nom du médiateur de la consommation]',
    site: '[Site du médiateur]',
  },
  miseAJour: '25 septembre 2026',
};

export const PAGES_LEGALES = [
  { href: '/mentions-legales', titre: 'Mentions légales' },
  { href: '/cgu', titre: 'Conditions générales d’utilisation' },
  { href: '/cgv', titre: 'Conditions générales de vente' },
  { href: '/conditions-commercants', titre: 'Conditions commerçants' },
  { href: '/conditions-livreurs', titre: 'Conditions livreurs' },
  { href: '/confidentialite', titre: 'Politique de confidentialité' },
  { href: '/cookies', titre: 'Cookies et traceurs' },
] as const;
