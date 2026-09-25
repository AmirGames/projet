import { useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { dispatchRealtime, setRealtimeSocket } from './realtime';

export interface OrderUpdate {
  orderId: string;
  status: string;
  title?: string;
  message?: string;
}

export interface DeliveryUpdate {
  orderId: string;
  status?: string;
  location?: { latitude: number; longitude: number };
  eta?: number;
  gpsLost?: boolean;
  livreurProche?: boolean;
}

/**
 * Le client en direct : chaque commande en cours est suivie dans son salon
 * (« order-<id> »), et les notifications du compte arrivent dans le salon de
 * son e-mail, que le serveur rejoint seul à la connexion.
 *
 * Les écrans s'abonnent ensuite à ce qui les intéresse par `useRealtimeEvent`.
 */
export function useCustomerRealtime({
  token,
  activeOrderIds,
  onOrderUpdate,
  onDeliveryUpdate,
  onNotification,
  onReconnect,
}: {
  token: string;
  activeOrderIds: string[];
  onOrderUpdate: (update: OrderUpdate) => void;
  onDeliveryUpdate: (update: DeliveryUpdate) => void;
  onNotification: () => void;
  onReconnect: () => void;
}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const callbacks = useRef({ onOrderUpdate, onDeliveryUpdate, onNotification, onReconnect });
  callbacks.current = { onOrderUpdate, onDeliveryUpdate, onNotification, onReconnect };

  const orderIds = useRef<string[]>(activeOrderIds);
  orderIds.current = activeOrderIds;

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;
    setRealtimeSocket({
      emit: (event, payload) => socket.emit(event, payload),
      get connected() {
        return socket.connected;
      },
    });

    socket.onAny((event: string, payload: unknown) => dispatchRealtime(event, payload));

    socket.on('connect', () => {
      setConnected(true);
      orderIds.current.forEach((id) => socket.emit('join-order', id));
      // Ce qui est arrivé pendant la coupure n'a pas été envoyé : on recharge.
      callbacks.current.onReconnect();
      dispatchRealtime('reconnecte', null);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('order-update', (u: OrderUpdate) => callbacks.current.onOrderUpdate(u));
    socket.on('delivery-update', (u: DeliveryUpdate) => {
      // Le livreur est à 300 m : le téléphone vibre, même posé sur la table.
      if (u?.livreurProche) Vibration.vibrate([0, 300, 150, 300]);
      callbacks.current.onDeliveryUpdate(u);
    });
    socket.on('notification', () => callbacks.current.onNotification());

    return () => {
      socket.removeAllListeners();
      socket.offAny();
      socket.disconnect();
      socketRef.current = null;
      setRealtimeSocket(null);
      setConnected(false);
    };
  }, [token]);

  // Une commande qui vient d'être passée rejoint son salon aussitôt.
  const joined = useRef(new Set<string>());
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    activeOrderIds.forEach((id) => {
      if (!joined.current.has(id)) socket.emit('join-order', id);
    });
    joined.current = new Set(activeOrderIds);
  }, [activeOrderIds, connected]);

  // Retour au premier plan : le socket a pu être coupé par le système.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        callbacks.current.onReconnect();
        dispatchRealtime('reconnecte', null);
      }
    });
    return () => sub.remove();
  }, [token]);

  return { connected };
}
