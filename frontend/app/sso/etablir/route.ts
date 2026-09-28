import { NextRequest } from 'next/server';
import {
  adresseDuSite,
  appelerApi,
  introuvable,
  poserCookie,
  racine,
  rediriger,
  surLeDomaineCentral,
} from '@/lib/sso-central';

export const dynamic = 'force-dynamic';

/**
 * GET /sso/etablir?code=…&retour=… — sur zupone.com, juste après une connexion
 * sur un domaine du site : le code devient le cookie central, puis retour.
 *
 * Seulement quand on arrive d'un domaine du site (Referer) : sinon, un lien
 * piégé portant le code d'un autre compte connecterait la victime à ce compte
 * sur tous les domaines. Dans le doute, on revient sans rien poser.
 */
export async function GET(requete: NextRequest) {
  if (!surLeDomaineCentral(requete)) return introuvable();

  const retour = adresseDuSite(requete.nextUrl.searchParams.get('retour'));
  const code = requete.nextUrl.searchParams.get('code');
  if (!retour) return rediriger(racine(requete));

  const provenance = adresseDuSite(requete.headers.get('referer'));
  if (!code || !provenance) return rediriger(retour);

  const { donnees } = await appelerApi('/api/sso/central/ouvrir', { code });
  const reponse = rediriger(retour);
  if (donnees?.jeton) poserCookie(reponse, requete, donnees.jeton);
  return reponse;
}
