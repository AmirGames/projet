import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { apiFetch } from './api';

/** Même nom que celui envoyé par le serveur pour une course proposée. */
export const NEW_COURSES_CHANNEL = 'new-courses';

export type PushSetup =
  | { status: 'enabled'; token: string }
  | { status: 'denied' | 'unsupported' | 'error'; reason: string };

export interface PushDriverData {
  /** course-proposee, pause, gps, support… */
  tag?: string;
  deliveryId?: string;
  url?: string;
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
  await N.setNotificationChannelAsync(NEW_COURSES_CHANNEL, {
    name: 'Courses proposées',
    description: 'Sonne à chaque course à accepter',
    importance: N.AndroidImportance.MAX,
    sound: 'new_course.wav',
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
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app: 'delivery' },
    });
    return { status: 'enabled', token };
  } catch (e: any) {
    console.warn('Enregistrement push impossible', e);
    return { status: 'error', reason: e?.message || 'Enregistrement impossible' };
  }
}

/** À la déconnexion : ce téléphone ne doit plus recevoir les courses du compte. */
export async function unregisterPush(accessToken: string, token: string) {
  try {
    await apiFetch('/api/push-devices', accessToken, { method: 'DELETE', body: { token } });
  } catch {
    // Le serveur retirera de lui-même un jeton qui n'est plus valable.
  }
}

function dataFromResponse(response: NotificationsModule.NotificationResponse | null): PushDriverData | null {
  const data = response?.notification.request.content.data as PushDriverData | undefined;
  return data?.tag || data?.deliveryId ? data : null;
}

/**
 * Prévient quand une notification est touchée, y compris celle qui a lancé
 * l'application. Renvoie la fonction de désabonnement.
 */
export function onDriverNotificationTap(callback: (data: PushDriverData) => void): () => void {
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
