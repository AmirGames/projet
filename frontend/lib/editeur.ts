/**
 * Les textes des pages légales se modifient depuis l'espace superowner
 * (Pages légales) et sont servis par l'API. Ici ne restent que le sommaire et
 * l'adresse de contact affichée sous chaque page.
 */
export const EMAIL_CONTACT = 'contact@zupeat.com';

export const PAGES_LEGALES = [
  { href: '/mentions-legales', cle: 'mentions' },
  { href: '/cgu', cle: 'cgu' },
  { href: '/cgv', cle: 'cgv' },
  { href: '/conditions-commercants', cle: 'commercants' },
  { href: '/conditions-livreurs', cle: 'livreurs' },
  { href: '/confidentialite', cle: 'confidentialite' },
  { href: '/cookies', cle: 'cookies' },
] as const;
