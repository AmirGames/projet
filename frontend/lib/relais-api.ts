import { NextRequest, NextResponse } from 'next/server';

/**
 * Relaie /api/auth/… et /api/sso/… du site vers l'API.
 *
 * Le cookie de renouvellement (httpOnly) doit être posé et renvoyé par le
 * domaine que l'utilisateur visite, pas par celui de l'API : les navigateurs
 * refusent les cookies de domaine tiers. Ces appels passent donc par le site,
 * qui les transmet — cookies, en-tête Origin (contrôle CSRF de l'API) et
 * Set-Cookie compris.
 *
 * Pas un simple `rewrites` : l'API limite la cadence par adresse IP, et un
 * relais générique lui ferait voir l'adresse du serveur du site pour tout le
 * monde. L'adresse du visiteur est donc rétablie ici, dans X-Forwarded-For.
 */
const API_INTERNE = () =>
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const TRANSMIS = [
  'content-type',
  'authorization',
  'cookie',
  'origin',
  'referer',
  'user-agent',
  'accept-language',
  'x-refresh-transport',
];

/** L'adresse du visiteur : la dernière que le proxy de tête (Caddy) a ajoutée. */
function adresseDuVisiteur(requete: NextRequest): string | undefined {
  const chaine = requete.headers.get('x-forwarded-for');
  if (!chaine) return undefined;
  const adresses = chaine.split(',').map((a) => a.trim()).filter(Boolean);
  return adresses[adresses.length - 1];
}

export async function relayer(requete: NextRequest, section: 'auth' | 'sso', chemin: string[]) {
  const url = `${API_INTERNE().replace(/\/$/, '')}/api/${section}/${chemin.map(encodeURIComponent).join('/')}${requete.nextUrl.search}`;

  const entetes = new Headers();
  for (const nom of TRANSMIS) {
    const valeur = requete.headers.get(nom);
    if (valeur) entetes.set(nom, valeur);
  }
  const visiteur = adresseDuVisiteur(requete);
  if (visiteur) entetes.set('x-forwarded-for', visiteur);

  const corps = ['GET', 'HEAD'].includes(requete.method) ? undefined : await requete.arrayBuffer();

  let reponse: Response;
  try {
    reponse = await fetch(url, { method: requete.method, headers: entetes, body: corps, redirect: 'manual' });
  } catch {
    return NextResponse.json({ error: 'Serveur injoignable', code: 'API_INJOIGNABLE' }, { status: 502 });
  }

  const sortie = new NextResponse(reponse.body, { status: reponse.status });
  const type = reponse.headers.get('content-type');
  if (type) sortie.headers.set('content-type', type);
  for (const cookie of reponse.headers.getSetCookie()) sortie.headers.append('set-cookie', cookie);
  sortie.headers.set('cache-control', 'no-store');
  return sortie;
}
