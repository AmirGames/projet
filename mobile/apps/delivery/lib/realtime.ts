import { useEffect, useRef } from 'react';

type Handler = (payload: any) => void;

const listeners = new Map<string, Set<Handler>>();

/** Appelé par la connexion socket pour chaque événement reçu du serveur. */
export function dispatchRealtime(event: string, payload: unknown) {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (e) {
      console.warn(`Événement temps réel « ${event} » mal traité`, e);
    }
  });
}

export function subscribeRealtime(event: string, handler: Handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => {
    listeners.get(event)?.delete(handler);
  };
}

/**
 * Écoute un événement du serveur tant que l'écran est affiché. Le handler le
 * plus récent est toujours utilisé, sans se réabonner à chaque rendu.
 */
export function useRealtimeEvent(event: string, handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribeRealtime(event, (payload) => ref.current(payload)), [event]);
}
