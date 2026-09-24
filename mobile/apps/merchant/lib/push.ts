import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { apiFetch } from './api';

export const NEW_ORDERS_CHANNEL = 'new-orders';

export type PushSetup =
  | { status: 'enabled'; token: string }
  | { status: 'denied' | 'unsupported' | 'error'; reason: string };

export interface PushOrderData {
  orderId?: string;
  storeId?: string;
}

// Sur Android, le simple import d'expo-notifications lève une erreur dans
// Expo Go depuis le SDK 53 : le module n'est chargé que hors Expo Go.
let cached: typeof NotificationsModule | null | undefined;
function notifications(): typeof NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isRunningInExpoGo()) {
    cached = null;
    return cached;
  }
  cached = require('expo-notifications') as typeof NotificationsModule;

  // App ouverte : la sonnerie et le bandeau de l'app suffisent, une
  // notification système en plus ferait doublon.
  cached.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  return cached;
}

async function createAndroidChannel(N: typeof NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync(NEW_ORDERS_CHANNEL, {
    name: 'Nouvelles commandes',
    description: 'Sonne à chaque commande à accepter',
    importance: N.AndroidImportance.MAX,
    sound: 'new_order.wav',
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Demande l'autorisation, récupère le jeton Expo et l'envoie au serveur. */
export async function registerForPush(accessToken: string): Promise<PushSetup> {
  const N = notifications();
  if (!N) {
    return {
      status: 'unsupported',
      reason: "Expo Go ne reçoit pas les notifications push : utilisez une build de développement.",
    };
  }
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Les notifications push demandent un vrai téléphone.' };
  }

  try {
    await createAndroidChannel(N);

    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await N.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { status: 'denied', reason: 'Autorisez les notifications dans les réglages du téléphone.' };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return { status: 'error', reason: 'Projet EAS non configuré (lancez « eas init »).' };
    }

    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    await apiFetch('/api/push-devices', accessToken, {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app: 'merchant' },
    });
    return { status: 'enabled', token };
  } catch (e: any) {
    console.warn('Enregistrement push impossible', e);
    return { status: 'error', reason: e?.message || 'Enregistrement impossible' };
  }
}

/** À la déconnexion : ce téléphone ne doit plus recevoir les commandes du compte. */
export async function unregisterPush(accessToken: string, token: string) {
  try {
    await apiFetch('/api/push-devices', accessToken, { method: 'DELETE', body: { token } });
  } catch {
    // Le serveur retirera de lui-même un jeton qui n'est plus valable.
  }
}

function orderFromResponse(response: NotificationsModule.NotificationResponse | null): PushOrderData | null {
  const data = response?.notification.request.content.data as PushOrderData | undefined;
  return data?.orderId ? data : null;
}

/**
 * Prévient quand une notification de commande est touchée, y compris celle
 * qui a lancé l'application. Renvoie la fonction de désabonnement.
 */
export function onOrderNotificationTap(callback: (order: PushOrderData) => void): () => void {
  const N = notifications();
  if (!N) return () => undefined;

  const initial = orderFromResponse(N.getLastNotificationResponse());
  if (initial) {
    N.clearLastNotificationResponse();
    callback(initial);
  }

  const sub = N.addNotificationResponseReceivedListener((response) => {
    const order = orderFromResponse(response);
    if (order) callback(order);
  });
  return () => sub.remove();
}
