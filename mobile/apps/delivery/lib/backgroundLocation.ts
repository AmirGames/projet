import { Alert, Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import * as Location from 'expo-location';
import { fetchWithSession } from './sessionFetch';
import { flushOutbox } from './outbox';

/**
 * La position du livreur, téléphone verrouillé ou application en fond.
 *
 * Suivie seulement au premier plan, la position s'arrêtait dès que le livreur
 * rangeait son téléphone : le client voyait la pastille figée, et au bout de
 * deux minutes le serveur croyait le GPS perdu et ne lui proposait plus rien,
 * alors même que la course proposée sait sonner téléphone verrouillé.
 *
 * Le système appelle ici la tâche à chaque nouvelle position, que
 * l'application soit à l'écran, en fond, ou (Android) fermée : c'est alors
 * la seule source de position. Au premier plan, l'écran l'écoute aussi
 * (subscribe) pour la carte et l'approche de l'étape.
 *
 * Android affiche une notification tant que la position est suivie : c'est
 * la règle du système pour tout service au premier plan, et elle rappelle au
 * livreur qu'il est en ligne.
 */

export const LOCATION_TASK = 'ZUPONE_POSITION_LIVREUR';

export interface Position {
  lat: number;
  lng: number;
  /** Précision annoncée par le téléphone, en mètres. */
  accuracy: number | null;
  at: number;
}

export type BackgroundProfile = 'idle' | 'route' | 'near';

/**
 * Hors de l'écran, pas de minuteur pour relancer un livreur immobile : c'est
 * le système qui doit rendre la main. distanceInterval à 0 pour qu'une
 * position arrive même à l'arrêt (Android : à chaque timeInterval ; iOS : au
 * gré du GPS), et c'est l'envoi, pas la mesure, qui est espacé ici.
 */
const TASK_OPTIONS: Record<BackgroundProfile, { accuracy: Location.Accuracy; timeInterval: number; sendEveryMs: number }> = {
  idle: { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, sendEveryMs: 60_000 },
  route: { accuracy: Location.Accuracy.High, timeInterval: 10_000, sendEveryMs: 12_000 },
  near: { accuracy: Location.Accuracy.High, timeInterval: 4_000, sendEveryMs: 12_000 },
};

const SERVICE_TEXT: Record<BackgroundProfile, string> = {
  idle: 'En ligne : les courses proches vous sont proposées.',
  route: 'Course en cours : le client suit votre position.',
  near: 'Course en cours : le client suit votre position.',
};

// État partagé entre l'écran et la tâche. Application relancée par le
// système pour la tâche seule, il repart vide : les valeurs par défaut
// suffisent (envoi toutes les 12 s).
let sendEveryMs = TASK_OPTIONS.route.sendEveryMs;
let lastSent = 0;
let sending = false;
const listeners = new Set<(p: Position) => void>();

/** Au premier plan, l'écran reçoit chaque position ; renvoie de quoi se désabonner. */
export function subscribePositions(listener: (p: Position) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Envoie la position au serveur, au plus une fois par intervalle du profil en
 * cours (force : sans attendre, pour le battement de cœur au premier plan).
 */
export async function sendPosition(p: Position, force = false) {
  if (sending) return;
  if (!force && Date.now() - lastSent < sendEveryMs) return;
  lastSent = Date.now();
  sending = true;
  try {
    const response = await fetchWithSession('/api/drivers/location', {
      method: 'PATCH',
      body: { latitude: p.lat, longitude: p.lng },
    });
    // Livreur déconnecté entre-temps, ou compte qui n'est plus livreur :
    // plus personne à qui envoyer la position.
    if (!response || response.status === 401 || response.status === 403 || response.status === 404) {
      await stopBackgroundLocation();
    } else if (!response.ok) {
      lastSent = 0;
    } else {
      // Le serveur répond : les étapes faites sans réseau partent, même
      // téléphone rangé (la file se lit une fois, puis reste en mémoire).
      flushOutbox();
      // Passé hors ligne ailleurs (site, mise hors ligne automatique), sans
      // course : la position n'a plus à partir.
      const data = await response.json().catch(() => null);
      if (data?.enLigne === false && data?.suivie === false) await stopBackgroundLocation();
    }
  } catch {
    // Hors réseau : la position repartira à la suivante.
    lastSent = 0;
  } finally {
    sending = false;
  }
}

let taskManager: typeof import('expo-task-manager') | null | undefined;
function tasks() {
  if (taskManager !== undefined) return taskManager;
  // Expo Go ne suit pas la position en arrière-plan : l'écran se contente du
  // suivi au premier plan.
  if (isRunningInExpoGo() || Platform.OS === 'web') return (taskManager = null);
  try {
    taskManager = require('expo-task-manager') as typeof import('expo-task-manager');
  } catch {
    taskManager = null;
  }
  return taskManager;
}

// La tâche est définie au chargement du module : le système relance le code
// de l'application pour l'exécuter, même application fermée.
(() => {
  const TaskManager = tasks();
  if (!TaskManager) return;
  try {
    TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
      if (error || !data?.locations?.length) return;
      const loc = data.locations[data.locations.length - 1];
      const p: Position = {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? null,
        at: loc.timestamp,
      };
      listeners.forEach((listener) => listener(p));
      await sendPosition(p);
    });
  } catch (e) {
    console.warn('Tâche de position indisponible : recompilez l’application', e);
    taskManager = null;
  }
})();

/** On n'explique et on ne demande « Toujours » qu'une fois par lancement : pas de harcèlement. */
let askedThisLaunch = false;

function explain(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Position écran verrouillé',
      Platform.OS === 'android'
        ? 'Pour que le client vous suive et que les courses vous soient proposées téléphone rangé, Zupone a besoin de votre position même quand l’application n’est pas à l’écran.\n\nDans l’écran qui s’ouvre, choisissez « Toujours autoriser ».'
        : 'Pour que le client vous suive et que les courses vous soient proposées téléphone rangé, Zupone a besoin de votre position même quand l’application n’est pas à l’écran.\n\nChoisissez « Toujours autoriser » ou « Passer à Toujours autoriser ».',
      [
        { text: 'Plus tard', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continuer', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

export type BackgroundPermission = 'granted' | 'denied' | 'unavailable';

/**
 * La position en arrière-plan est-elle permise ? La demande (précédée d'une
 * explication, qu'exige Google Play) n'a lieu que si interactive, et une
 * fois par lancement. Suppose la position au premier plan déjà accordée.
 */
export async function ensureBackgroundPermission(interactive: boolean): Promise<BackgroundPermission> {
  if (!tasks()) return 'unavailable';
  try {
    if (!(await Location.isBackgroundLocationAvailableAsync())) return 'unavailable';
    const current = await Location.getBackgroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (!interactive || askedThisLaunch || !current.canAskAgain) return 'denied';
    askedThisLaunch = true;
    if (!(await explain())) return 'denied';
    const answer = await Location.requestBackgroundPermissionsAsync();
    return answer.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Espacement des envois quand l'écran suit la position lui-même (sans la tâche). */
export function setSendInterval(ms: number) {
  sendEveryMs = ms;
}

/** Heure du dernier envoi : l'écran relance un livreur immobile. */
export const lastSentAt = () => lastSent;

/** Lance (ou règle, si elle tourne déjà) la tâche pour ce profil. */
export async function startBackgroundLocation(profile: BackgroundProfile): Promise<boolean> {
  if (!tasks()) return false;
  const options = TASK_OPTIONS[profile];
  sendEveryMs = options.sendEveryMs;
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: options.accuracy,
      timeInterval: options.timeInterval,
      distanceInterval: 0,
      // iOS : la barre d'état le signale, et le système ne coupe pas le GPS
      // d'un livreur arrêté à un feu ou devant le commerce.
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: 'Zupone Livreur',
        notificationBody: SERVICE_TEXT[profile],
        notificationColor: '#EA580C',
        // Application balayée pendant une course : la position continue.
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch (e) {
    // Android refuse parfois de régler le service quand l'application est en
    // fond : celui qui tourne déjà, avec les réglages d'avant, fait l'affaire.
    console.warn('Suivi en arrière-plan impossible', e);
    return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  }
}

export async function stopBackgroundLocation() {
  if (!tasks()) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // Déjà arrêtée.
  }
}
