/**
 * La session du navigateur — l'unique endroit qui touche au jeton d'accès.
 *
 * - Le jeton de renouvellement vit dans un cookie httpOnly (posé par l'API,
 *   illisible d'une page) ; il ne passe jamais par le JavaScript.
 * - Le jeton d'accès (15 minutes) ne vit qu'en mémoire, dans cet onglet. Un
 *   XSS ne trouve donc rien à voler dans `localStorage`.
 *
 * Les écrans passent par `jetonAcces()`, `poserJeton()` et `oublierJeton()` :
 * aucun ne lit ou n'écrit `accessToken` / `driverToken` dans le stockage.
 * L'espace livreur lisait le même jeton sous une seconde clé : il n'y en a plus
 * qu'un.
 *
 * Deux conséquences à gérer ici :
 * - après un rechargement, la mémoire est vide : `sessionPrete` redemande un
 *   jeton d'accès au cookie (POST /api/auth/refresh) avant d'afficher les pages ;
 * - le jeton expire au bout de 15 minutes : il est renouvelé en silence avant.
 *
 * Les appels qui posent ou lisent le cookie passent par le même site (route
 * /api/auth/… réécrite vers l'API, voir next.config.js) : un cookie posé par
 * un autre domaine ne serait ni accepté ni renvoyé.
 *
 * Les applications mobiles ne passent pas par ici : elles gardent leur jeton de
 * renouvellement dans SecureStore et l'envoient dans le corps (contrat de l'API
 * inchangé).
 */

/** Anciennes clés où des versions précédentes écrivaient les jetons : purgées au chargement. */
const CLES_JETON_OBSOLETES = ['accessToken', 'driverToken', 'refreshToken', 'token'];
/** Rien de secret : dit seulement qu'une session a été ouverte ici. */
const INDICE_SESSION = 'sessionOuverte';
const CANAL = 'zup-session';
const VERROU = 'zup-refresh';
/** Renouveler cette avance avant l'échéance. */
const AVANCE_MS = 60 * 1000;
const DELAI_REPRISE_MS = 1000;

export const ENTETE_TRANSPORT = { 'X-Refresh-Transport': 'cookie' } as const;

/** Le seul endroit où le jeton d'accès existe côté navigateur. */
let jeton: string | null = null;
let minuteur: ReturnType<typeof setTimeout> | undefined;
let demarrage: Promise<void> | null = null;
/** La session à retrouver au chargement a été refusée par le serveur. */
let perdueAuDemarrage = false;

function stockage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function lireIndice(): boolean {
  try {
    return !!stockage()?.getItem(INDICE_SESSION);
  } catch {
    return false;
  }
}

function ecrireIndice(present: boolean) {
  try {
    if (present) stockage()?.setItem(INDICE_SESSION, '1');
    else stockage()?.removeItem(INDICE_SESSION);
  } catch {
    // Stockage refusé : la session ne se retrouve pas au rechargement.
  }
}

function canal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}

function diffuser(message: string) {
  const c = canal();
  c?.postMessage(message);
  c?.close();
}

/** L'échéance (ms) d'un jeton d'accès, lue dans sa charge — sans vérifier la signature. */
function echeance(valeur: string): number | null {
  try {
    const charge = JSON.parse(atob(valeur.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof charge.exp === 'number' ? charge.exp * 1000 : null;
  } catch {
    return null;
  }
}

function planifier() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = undefined;
  const fin = jeton ? echeance(jeton) : null;
  if (!fin) return;
  minuteur = setTimeout(() => void renouveler(), Math.max(fin - Date.now() - AVANCE_MS, 5000));
}

const abonnes = new Set<() => void>();
function notifier() {
  abonnes.forEach((a) => a());
}

/** Pour `useSyncExternalStore` : prévient quand le jeton de cet onglet change. */
export function abonnerJeton(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

/** Le jeton d'accès de cet onglet, ou null. Sûr côté serveur (null). */
export function jetonAcces(): string | null {
  return jeton;
}

/**
 * Adopte un jeton d'accès reçu de l'API (connexion, inscription, renouvellement).
 * Les autres onglets sont prévenus à la première connexion.
 */
export function poserJeton(valeur: string | null | undefined, prevenir = true): void {
  if (!valeur) return;
  const nouvelle = jeton === null && prevenir;
  jeton = valeur;
  ecrireIndice(true);
  planifier();
  notifier();
  if (nouvelle) diffuser('connexion');
}

/**
 * Oublie le jeton d'accès de cet onglet et prévient les autres.
 * `prevenir: false` : fermeture déjà annoncée (refus du serveur).
 */
export function oublierJeton(prevenir = true): void {
  const avait = jeton !== null;
  jeton = null;
  if (minuteur) clearTimeout(minuteur);
  minuteur = undefined;
  ecrireIndice(false);
  notifier();
  if (avait && prevenir) diffuser('deconnexion');
}

/**
 * Demande un jeton d'accès neuf au cookie de renouvellement (ou, pour une
 * inscription, au jeton `ancien` reçu dans le corps de la réponse, afin qu'il
 * devienne un cookie).
 *
 * Sérialisé entre les onglets : le cookie tourne à chaque renouvellement, et
 * deux onglets qui l'enverraient en même temps passeraient pour un vol.
 */
export async function renouveler(ancien?: string): Promise<{ ok: boolean; donnees?: any; statut?: number }> {
  const demandeAleatoire = new Uint8Array(32);
  crypto.getRandomValues(demandeAleatoire);
  const requestId = Array.from(demandeAleatoire, (octet) => octet.toString(16).padStart(2, '0')).join('');
  const appel = async () => {
    for (let essai = 0; essai < 2; essai++) {
      try {
        const reponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...ENTETE_TRANSPORT, 'X-Refresh-Request': requestId },
          body: JSON.stringify(ancien ? { refreshToken: ancien, requestId } : { requestId }),
          credentials: 'same-origin',
        });
        if (reponse.status === 409 && essai === 0) {
          await new Promise((r) => setTimeout(r, DELAI_REPRISE_MS));
          continue;
        }
        const donnees = await reponse.json().catch(() => ({}));
        if (reponse.ok && donnees.accessToken) {
          // Restauration ou renouvellement : les autres onglets n'ont rien à suivre.
          poserJeton(donnees.accessToken, false);
          return { ok: true, donnees, statut: reponse.status };
        }
        return { ok: false, donnees, statut: reponse.status };
      } catch {
        if (essai === 0) {
          // Le serveur a pu committer avant la perte de réponse : réutiliser
          // exactement la même preuve permet de récupérer son successeur.
          await new Promise((r) => setTimeout(r, DELAI_REPRISE_MS));
          continue;
        }
        return { ok: false, statut: 0 };
      }
    }
    return { ok: false, statut: 409 };
  };

  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
  const resultat = locks?.request ? await locks.request(VERROU, appel) : await appel();

  // Refusé pour de bon : la session est finie, plus rien à retrouver au rechargement.
  if (!resultat.ok && (resultat.statut === 401 || resultat.statut === 403)) oublierJeton(false);
  return resultat;
}

/** Ferme la session côté serveur pour ce navigateur : efface le cookie. */
export async function effacerCookieSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'same-origin',
      keepalive: true,
    });
  } catch {
    // Hors ligne : le cookie expirera, et la session serveur est déjà fermée.
  }
}

/**
 * Adopte un jeton de renouvellement reçu dans un corps de réponse (inscription
 * commerçant ou livreur) : il devient un cookie, et n'est pas conservé.
 */
export async function adopterRefresh(refreshToken: string | undefined): Promise<void> {
  if (refreshToken) await renouveler(refreshToken);
}

/**
 * Résolue quand la session de cet onglet est prête : rien à retrouver, ou un
 * jeton d'accès redemandé au cookie. Les pages qui lisent le jeton à
 * l'affichage doivent attendre cette promesse.
 */
export function sessionPrete(): Promise<void> {
  return demarrage ?? Promise.resolve();
}

/**
 * La session qu'on attendait au chargement a-t-elle été refusée (401 ou 403) ?
 *
 * Une base remise à zéro ou un compte supprimé pendant l'absence : le cookie
 * ne vaut plus rien. Sans ce signal, la session était effacée en silence et la
 * page renvoyait vers une connexion vide, sans dire pourquoi. À lire une fois
 * `sessionPrete()` résolue.
 */
export function sessionPerdueAuDemarrage(): boolean {
  return perdueAuDemarrage;
}

/** Une session est-elle à retrouver ? (donc les pages doivent attendre) */
export function sessionARetrouver(): boolean {
  if (typeof window === 'undefined') return false;
  return lireIndice() && jeton === null;
}

function demarrer() {
  if (typeof window === 'undefined' || demarrage !== null) return;

  // Les versions précédentes écrivaient les jetons dans le stockage : on les
  // supprime sans les lire ni les migrer (l'utilisateur se reconnecte, ou le
  // cookie httpOnly suffit).
  const base = stockage();
  for (const cle of CLES_JETON_OBSOLETES) {
    try {
      base?.removeItem(cle);
    } catch {
      // Stockage refusé : rien à purger.
    }
  }

  // Un autre onglet s'est connecté ou déconnecté : celui-ci suit.
  canal()?.addEventListener('message', () => window.location.reload());

  // Onglet endormi : les minuteurs y sont ralentis, le jeton a pu expirer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const fin = jeton ? echeance(jeton) : null;
    if (fin && fin - Date.now() < AVANCE_MS) void renouveler();
  });

  demarrage = Promise.resolve();
  // Retrouver la session : le cookie httpOnly donne un jeton d'accès neuf.
  if (lireIndice()) {
    demarrage = renouveler().then((resultat) => {
      if (resultat.statut === 401 || resultat.statut === 403) perdueAuDemarrage = true;
      // API injoignable (statut 0) : on garde l'indice pour réessayer au prochain chargement.
      if (!resultat.ok && resultat.statut !== 0) ecrireIndice(false);
    });
  }
}

demarrer();
