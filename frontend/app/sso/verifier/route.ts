import { NextRequest } from 'next/server';
import {
  adresseDuSite,
  appelerApi,
  effacerCookie,
  introuvable,
  nomDuCookie,
  racine,
  rediriger,
  surLeDomaineCentral,
} from '@/lib/sso-central';

export const dynamic = 'force-dynamic';

/**
 * GET /sso/verifier?retour=https://<domaine>/sso/arrivee?suite=… — sur
 * zupone.com : si le cookie central désigne une session ouverte, un code à
 * usage unique part vers le domaine demandeur ; sinon, il apprend qu'il n'y a
 * personne (absent=1) et affiche sa page de connexion.
 */
export async function GET(requete: NextRequest) {
  if (!surLeDomaineCentral(requete)) return introuvable();

  const retour = adresseDuSite(requete.nextUrl.searchParams.get('retour'));
  // Seule la page d'arrivée du domaine reçoit un code : pas une page quelconque
  // qui le laisserait traîner dans son adresse.
  if (!retour || retour.pathname !== '/sso/arrivee') return rediriger(racine(requete));

  const jeton = requete.cookies.get(nomDuCookie(requete))?.value;
  const { statut, donnees } = jeton
    ? await appelerApi('/api/sso/central/code', { jeton, audience: retour.origin })
    : { statut: 0, donnees: null };

  if (donnees?.code) {
    retour.searchParams.set('code', donnees.code);
    return rediriger(retour);
  }

  retour.searchParams.set('absent', '1');
  const reponse = rediriger(retour);
  // Un cookie qui ne mène plus à rien (session fermée, expirée) part avec ;
  // pas sur une simple panne de l'API, qui déconnecterait sans raison.
  if (jeton && statut === 401) effacerCookie(reponse, requete);
  return reponse;
}
