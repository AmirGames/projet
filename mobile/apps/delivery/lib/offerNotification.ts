import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import { fetchWithSession } from './sessionFetch';

/**
 * Accepter une course depuis la notification, téléphone verrouillé.
 *
 * Sur Uber Eats, accepter une course téléphone verrouillé obligeait à
 * déverrouiller, et le capteur d'empreinte tombait sur « Refuser ». Ici la
 * notification porte un seul bouton, « Accepter », qui agit en arrière-plan :
 * ni déverrouillage, ni application à ouvrir. Refuser, c'est laisser passer.
 *
 * Android exécute l'action même application fermée (tâche en arrière-plan
 * d'expo-task-manager). iOS le fait tant que l'application tourne en fond ;
 * fermée, il faut l'ouvrir.
 */

/** Sans « - » ni « : », que les catégories iOS n'acceptent pas. Le serveur envoie le même nom. */
export const OFFER_CATEGORY = 'course_proposee';
export const ACCEPT_ACTION = 'accepter';
const TASK = 'ZUPONE_ACTION_COURSE';

let cached: typeof NotificationsModule | null | undefined;
function notifications(): typeof NotificationsModule | null {
  if (cached !== undefined) return cached;
  cached =
    isRunningInExpoGo() || Platform.OS === 'web'
      ? null
      : (require('expo-notifications') as typeof NotificationsModule);
  return cached;
}

/** Une même course n'est acceptée qu'une fois, même si l'action arrive par deux chemins. */
const handled = new Set<string>();

/** Accepte la course ; le jeton se renouvelle s'il a expiré (voir fetchWithSession). */
export async function acceptOfferFromNotification(offerId: string): Promise<{ ok: boolean; message: string; deliveryId?: string }> {
  if (handled.has(offerId)) return { ok: true, message: 'Déjà acceptée' };
  handled.add(offerId);

  try {
    const response = await fetchWithSession(`/api/drivers/offers/${offerId}/accept`, { method: 'POST' });
    if (!response) {
      handled.delete(offerId);
      return { ok: false, message: 'Connectez-vous dans l’application pour accepter les courses.' };
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      handled.delete(offerId);
      return { ok: false, message: data?.error || 'La course n’a pas pu être acceptée.' };
    }
    return { ok: true, message: 'Course acceptée', deliveryId: data?.data?.id };
  } catch {
    handled.delete(offerId);
    return { ok: false, message: 'Pas de réseau : la course n’a pas pu être acceptée.' };
  }
}

/** Le résultat, en notification : le livreur le lit sur l'écran verrouillé. */
async function announce(result: { ok: boolean; message: string; deliveryId?: string }) {
  const N = notifications();
  if (!N) return;
  await N.scheduleNotificationAsync({
    content: result.ok
      ? {
          title: '✅ Course acceptée',
          body: 'Rendez-vous au commerce. Ouvrez l’application pour l’itinéraire.',
          data: { tag: 'course-acceptee', deliveryId: result.deliveryId },
        }
      : { title: 'Course non acceptée', body: result.message, data: { tag: 'course-refusee' } },
    trigger: null,
  }).catch(() => undefined);
}

/** Traite l'appui sur « Accepter » ; renvoie vrai si c'était bien cette action. */
export async function handleOfferAction(response: NotificationsModule.NotificationResponse | null | undefined) {
  if (!response || response.actionIdentifier !== ACCEPT_ACTION) return false;
  const data = response.notification.request.content.data as { offerId?: string } | undefined;
  if (!data?.offerId) return false;

  const N = notifications();
  N?.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
  await announce(await acceptOfferFromNotification(data.offerId));
  return true;
}

/** La catégorie « course proposée » : un seul bouton, qui agit sans ouvrir l'application. */
export async function registerOfferCategory() {
  const N = notifications();
  if (!N) return;
  await N.setNotificationCategoryAsync(OFFER_CATEGORY, [
    {
      identifier: ACCEPT_ACTION,
      buttonTitle: '✅ Accepter la course',
      options: { opensAppToForeground: false, isAuthenticationRequired: false },
    },
  ]).catch(() => undefined);
}

// La tâche est définie au chargement du module : Android relance le code de
// l'application en arrière-plan pour exécuter l'action, application fermée.
(() => {
  const N = notifications();
  if (!N || Platform.OS !== 'android') return;
  try {
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');
    TaskManager.defineTask(TASK, async ({ data }) => {
      const payload = data as NotificationsModule.NotificationTaskPayload;
      if (payload && 'actionIdentifier' in payload) await handleOfferAction(payload);
    });
    N.registerTaskAsync(TASK).catch(() => undefined);
  } catch (e) {
    // Application compilée sans expo-task-manager : l'action marche seulement
    // application ouverte ou en fond.
    console.warn('Tâche de notification indisponible : recompilez l’application', e);
  }
})();
