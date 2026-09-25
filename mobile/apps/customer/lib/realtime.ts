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

// La connexion ouverte par `useCustomerRealtime`, pour rejoindre des salons.
let current: { emit: (event: string, payload: unknown) => void; connected: boolean } | null = null;

export function setRealtimeSocket(socket: typeof current) {
  current = socket;
}

/**
 * Rejoint le salon d'une boutique (disponibilités du menu) ou d'une commande
 * (statut, position du livreur) tant que l'écran est affiché, et le rejoint à
 * nouveau après chaque reconnexion : le serveur oublie les salons d'un socket
 * coupé.
 */
export function useRoom(kind: 'store' | 'order', id: string | null | undefined) {
  useEffect(() => {
    if (!id) return;
    const join = () => current?.emit(`join-${kind}`, id);
    join();
    const off = subscribeRealtime('reconnecte', join);
    return () => {
      off();
      // Le salon d'une commande reste : l'application entière la suit tant
      // qu'elle est en cours, pas seulement son écran.
      if (kind === 'store') current?.emit('leave-store', id);
    };
  }, [kind, id]);
}
