import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { apiFetch } from './api';

/** Le canal Android des étapes de commande (acceptée, en route, livreur proche…). */
export const ORDERS_CHANNEL = 'default';

export type PushSetup =
  | { status: 'enabled'; token: string }
  | { status: 'denied' | 'unsupported' | 'error'; reason: string };

export interface PushCustomerData {
  /** commande, livraison-accepted, livraison-picked_up, livreur-proche… */
  tag?: string;
  orderId?: string;
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

  // App ouverte : le bandeau de l'app et le suivi en direct suffisent, une
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
  await N.setNotificationChannelAsync(ORDERS_CHANNEL, {
    name: 'Mes commandes',
    description: 'Commande acceptée, en route, livreur à la porte',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
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
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app: 'customer' },
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

function dataFromResponse(response: NotificationsModule.NotificationResponse | null): PushCustomerData | null {
  const data = response?.notification.request.content.data as PushCustomerData | undefined;
  return data?.tag || data?.orderId ? data : null;
}

/**
 * Prévient quand une notification est touchée, y compris celle qui a lancé
 * l'application. Renvoie la fonction de désabonnement.
 */
export function onCustomerNotificationTap(callback: (data: PushCustomerData) => void): () => void {
  const N = notifications();
  if (!N) return () => undefined;

  const initial = dataFromResponse(N.getLastNotificationResponse());
  if (initial) {
    N.clearLastNotificationResponse();
    callback(initial);
  }

  const sub = N.addNotificationResponseReceivedListener((response) => {
    const data = dataFromResponse(response);
    if (data) callback(data);
  });
  return () => sub.remove();
}
