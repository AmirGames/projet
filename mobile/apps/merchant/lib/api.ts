export const API_URL = 'http://192.168.0.80:3001';

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
    throw new Error(data?.message || data?.error || `Erreur ${response.status}`);
  }
  return data as T;
}

export const formatEuros = (value: unknown) =>
  `${(parseFloat(String(value ?? 0)) || 0).toFixed(2)} €`;
