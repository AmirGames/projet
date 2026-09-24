import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { apiFetch } from './api';

export const NEW_ORDERS_CHANNEL = 'new-orders';

export type PushSetup =
  | { status: 'enabled'; token: string }
  | { status: 'denied' | 'unsupported' | 'error'; reason: string };

// App ouverte : la sonnerie et le bandeau de l'app suffisent, une
// notification système en plus ferait doublon.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function createAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(NEW_ORDERS_CHANNEL, {
    name: 'Nouvelles commandes',
    description: 'Sonne à chaque commande à accepter',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'new_order.wav',
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

/** Demande l'autorisation, récupère le jeton Expo et l'envoie au serveur. */
export async function registerForPush(accessToken: string): Promise<PushSetup> {
  if (!Device.isDevice) {
    return { status: 'unsupported', reason: 'Les notifications push demandent un vrai téléphone.' };
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return {
      status: 'unsupported',
      reason: "Expo Go ne reçoit plus les notifications push : utilisez une build de développement.",
    };
  }

  try {
    await createAndroidChannel();

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { status: 'denied', reason: 'Autorisez les notifications dans les réglages du téléphone.' };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return { status: 'error', reason: 'Projet EAS non configuré (lancez « eas init »).' };
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
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

export interface PushOrderData {
  orderId?: string;
  storeId?: string;
}

export function orderFromResponse(response: Notifications.NotificationResponse | null): PushOrderData | null {
  const data = response?.notification.request.content.data as PushOrderData | undefined;
  return data?.orderId ? data : null;
}
