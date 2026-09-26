// Configuration de l'URL API selon l'environnement
// En production : utiliser le domaine de production
// En développement : utiliser localhost ou l'IP locale
const getApiUrl = (): string => {
  // Si une variable d'environnement est définie, l'utiliser
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Sinon, utiliser localhost par défaut pour le développement
  // Les développeurs peuvent ajouter EXPO_PUBLIC_API_URL=http://192.168.0.80:3001 dans .env.local
  return 'http://localhost:3001';
};

export const API_URL = getApiUrl();

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;

/** Appelé quand le serveur refuse le jeton : la session est à refaire. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export async function apiFetch<T = any>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // MISSING_ORG est un 401 du serveur pour une requête incomplète, pas une
    // session expirée : il ne doit pas déconnecter.
    if (response.status === 401 && data?.code !== 'MISSING_ORG') onUnauthorized?.();
    throw new ApiError(data?.error || data?.message || `Erreur ${response.status}`, response.status);
  }
  return data as T;
}

const euros = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatEuros = (value: unknown) => `${euros.format(parseFloat(String(value ?? 0)) || 0)} €`;
