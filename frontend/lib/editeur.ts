/**
 * Les textes des pages légales se modifient depuis l'espace superowner
 * (Pages légales) et sont servis par l'API. Ici ne restent que le sommaire et
 * l'adresse de contact affichée sous chaque page.
 */
export const EMAIL_CONTACT = 'contact@zupone.com';

export const PAGES_LEGALES = [
  { href: '/mentions-legales', titre: 'Mentions légales' },
  { href: '/cgu', titre: 'Conditions générales d’utilisation' },
  { href: '/cgv', titre: 'Conditions générales de vente' },
  { href: '/conditions-commercants', titre: 'Conditions commerçants' },
  { href: '/conditions-livreurs', titre: 'Conditions livreurs' },
  { href: '/confidentialite', titre: 'Politique de confidentialité' },
  { href: '/cookies', titre: 'Cookies et traceurs' },
] as const;
