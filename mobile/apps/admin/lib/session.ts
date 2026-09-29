import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'zupone.admin.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
  userId: string;
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session) {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('Impossible d’enregistrer sur le téléphone', e);
  }
}

export const clearSession = () => SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
