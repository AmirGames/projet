/**
 * La session du navigateur, sans jeton lisible dans le stockage.
 *
 * - Le jeton de renouvellement vit dans un cookie httpOnly (posé par l'API,
 *   illisible d'une page) ; il ne passe jamais par le JavaScript.
 * - Le jeton d'accès (15 minutes) ne vit qu'en mémoire, dans cet onglet.
 *
 * Une cinquantaine d'écrans lisent encore `localStorage.getItem('accessToken')`
 * (ou 'driverToken'). Plutôt que de tous les réécrire, on redirige ces deux
 * clés vers la mémoire : `localStorage` reste l'interface, mais rien du jeton
 * n'est écrit sur le disque. 'refreshToken' n'est plus jamais conservé.
 *
 * Deux conséquences à gérer ici :
 * - après un rechargement, la mémoire est vide : `sessionPrete` redemande un
 *   jeton d'accès au cookie avant d'afficher les pages ;
 * - le jeton expire au bout de 15 minutes : il est renouvelé en silence avant.
 *
 * Les appels qui posent ou lisent le cookie passent par le même site (route
 * /api/auth/… réécrite vers l'API, voir next.config.js) : un cookie posé par
 * un autre domaine ne serait ni accepté ni renvoyé.
 */

const JETONS_EN_MEMOIRE = ['accessToken', 'driverToken'];
/** Rien de secret : dit seulement qu'une session a été ouverte ici. */
const INDICE_SESSION = 'sessionOuverte';
const CANAL = 'zup-session';
const VERROU = 'zup-refresh';
/** Renouveler cette avance avant l'échéance. */
const AVANCE_MS = 60 * 1000;

export const ENTETE_TRANSPORT = { 'X-Refresh-Transport': 'cookie' } as const;

const memoire = new Map<string, string>();
let minuteur: ReturnType<typeof setTimeout> | undefined;
let demarrage: Promise<void> | null = null;
/** La session à retrouver au chargement a été refusée par le serveur. */
let perdueAuDemarrage = false;

type Stockage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let reel: Stockage | null = null;

function lireReel(cle: string): string | null {
  try {
    return reel ? reel.getItem(cle) : null;
  } catch {
    return null;
  }
}
function ecrireReel(cle: string, valeur: string | null) {
  try {
    if (!reel) return;
    if (valeur === null) reel.removeItem(cle);
    else reel.setItem(cle, valeur);
  } catch {
    // Stockage refusé : l'indice se perd, la session ne se retrouve pas au rechargement.
  }
}

function canal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}

/** L'échéance (ms) d'un jeton d'accès, lue dans sa charge — sans vérifier la signature. */
function echeance(jeton: string): number | null {
  try {
    const charge = JSON.parse(atob(jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof charge.exp === 'number' ? charge.exp * 1000 : null;
  } catch {
    return null;
  }
}

function planifier() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = undefined;
  const jeton = memoire.get('accessToken');
  const fin = jeton ? echeance(jeton) : null;
  if (!fin) return;
  minuteur = setTimeout(() => void renouveler(), Math.max(fin - Date.now() - AVANCE_MS, 5000));
}

function poser(cle: string, valeur: string) {
  memoire.set(cle, valeur);
  if (cle === 'accessToken') {
    ecrireReel(INDICE_SESSION, '1');
    planifier();
  }
}

function oublier(cle: string) {
  memoire.delete(cle);
  if (cle === 'accessToken') {
    if (minuteur) clearTimeout(minuteur);
    minuteur = undefined;
    ecrireReel(INDICE_SESSION, null);
  }
}

/** Le jeton d'accès de cet onglet, ou null. */
export function jetonAcces(): string | null {
  return memoire.get('accessToken') ?? null;
}

/**
 * Demande un jeton d'accès neuf au cookie de renouvellement (ou, une fois,
 * au jeton `ancien` d'avant la migration, pour qu'il devienne un cookie).
 *
 * Sérialisé entre les onglets : le cookie tourne à chaque renouvellement, et
 * deux onglets qui l'enverraient en même temps passeraient pour un vol.
 */
export async function renouveler(ancien?: string): Promise<{ ok: boolean; donnees?: any; statut?: number }> {
  const appel = async () => {
    for (let essai = 0; essai < 2; essai++) {
      try {
        const reponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...ENTETE_TRANSPORT },
          body: JSON.stringify(ancien ? { refreshToken: ancien } : {}),
          credentials: 'same-origin',
        });
        if (reponse.status === 409 && essai === 0) {
          // Un autre onglet renouvelle au même instant : son cookie sera prêt.
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const donnees = await reponse.json().catch(() => ({}));
        if (reponse.ok && donnees.accessToken) {
          poser('accessToken', donnees.accessToken);
          // L'espace livreur lit le même jeton sous sa propre clé.
          if (memoire.has('driverToken') || donnees.driver) poser('driverToken', donnees.accessToken);
          return { ok: true, donnees, statut: reponse.status };
        }
        return { ok: false, donnees, statut: reponse.status };
      } catch {
        return { ok: false, statut: 0 };
      }
    }
    return { ok: false, statut: 409 };
  };

  const locks = typeof navigator !== 'undefined' ? (navigator as any).locks : undefined;
  const resultat = locks?.request ? await locks.request(VERROU, appel) : await appel();

  // Refusé pour de bon : la session est finie, plus rien à retrouver au rechargement.
  if (!resultat.ok && (resultat.statut === 401 || resultat.statut === 403)) {
    oublier('accessToken');
    oublier('driverToken');
  }
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
  if (typeof window === 'undefined' || !reel) return false;
  return !!(lireReel(INDICE_SESSION) || lireReel('refreshToken') || lireReel('accessToken'));
}

function installer() {
  if (typeof window === 'undefined' || reel) return;
  let base: Storage;
  try {
    base = window.localStorage;
  } catch {
    return;
  }

  const proto = Storage.prototype;
  const original = {
    getItem: proto.getItem,
    setItem: proto.setItem,
    removeItem: proto.removeItem,
  };
  reel = {
    getItem: (c) => original.getItem.call(base, c),
    setItem: (c, v) => original.setItem.call(base, c, v),
    removeItem: (c) => original.removeItem.call(base, c),
  };

  const diffuser = (message: string) => {
    const c = canal();
    c?.postMessage(message);
    c?.close();
  };

  (proto as any).getItem = function (this: Storage, cle: string) {
    if (this === base && JETONS_EN_MEMOIRE.includes(cle)) return memoire.get(cle) ?? null;
    if (this === base && cle === 'refreshToken') return null;
    return original.getItem.call(this, cle);
  };
  (proto as any).setItem = function (this: Storage, cle: string, valeur: string) {
    if (this === base && JETONS_EN_MEMOIRE.includes(cle)) {
      const nouvelle = cle === 'accessToken' && !memoire.has('accessToken');
      poser(cle, String(valeur));
      if (nouvelle) diffuser('connexion');
      return;
    }
    // Le jeton de renouvellement est dans le cookie : on ne le garde pas.
    if (this === base && cle === 'refreshToken') return;
    original.setItem.call(this, cle, valeur);
  };
  (proto as any).removeItem = function (this: Storage, cle: string) {
    if (this === base && JETONS_EN_MEMOIRE.includes(cle)) {
      const avait = memoire.has(cle);
      oublier(cle);
      if (cle === 'accessToken' && avait) diffuser('deconnexion');
      return;
    }
    if (this === base && cle === 'refreshToken') return;
    original.removeItem.call(this, cle);
  };

  // Un autre onglet s'est connecté ou déconnecté : celui-ci suit.
  canal()?.addEventListener('message', () => window.location.reload());

  // Onglet endormi : les minuteurs y sont ralentis, le jeton a pu expirer.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const jeton = memoire.get('accessToken');
    const fin = jeton ? echeance(jeton) : null;
    if (fin && fin - Date.now() < AVANCE_MS) void renouveler();
  });

  // Retrouver la session : le cookie, ou le jeton d'avant la migration.
  if (sessionARetrouver()) {
    const ancien = lireReel('refreshToken') || undefined;
    demarrage = renouveler(ancien).then((resultat) => {
      // Migration faite, ou session morte : plus rien de tel dans le stockage.
      // Si l'API était injoignable, on garde tout pour réessayer au prochain
      // chargement.
      if (resultat.statut === 401 || resultat.statut === 403) perdueAuDemarrage = true;
      if (resultat.ok || resultat.statut === 401 || resultat.statut === 403) {
        ecrireReel('refreshToken', null);
        ecrireReel('accessToken', null);
        ecrireReel('driverToken', null);
      }
      if (!resultat.ok && resultat.statut !== 0) ecrireReel(INDICE_SESSION, null);
    });
  }
}

installer();
