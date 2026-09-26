import Constants from 'expo-constants';

/**
 * L'adresse du serveur.
 *
 * `localhost` désigne le téléphone lui-même, pas le PC : « Failed to connect
 * to localhost/127.0.0.1:3001 ». Dans l'ordre :
 *   1. EXPO_PUBLIC_API_URL, si elle est définie (production, autre machine) ;
 *   2. en développement, le PC qui sert l'application (Metro) : le serveur
 *      tourne sur la même machine, port 3001. Rien à changer d'un réseau Wi-Fi
 *      à l'autre ;
 *   3. localhost, pour le navigateur ou un `adb reverse tcp:3001 tcp:3001`.
 */
function detectApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') return `http://${devHost}:3001`;
  return 'http://localhost:3001';
}

export const API_URL = detectApiUrl();

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Appelé quand le serveur refuse le jeton : la session est à refaire. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/**
 * Appel au serveur. Sans jeton, l'appel part anonyme : la liste des commerces,
 * les vitrines et la création d'une commande sont publiques.
 */
export async function apiFetch<T = any>(
  path: string,
  token: string | null,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // MISSING_ORG est un 401 du serveur pour une requête incomplète, pas une
    // session expirée : il ne doit pas déconnecter.
    if (token && response.status === 401 && data?.code !== 'MISSING_ORG') onUnauthorized?.();
    throw new ApiError(data?.error || data?.message || `Erreur ${response.status}`, response.status, data?.code);
  }
  return data as T;
}

const euros = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatEuros = (value: unknown) => `${euros.format(parseFloat(String(value ?? 0)) || 0)} €`;

/** Les images déposées sur le serveur arrivent en chemin relatif (« /uploads/… »). */
export function mediaUrl(url?: string | null) {
  if (!url) return null;
  if (/^(https?:|data:|file:)/.test(url)) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}
