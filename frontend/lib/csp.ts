/**
 * Content-Security-Policy du site, avec un nonce par requête.
 *
 * Générée dans proxy.ts : Next.js lit le nonce dans l'en-tête de la requête et
 * le pose sur ses propres scripts (voir node_modules/next/dist/docs/01-app/
 * 02-guides/content-security-policy.md). Toutes les pages sont rendues à la
 * demande (la mise en page racine lit cookies() et headers()), ce qu'exige un
 * nonce ; PPR n'est pas activé.
 *
 * Trois modes (variables serveur `CSP_MODE` et `CSP_MODE_ZUPDRIVE`, jamais NEXT_PUBLIC) :
 * - `enforce` : la politique complète est appliquée ;
 * - `report-only` (défaut en développement) : la politique est évaluée mais
 *   rien n'est bloqué ; les violations sont envoyées à /api/csp-report ;
 * - `off` : aucun en-tête CSP dynamique (retour arrière immédiat).
 * En observation de production, des directives fixes restent appliquées.
 *
 * Origines autorisées, et pourquoi :
 * - Stripe : js.stripe.com (script, cadre), hooks.stripe.com (3-D Secure),
 *   api.stripe.com / m.stripe.network / r.stripe.com (appels de Stripe.js) ;
 * - cartes Leaflet : tuiles tile.openstreetmap.org (img-src) ;
 * - Cloudinary : res.cloudinary.com (images des commerces) ;
 * - API et temps réel : l'origine de NEXT_PUBLIC_API_URL, en HTTP et en
 *   WebSocket (Socket.IO) ;
 * - assistant : /api/assistant, même origine — rien à ajouter.
 * `'strict-dynamic'` laisse un script autorisé par nonce en charger d'autres
 * (Stripe.js charge ses propres modules) ; les origines listées ne servent que
 * de repli aux navigateurs qui l'ignorent.
 *
 * style-src garde 'unsafe-inline' : React pose des attributs `style` et
 * Leaflet positionne ses éléments ainsi, ce qu'un nonce ne peut pas couvrir.
 * Le risque est faible comparé aux scripts ; à resserrer plus tard.
 */

export type ModeCsp = 'report-only' | 'enforce' | 'off';

export const ENTETE_CSP: Record<Exclude<ModeCsp, 'off'>, string> = {
  'report-only': 'Content-Security-Policy-Report-Only',
  enforce: 'Content-Security-Policy',
};

/** Où le navigateur envoie les violations (route Next.js, voir app/api/csp-report). */
export const ADRESSE_RAPPORTS_CSP = '/api/csp-report';

export function modeCsp(
  valeur: string | undefined,
  defautProduction: Exclude<ModeCsp, 'off'> = 'report-only',
): ModeCsp {
  const defaut = process.env.NODE_ENV === 'production' ? defautProduction : 'report-only';
  const mode = (valeur || defaut).trim().toLowerCase() || defaut;
  // En production, la politique complète est appliquée sur les hôtes choisis. `off` ne
  // doit jamais retirer cette protection, même si une variable est mal réglée.
  if (mode === 'off' && process.env.NODE_ENV === 'production') return 'enforce';
  if (mode && !['report-only', 'enforce', 'off'].includes(mode) && process.env.NODE_ENV === 'production') {
    throw new Error('CSP_MODE doit valoir report-only, enforce ou off');
  }
  return mode === 'enforce' || mode === 'off' ? mode : 'report-only';
}

/**
 * Le frontend sert plusieurs marques. ZupDrive peut activer son CSP complet
 * par défaut sans basculer les autres produits avant leurs propres validations.
 */
export function modeCspPourHote(
  hote: string,
  domainesZupDrive: readonly string[],
  modeGlobal: string | undefined,
  modeZupDrive: string | undefined,
): ModeCsp {
  const nomHote = hote.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  const estZupDrive = domainesZupDrive.some((domaine) => domaine && domaine.toLowerCase() === nomHote);
  return estZupDrive ? modeCsp(modeZupDrive, 'enforce') : modeCsp(modeGlobal, 'report-only');
}

/** Un nonce imprévisible, différent à chaque requête (Web Crypto : sans Node). */
export function genererNonce(): string {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  let binaire = '';
  for (const octet of octets) binaire += String.fromCharCode(octet);
  return btoa(binaire);
}

/** L'origine d'une adresse, ou null si elle n'en est pas une. */
function origine(adresse: string): URL | null {
  try {
    return new URL(adresse);
  } catch {
    return null;
  }
}

export function construireCsp({
  nonce,
  dev = false,
  urlApi = 'http://localhost:3001',
}: {
  nonce: string;
  dev?: boolean;
  urlApi?: string;
}): string {
  const api = origine(urlApi);
  const origineApi = api?.origin;
  const origineWs = api ? `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}` : undefined;

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      'https://js.stripe.com',
      // React reconstruit les piles d'erreurs avec eval en développement seulement.
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://res.cloudinary.com',
      'https://tile.openstreetmap.org',
      'https://*.tile.openstreetmap.org',
      'https://*.stripe.com',
      ...(origineApi ? [origineApi] : []),
    ],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      ...(origineApi ? [origineApi] : []),
      ...(origineWs ? [origineWs] : []),
      'https://api.stripe.com',
      'https://*.stripe.com',
      'https://m.stripe.network',
      'https://*.stripe.network',
      'https://r.stripe.com',
    ],
    // blob: pour l'aperçu PDF des pièces justificatives.
    'frame-src': ["'self'", 'blob:', 'https://js.stripe.com', 'https://hooks.stripe.com', 'https://*.stripe.com', 'https://m.stripe.network', 'https://*.stripe.network'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'blob:', ...(origineApi ? [origineApi] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
    'report-uri': [ADRESSE_RAPPORTS_CSP],
  };

  return Object.entries(directives)
    .map(([nom, sources]) => `${nom} ${sources.join(' ')}`)
    .join('; ');
}
