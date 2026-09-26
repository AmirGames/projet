import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'zupone.customer.session';
const ADDRESS_KEY = 'zupone.customer.address';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

/**
 * L'adresse de livraison retenue : elle trie les commerces sur l'accueil et
 * pré-remplit la commande. Les coordonnées manquent quand le client l'a
 * écrite sans retenir de suggestion : le serveur la situe alors lui-même.
 */
export interface DeliveryAddress {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

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

export const loadAddress = () => read<DeliveryAddress>(ADDRESS_KEY);
export const saveAddress = (address: DeliveryAddress | null) =>
  address ? write(ADDRESS_KEY, address) : SecureStore.deleteItemAsync(ADDRESS_KEY).catch(() => undefined);
