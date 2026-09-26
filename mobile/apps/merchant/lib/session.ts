import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'zupone.merchant.session';
const PREFS_KEY = 'zupone.merchant.prefs';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
  orgId: string;
}

export interface Prefs {
  storeId?: string;
  preparationMinutes: number;
  soundEnabled: boolean;
}

export const DEFAULT_PREFS: Prefs = { preparationMinutes: 30, soundEnabled: true };

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown) {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Impossible d’enregistrer sur le téléphone', e);
  }
}

export const loadSession = () => read<Session>(SESSION_KEY);
export const saveSession = (session: Session) => write(SESSION_KEY, session);
export const clearSession = () => SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);

export async function loadPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...(await read<Partial<Prefs>>(PREFS_KEY)) };
}
export const savePrefs = (prefs: Prefs) => write(PREFS_KEY, prefs);
