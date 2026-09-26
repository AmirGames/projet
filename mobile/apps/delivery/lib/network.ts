import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type * as NetworkModule from 'expo-network';

/**
 * Le livreur a-t-il du réseau ?
 *
 * Deux sources : le téléphone (Wi-Fi ou données, et internet joignable), et
 * les appels eux-mêmes. Un téléphone « connecté » avec une barre de réseau
 * dans une cage d'escalier n'atteint pas le serveur : un appel qui échoue
 * faute de réseau compte comme une coupure, jusqu'au prochain qui aboutit.
 */

let networkModule: typeof NetworkModule | null | undefined;
function network(): typeof NetworkModule | null {
  if (networkModule !== undefined) return networkModule;
  try {
    // Chargé à la demande : une application compilée sans lui considère le
    // réseau présent, et seuls les appels ratés signalent la coupure.
    networkModule = Platform.OS === 'web' ? null : (require('expo-network') as typeof NetworkModule);
  } catch {
    networkModule = null;
  }
  return networkModule;
}

let phoneOnline = true;
let serverReached = true;
const listeners = new Set<(online: boolean) => void>();

export const isOnline = () => phoneOnline && serverReached;

function update(change: () => void) {
  const before = isOnline();
  change();
  const after = isOnline();
  if (before !== after) listeners.forEach((l) => l(after));
}

function fromState(state: { isConnected?: boolean; isInternetReachable?: boolean }) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

(() => {
  const N = network();
  if (!N) return;
  try {
    N.getNetworkStateAsync()
      .then((s) => update(() => (phoneOnline = fromState(s))))
      .catch(() => undefined);
    N.addNetworkStateListener((s) =>
      update(() => {
        phoneOnline = fromState(s);
        // Le réseau revient : on retente le serveur plutôt que de rester sur
        // le dernier échec.
        if (phoneOnline) serverReached = true;
      })
    );
  } catch {
    networkModule = null;
  }
})();

/** Un appel n'a pas atteint le serveur (pas de réponse du tout). */
export const reportUnreachable = () => update(() => (serverReached = false));
/** Un appel a reçu une réponse, quelle qu'elle soit : le serveur est joignable. */
export const reportReachable = () => update(() => (serverReached = true));

/** Prévenu à chaque coupure et à chaque retour du réseau. */
export function subscribeOnline(listener: (online: boolean) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnline() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    setOnline(isOnline());
    return subscribeOnline(setOnline);
  }, []);
  return online;
}

/**
 * L'échec vient-il du réseau (pas de réponse) plutôt que du serveur (une
 * réponse d'erreur) ? apiFetch lève ApiError pour une réponse, fetch une
 * TypeError sans réseau.
 */
export function isNetworkError(e: unknown) {
  return !(e && typeof e === 'object' && 'status' in e && typeof (e as any).status === 'number');
}
