export const API_URL = 'http://192.168.0.80:3001';

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
    if (response.status === 401) onUnauthorized?.();
    throw new ApiError(data?.message || data?.error || `Erreur ${response.status}`, response.status);
  }
  return data as T;
}

export const formatEuros = (value: unknown) =>
  `${(parseFloat(String(value ?? 0)) || 0).toFixed(2)} €`;
