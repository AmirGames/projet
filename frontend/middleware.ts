import { NextRequest, NextResponse } from 'next/server';

import { espaceDuChemin, espaceDuDomaine, CLOISONNEMENT_ACTIF, DOMAINE_PRO, DOMAINE_PUBLIC } from '@/lib/domaines';

/**
 * Aiguille chaque requête vers le bon domaine.
 *
 * Deux domaines, un seul déploiement : le middleware lit l'hôte demandé et
 * décide si la page a le droit d'y être affichée. Une page professionnelle
 * appelée depuis le domaine public est renvoyée vers le domaine
 * professionnel, et inversement — l'adresse visible reste cohérente avec le
 * contenu, et une session client ne croise jamais une session commerçant.
 *
 * Sans les deux domaines configurés, le middleware ne fait rien : le site
 * continue de fonctionner sur un domaine unique, notamment sur localhost.
 */

/** Accueil de chaque domaine. */
const ACCUEIL: Record<'pro' | 'public', string> = {
  // La page d'accueil actuelle présente l'offre aux commerçants.
  pro: '/',
  // Côté public, c'est la liste des commerces qui livrent chez le visiteur.
  public: '/client',
};

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

  // Page demandée sur le mauvais domaine : on la sert depuis le bon, en
  // gardant le chemin et les paramètres.
  const url = requete.nextUrl.clone();
  url.hostname = espacePage === 'pro' ? DOMAINE_PRO : DOMAINE_PUBLIC;

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Tout sauf les ressources servies par Next et les fichiers statiques :
    // les rediriger n'apporterait rien et casserait les pages.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
