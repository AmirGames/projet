import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { dispatchRealtime } from './realtime';

export interface NewOrderEvent {
  orderId: string;
  storeId: string;
  customerName?: string;
  deliveryType?: string;
  totalAmount?: number;
  echeance?: string;
}

const REMINDER_MS = 5_000;
const VIBRATION_PATTERN = [0, 400, 200, 400];

/**
 * Commandes en direct : le serveur prévient l'équipe de la boutique à chaque
 * nouvelle commande (« commande-nouvelle ») et à chaque réponse
 * (« commande-traitee »). Tant qu'une commande attend, la sonnerie revient.
 */
export function useOrderAlerts({
  token,
  storeId,
  soundEnabled,
  pendingCount,
  onNewOrder,
  onOrdersChanged,
  onNotification,
}: {
  token: string;
  storeId: string;
  soundEnabled: boolean;
  pendingCount: number;
  onNewOrder: (event: NewOrderEvent) => void;
  onOrdersChanged: () => void;
  onNotification?: () => void;
}) {
  const player = useAudioPlayer(require('../assets/sounds/new_order.wav'));
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const storeIdRef = useRef(storeId);

  const callbacks = useRef({ onNewOrder, onOrdersChanged, onNotification, soundEnabled });
  callbacks.current = { onNewOrder, onOrdersChanged, onNotification, soundEnabled };

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const ring = useCallback(() => {
    if (!callbacks.current.soundEnabled) return;
    Vibration.vibrate(VIBRATION_PATTERN);
    try {
      player.volume = 1;
      player.seekTo(0);
      player.play();
    } catch (e) {
      console.warn('Sonnerie impossible', e);
    }
  }, [player]);

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    socketRef.current = socket;
    // Chaque écran écoute ce qui le concerne (support, menu, boutique…).
    socket.onAny((event: string, payload: unknown) => dispatchRealtime(event, payload));

    socket.on('connect', () => {
      setConnected(true);
      // Salon public de la boutique : disponibilité des produits.
      if (storeIdRef.current) socket.emit('join-store', storeIdRef.current);
      // Ce qui est arrivé pendant la coupure n'a pas été envoyé : on recharge.
      callbacks.current.onOrdersChanged();
      dispatchRealtime('reconnecte', null);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('commande-nouvelle', (event: NewOrderEvent) => {
      ring();
      callbacks.current.onNewOrder(event);
    });
    socket.on('commande-traitee', () => callbacks.current.onOrdersChanged());
    socket.on('commande-maj', () => callbacks.current.onOrdersChanged());
    socket.on('notification', () => callbacks.current.onNotification?.());

    return () => {
      socket.removeAllListeners();
      socket.offAny();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, ring]);

  useEffect(() => {
    const socket = socketRef.current;
    const previous = storeIdRef.current;
    storeIdRef.current = storeId;
    if (!socket?.connected || previous === storeId) return;
    if (previous) socket.emit('leave-store', previous);
    if (storeId) socket.emit('join-store', storeId);
  }, [storeId]);

  // Retour au premier plan : le socket a pu être coupé par le système.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        callbacks.current.onOrdersChanged();
        dispatchRealtime('reconnecte', null);
      }
    });
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    if (!token || pendingCount === 0 || !soundEnabled) return;
    const id = setInterval(ring, REMINDER_MS);
    return () => clearInterval(id);
  }, [token, pendingCount, soundEnabled, ring]);

  return { connected, ring };
}
