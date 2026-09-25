import { NextRequest, NextResponse } from 'next/server';

import {
  ACCUEIL,
  CLOISONNEMENT_ACTIF,
  DOMAINES,
  EspaceHeberge,
  espaceDuChemin,
  espaceDuDomaine,
  espaceHeberge,
} from '@/lib/domaines';
import { NOM_COOKIE_LANGUE, estUneLangueSupportee } from '@/i18n/langues';
import {
  ENTETE_REGION,
  NOM_COOKIE_REGION,
  REGIONS,
  regionDesLangues,
  regionParDefaut,
  trouverRegion,
  type Region,
} from '@/i18n/regions';
import { estCheminRegional, separerRegion } from '@/i18n/chemins-regionaux';

const UN_AN = 60 * 60 * 24 * 365;

/**
 * Aiguille chaque requête vers le bon domaine.
 *
 * Trois domaines, un seul déploiement : le middleware lit l'hôte demandé et
 * décide si la page a le droit d'y être affichée. Une page commerçant appelée
 * depuis le domaine public est renvoyée vers le domaine professionnel, une
 * page livreur vers le domaine livreur — l'adresse visible reste cohérente
 * avec le contenu, et une session client ne croise jamais une session
 * commerçant.
 *
 * Sans domaines configurés, le site continue de fonctionner sur un domaine
 * unique, notamment sur localhost.
 *
 * Il gère aussi les sous-répertoires de région (/be-fr/, /fr-fr/…) des pages
 * publiques : le préfixe est retiré et la requête réécrite vers la page
 * d'origine, la région passant par un en-tête (voir i18n/chemins-regionaux).
 */

/**
 * Où servir une page, du point de vue des domaines : soit une redirection
 * vers le bon domaine, soit le chemin interne à afficher (l'accueil de
 * chaque domaine est réécrit vers sa page propre).
 */
function aiguillerDomaine(
  requete: NextRequest,
  chemin: string,
  espaceHote: EspaceHeberge | null,
): NextResponse | string {
  // Sans domaines configurés, ou sur un hôte inconnu (localhost, adresse IP,
  // aperçu de déploiement) : on ne touche à rien.
  if (!espaceHote) return chemin;

  // L'accueil n'appartient à personne : chaque domaine y montre le sien.
  if (chemin === '/') return ACCUEIL[espaceHote];

  const espacePage = espaceDuChemin(chemin);

  if (espacePage === 'commun' || espacePage === espaceHote) return chemin;

  // Un espace sans domaine propre reste servi partout : activer le domaine
  // livreur seul ne doit pas rendre l'administration injoignable.
  if (!espaceHeberge(espacePage as EspaceHeberge)) return chemin;

  // Page demandée sur le mauvais domaine : on la sert depuis le bon, en
  // gardant le chemin et les paramètres.
  const url = requete.nextUrl.clone();
  url.hostname = DOMAINES[espacePage as EspaceHeberge];

  return NextResponse.redirect(url);
}

/**
 * La région d'un visiteur arrivé sans préfixe : celle qu'il a choisie
 * (cookie), sinon celle de sa langue choisie, sinon celle que son navigateur
 * annonce, sinon la France.
 */
function regionDuVisiteur(requete: NextRequest): Region {
  const choisie = trouverRegion(requete.cookies.get(NOM_COOKIE_REGION)?.value);
  if (choisie) return choisie;

  const langue = requete.cookies.get(NOM_COOKIE_LANGUE)?.value;
  if (estUneLangueSupportee(langue)) return regionParDefaut(langue);

  const annoncees = (requete.headers.get('accept-language') || '')
    .split(',')
    .map((morceau) => morceau.split(';')[0]);

  return regionDesLangues(annoncees) ?? REGIONS[0];
}

function rediriger(requete: NextRequest, chemin: string) {
  const url = requete.nextUrl.clone();
  url.pathname = chemin;
  return NextResponse.redirect(url);
}

export function middleware(requete: NextRequest) {
  const chemin = requete.nextUrl.pathname;
  const espaceHote = CLOISONNEMENT_ACTIF
    ? espaceDuDomaine(requete.headers.get('host') || '')
    : null;

  // Les sous-répertoires de région n'existent que côté public : les domaines
  // commerçant et livreur n'ont rien à indexer.
  const regionsActives = !espaceHote || espaceHote === 'public';

  // L'en-tête de région ne vient que d'ici, jamais du navigateur.
  const entetes = new Headers(requete.headers);
  entetes.delete(ENTETE_REGION);

  const { region, reste } = separerRegion(chemin);

  if (region) {
    // /be-fr/merchant… : la page n'est pas régionale, on retire le préfixe.
    if (!regionsActives || !estCheminRegional(reste)) return rediriger(requete, reste);

    // /BE-FR/… : une seule adresse par page, en minuscules.
    if (!chemin.startsWith(`/${region.code}`)) {
      return rediriger(requete, `/${region.code}${reste === '/' ? '' : reste}`);
    }

    const cible = aiguillerDomaine(requete, reste, espaceHote);
    if (typeof cible !== 'string') return cible;

    entetes.set(ENTETE_REGION, region.code);
    const url = requete.nextUrl.clone();
    url.pathname = cible;
    const reponse = NextResponse.rewrite(url, { request: { headers: entetes } });

    // Arriver par /gb-en/… vaut choix : le reste du site (tunnel, compte)
    // suit la région et la langue de l'adresse.
    const options = { path: '/', maxAge: UN_AN, sameSite: 'lax' as const };
    if (requete.cookies.get(NOM_COOKIE_REGION)?.value !== region.code) {
      reponse.cookies.set(NOM_COOKIE_REGION, region.code, options);
    }
    if (requete.cookies.get(NOM_COOKIE_LANGUE)?.value !== region.langue) {
      reponse.cookies.set(NOM_COOKIE_LANGUE, region.langue, options);
    }
    return reponse;
  }

  // Page publique demandée sans préfixe (ancien lien, signet, lien interne
  // pas encore régionalisé) : on l'envoie sous la région du visiteur.
  // Redirection temporaire, puisqu'elle dépend du visiteur.
  if (regionsActives && estCheminRegional(chemin) && ['GET', 'HEAD'].includes(requete.method)) {
    return rediriger(requete, `/${regionDuVisiteur(requete).code}${chemin === '/' ? '' : chemin}`);
  }

  const cible = aiguillerDomaine(requete, chemin, espaceHote);
  if (typeof cible !== 'string') return cible;

  if (cible === chemin) return NextResponse.next({ request: { headers: entetes } });

  const url = requete.nextUrl.clone();
  url.pathname = cible;
  return NextResponse.rewrite(url, { request: { headers: entetes } });
}

export const config = {
  matcher: [
    // Tout sauf les ressources servies par Next et les fichiers statiques :
    // les rediriger n'apporterait rien et casserait les pages.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
