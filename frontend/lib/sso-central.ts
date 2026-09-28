import { NextRequest, NextResponse } from 'next/server';
import { CLOISONNEMENT_ACTIF, DOMAINE_VITRINE, espaceDuDomaine } from '@/lib/domaines';

/**
 * Le côté zupone.com de la connexion unique : le cookie central et les
 * redirections qui l'accompagnent (app/sso/etablir, app/sso/verifier).
 *
 * Le cookie n'est lisible que du serveur de zupone.com (HttpOnly) : aucun
 * script, d'aucun domaine, n'y a accès. Il ne contient qu'un jeton opaque, dont
 * l'API ne garde que l'empreinte.
 */

// Côté serveur, l'API se joint directement (http://backend:3001 dans Docker).
const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** __Host- : le navigateur l'exige en HTTPS, sans domaine, sur tout le site. */
export function nomDuCookie(requete: NextRequest): string {
  return protocoleDe(requete) === 'https' ? '__Host-zupone-session' : 'zupone-session';
}

const DUREE_COOKIE_S = 30 * 24 * 60 * 60;

function hoteDe(requete: NextRequest): string {
  return requete.headers.get('x-forwarded-host') || requete.headers.get('host') || '';
}

function protocoleDe(requete: NextRequest): string {
  return requete.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'http';
}

/** Ces adresses n'existent que sur zupone.com : ailleurs, elles n'ont pas de sens. */
export function surLeDomaineCentral(requete: NextRequest): boolean {
  if (!CLOISONNEMENT_ACTIF || !DOMAINE_VITRINE) return false;
  return hoteDe(requete).split(':')[0].toLowerCase() === DOMAINE_VITRINE;
}

/**
 * Une adresse d'un domaine du site, et d'aucun autre.
 *
 * Sans ce contrôle, zupone.com servirait de relais pour envoyer un code — et
 * la session avec lui — à n'importe quelle adresse.
 */
export function adresseDuSite(brute: string | null): URL | null {
  if (!brute) return null;
  try {
    const url = new URL(brute);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return espaceDuDomaine(url.host) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Un appel à l'API, serveur à serveur. `statut` 0 : API injoignable — rien à
 * en conclure sur la session, qu'on ne touche donc pas.
 */
export async function appelerApi(
  chemin: string,
  corps: unknown,
): Promise<{ statut: number; donnees: Record<string, string> | null }> {
  try {
    const reponse = await fetch(`${API}${chemin}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      cache: 'no-store',
    });
    return { statut: reponse.status, donnees: reponse.ok ? await reponse.json() : null };
  } catch {
    return { statut: 0, donnees: null };
  }
}

/** L'accueil de zupone.com, à son adresse publique (pas celle du conteneur). */
export function racine(requete: NextRequest): URL {
  return new URL(`${protocoleDe(requete)}://${hoteDe(requete)}/`);
}

/** Une redirection qui ne se garde nulle part et ne dit rien de l'adresse quittée. */
export function rediriger(vers: string | URL): NextResponse {
  const reponse = NextResponse.redirect(vers, 303);
  reponse.headers.set('Cache-Control', 'no-store');
  reponse.headers.set('Referrer-Policy', 'no-referrer');
  return reponse;
}

export function poserCookie(reponse: NextResponse, requete: NextRequest, jeton: string) {
  reponse.cookies.set(nomDuCookie(requete), jeton, {
    httpOnly: true,
    secure: protocoleDe(requete) === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: DUREE_COOKIE_S,
  });
}

export function effacerCookie(reponse: NextResponse, requete: NextRequest) {
  reponse.cookies.set(nomDuCookie(requete), '', {
    httpOnly: true,
    secure: protocoleDe(requete) === 'https',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export const introuvable = () => new NextResponse('Introuvable', { status: 404 });
