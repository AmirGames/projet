import { API_URL } from './api';
import { loadSession, saveSession } from './session';

/**
 * Un appel au serveur hors de l'écran : notification, tâche en arrière-plan,
 * application fermée. fetch direct plutôt qu'apiFetch : un jeton périmé ne
 * doit pas déconnecter le livreur, il se renouvelle ici et la session
 * enregistrée est mise à jour.
 *
 * Renvoie null sans session enregistrée (livreur déconnecté).
 */
export async function fetchWithSession(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response | null> {
  const session = await loadSession();
  if (!session) return null;

  const call = (token: string) =>
    fetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response = await call(session.accessToken);
  if (response.status === 401 && session.refreshToken) {
    const refresh = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    const renewed = await refresh.json().catch(() => null);
    if (refresh.ok && renewed?.accessToken) {
      await saveSession({ ...session, accessToken: renewed.accessToken });
      response = await call(renewed.accessToken);
    }
  }
  return response;
}
