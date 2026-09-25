import { cookies, headers } from 'next/headers';
import { COOKIE_PAYS, PAYS_PAR_DEFAUT, paysValide, type Pays } from '@/lib/pays-infos';

export { PAYS, PAYS_PAR_DEFAUT, type Pays } from '@/lib/pays-infos';

/**
 * Pays du visiteur côté serveur, par ordre de priorité : choix explicite
 * (?pays=), cookie, géolocalisation fournie par l'hébergeur, puis la Belgique.
 *
 * La langue du navigateur n'est pas utilisée : beaucoup de Belges ont un
 * navigateur réglé en « fr-FR ».
 */
export function paysDuVisiteur(choix?: string | string[]): Pays {
  const explicite = paysValide(Array.isArray(choix) ? choix[0] : choix);
  if (explicite) return explicite;

  const cookie = paysValide(cookies().get(COOKIE_PAYS)?.value);
  if (cookie) return cookie;

  const h = headers();
  const geo = paysValide(h.get('x-vercel-ip-country') || h.get('cf-ipcountry'));
  if (geo) return geo;

  return PAYS_PAR_DEFAUT;
}
