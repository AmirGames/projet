import { API_URL, netFetch } from './api';
import { loadSession, saveSession } from './session';

/**
 * Un appel au serveur hors de l'écran : notification, tâche en arrière-plan,
 * envois différés, application fermée. Le jeton vient de la session
 * enregistrée, pas de l'écran : un jeton périmé ne doit pas déconnecter le
 * livreur, il se renouvelle ici et la session enregistrée est mise à jour.
 *
 * call reçoit le jeton et renvoie la réponse (fetch, envoi de fichier…) ;
 * rappelé une fois avec le nouveau jeton sur un 401. Renvoie null sans
 * session enregistrée (livreur déconnecté).
 */
export async function withSession<R extends { status: number }>(call: (token: string) => Promise<R>): Promise<R | null> {
  const session = await loadSession();
  if (!session) return null;

  let response = await call(session.accessToken);
  if (response.status === 401 && session.refreshToken) {
    const refresh = await netFetch(`${API_URL}/api/auth/refresh`, {
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

/** Un appel JSON avec la session enregistrée (voir withSession). */
export function fetchWithSession(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response | null> {
  return withSession((token) =>
    netFetch(`${API_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  );
}
