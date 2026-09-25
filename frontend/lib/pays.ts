import { cookies, headers } from 'next/headers';

/** Pays pour lesquels les pages « Devenir … » ont un contenu propre. */
export const PAYS = {
  BE: { nom: 'Belgique', drapeau: '🇧🇪' },
  FR: { nom: 'France', drapeau: '🇫🇷' },
} as const;

export type Pays = keyof typeof PAYS;

/** Le projet démarre en Belgique : c'est le pays par défaut. */
export const PAYS_PAR_DEFAUT: Pays = 'BE';

function valide(code: string | null | undefined): Pays | null {
  const c = (code || '').toUpperCase();
  return c in PAYS ? (c as Pays) : null;
}

/**
 * Pays du visiteur, par ordre de priorité : choix explicite (?pays=),
 * cookie, géolocalisation fournie par l'hébergeur, puis la Belgique.
 *
 * La langue du navigateur n'est pas utilisée : beaucoup de Belges ont un
 * navigateur réglé en « fr-FR ».
 */
export function paysDuVisiteur(choix?: string | string[]): Pays {
  const explicite = valide(Array.isArray(choix) ? choix[0] : choix);
  if (explicite) return explicite;

  const cookie = valide(cookies().get('pays')?.value);
  if (cookie) return cookie;

  const h = headers();
  const geo = valide(h.get('x-vercel-ip-country') || h.get('cf-ipcountry'));
  if (geo) return geo;

  return PAYS_PAR_DEFAUT;
}
