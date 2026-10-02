/**
 * Les textes des pages légales se modifient depuis l'espace superowner
 * (Pages légales) et sont servis par l'API. Ici ne restent que le sommaire et
 * l'adresse de contact affichée sous chaque page.
 */
export const EMAIL_CONTACT = 'contact@zupeat.com';

export const PAGES_LEGALES = [
  { href: '/mentions-legales', cle: 'mentions', titre: 'Mentions légales' },
  { href: '/cgu', cle: 'cgu', titre: 'Conditions générales d’utilisation' },
  { href: '/cgv', cle: 'cgv', titre: 'Conditions générales de vente' },
  { href: '/conditions-commercants', cle: 'commercants', titre: 'Conditions commerçants' },
  { href: '/conditions-livreurs', cle: 'livreurs', titre: 'Conditions livreurs' },
  { href: '/confidentialite', cle: 'confidentialite', titre: 'Politique de confidentialité' },
  { href: '/cookies', cle: 'cookies', titre: 'Cookies et traceurs' },
] as const;
