import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

export interface NewOrderEvent {
  orderId: string;
  storeId: string;
  customerName?: string;
  deliveryType?: string;
  totalAmount?: number;
  echeance?: string;
}

const REMINDER_MS = 30_000;
const VIBRATION_PATTERN = [0, 400, 200, 400];

/**
 * Commandes en direct : le serveur prévient l'équipe de la boutique à chaque
 * nouvelle commande (« commande-nouvelle ») et à chaque réponse
 * (« commande-traitee »). Tant qu'une commande attend, la sonnerie revient.
 */
export function useOrderAlerts({
  token,
  soundEnabled,
  pendingCount,
  onNewOrder,
  onOrdersChanged,
}: {
  token: string;
  soundEnabled: boolean;
  pendingCount: number;
  onNewOrder: (event: NewOrderEvent) => void;
  onOrdersChanged: () => void;
}) {
  const player = useAudioPlayer(require('../assets/sounds/new-order.wav'));
  const [connected, setConnected] = useState(false);

  const callbacks = useRef({ onNewOrder, onOrdersChanged, soundEnabled });
  callbacks.current = { onNewOrder, onOrdersChanged, soundEnabled };

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const ring = useCallback(() => {
    if (!callbacks.current.soundEnabled) return;
    Vibration.vibrate(VIBRATION_PATTERN);
    try {
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

    socket.on('connect', () => {
      setConnected(true);
      // Ce qui est arrivé pendant la coupure n'a pas été envoyé : on recharge.
      callbacks.current.onOrdersChanged();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('commande-nouvelle', (event: NewOrderEvent) => {
      ring();
      callbacks.current.onNewOrder(event);
    });
    socket.on('commande-traitee', () => callbacks.current.onOrdersChanged());

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [token, ring]);

  // Retour au premier plan : le socket a pu être coupé par le système.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') callbacks.current.onOrdersChanged();
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
