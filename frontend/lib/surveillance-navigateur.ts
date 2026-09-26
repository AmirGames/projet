import { quitteLaPage } from './erreurs';

/**
 * Les erreurs survenues chez les visiteurs, remontées au serveur.
 *
 * Une page qui plante dans le navigateur d'un client ne laisse aucune trace
 * côté serveur : on ne l'apprenait que s'il prenait la peine d'écrire au
 * support. Elles apparaissent désormais dans la page Surveillance.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Au-delà, une page en boucle d'erreurs se tait : dix exemples suffisent. */
const ENVOIS_MAX_PAR_PAGE = 10;

/** Du bruit connu, qui ne signale aucun défaut du site. */
const IGNOREES = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection captured/i,
  /AbortError/i,
  /Load failed/i,
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
];

const dejaEnvoyees = new Set<string>();
let envois = 0;

export function signalerAuServeur(erreur: unknown, source?: string) {
  if (typeof window === 'undefined' || quitteLaPage()) return;

  const message =
    erreur instanceof Error
      ? `${erreur.name}: ${erreur.message}`
      : typeof erreur === 'string'
        ? erreur
        : (() => {
            try {
              return JSON.stringify(erreur);
            } catch {
              return String(erreur);
            }
          })();

  if (!message || IGNOREES.some((motif) => motif.test(message))) return;
  // Les extensions du navigateur ne sont pas le site.
  if (source && /^(chrome|moz|safari)-extension:/.test(source)) return;

  const cle = `${message}|${source ?? ''}`;
  if (dejaEnvoyees.has(cle) || envois >= ENVOIS_MAX_PAR_PAGE) return;
  dejaEnvoyees.add(cle);
  envois += 1;

  try {
    fetch(`${API_URL}/monitoring/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Part même si le visiteur quitte la page juste après.
      keepalive: true,
      body: JSON.stringify({
        message: message.slice(0, 500),
        source,
        page: window.location.pathname,
        pile: erreur instanceof Error ? erreur.stack?.slice(0, 4000) : undefined,
      }),
    }).catch(() => {
      // Signaler une erreur ne doit jamais en produire une autre.
    });
  } catch {
    // Idem.
  }
}

let installee = false;

/** Écoute les erreurs non rattrapées de toute la page. Idempotent. */
export function installerSurveillanceNavigateur() {
  if (typeof window === 'undefined' || installee) return;
  installee = true;

  window.addEventListener('error', (evenement) => {
    const source = evenement.filename
      ? `${evenement.filename}:${evenement.lineno}:${evenement.colno}`
      : undefined;
    signalerAuServeur(evenement.error ?? evenement.message, source);
  });

  window.addEventListener('unhandledrejection', (evenement) => {
    signalerAuServeur(evenement.reason, 'promesse non rattrapée');
  });
}
