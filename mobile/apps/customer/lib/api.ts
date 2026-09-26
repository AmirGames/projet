export const API_URL = 'http://localhost:3001';

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
