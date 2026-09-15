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
 * Sans domaines configurés, le middleware ne fait rien : le site continue de
 * fonctionner sur un domaine unique, notamment sur localhost.
 */

export function middleware(requete: NextRequest) {
  if (!CLOISONNEMENT_ACTIF) return NextResponse.next();

  const hote = requete.headers.get('host') || '';
  const espaceHote = espaceDuDomaine(hote);

  // Hôte inconnu (localhost, adresse IP, aperçu de déploiement) : on ne
  // touche à rien.
  if (!espaceHote) return NextResponse.next();

  const chemin = requete.nextUrl.pathname;

  // L'accueil n'appartient à personne : chaque domaine y montre le sien.
  if (chemin === '/') {
    const destination = ACCUEIL[espaceHote];
    if (destination === '/') return NextResponse.next();

    const url = requete.nextUrl.clone();
    url.pathname = destination;
    return NextResponse.rewrite(url);
  }

  const espacePage = espaceDuChemin(chemin);

  if (espacePage === 'commun' || espacePage === espaceHote) {
    return NextResponse.next();
  }

  // Un espace sans domaine propre reste servi partout : activer le domaine
  // livreur seul ne doit pas rendre l'administration injoignable.
  if (!espaceHeberge(espacePage as EspaceHeberge)) {
    return NextResponse.next();
  }

  // Page demandée sur le mauvais domaine : on la sert depuis le bon, en
  // gardant le chemin et les paramètres.
  const url = requete.nextUrl.clone();
  url.hostname = DOMAINES[espacePage as EspaceHeberge];

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Tout sauf les ressources servies par Next et les fichiers statiques :
    // les rediriger n'apporterait rien et casserait les pages.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
