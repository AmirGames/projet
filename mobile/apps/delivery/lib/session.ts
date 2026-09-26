import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'zupone.delivery.session';
const PREFS_KEY = 'zupone.delivery.prefs';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export interface Prefs {
  soundEnabled: boolean;
  /**
   * Ce que fait « Itinéraire » : la carte de l'application (par défaut), ou
   * une application de navigation extérieure.
   */
  navigationApp: 'zupone' | 'google' | 'waze' | 'apple';
  /**
   * Sombre par défaut : il économise la batterie des écrans OLED. « system »
   * suit le mode clair ou sombre réglé sur le téléphone.
   */
  theme: 'dark' | 'light' | 'system';
}

export const DEFAULT_PREFS: Prefs = { soundEnabled: true, navigationApp: 'zupone', theme: 'dark' };

/** Version des préférences : la 2 a amené la carte intégrée. */
const PREFS_VERSION = 2;

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
  const stored = await read<Partial<Prefs> & { v?: number }>(PREFS_KEY);
  const { v, ...rest } = stored || {};
  const prefs: Prefs = { ...DEFAULT_PREFS, ...rest };
  // Avant la carte intégrée, Google Maps était le choix par défaut, pas celui
  // du livreur : la carte de l'application prend sa place.
  if ((v ?? 1) < PREFS_VERSION) prefs.navigationApp = 'zupone';
  return prefs;
}
export const savePrefs = (prefs: Prefs) => write(PREFS_KEY, { ...prefs, v: PREFS_VERSION });
