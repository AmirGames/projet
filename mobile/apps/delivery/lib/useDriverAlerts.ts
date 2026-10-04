import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { dispatchRealtime } from './realtime';
import type { Offer } from './deliveries';
import { CourseAlerts } from './courseAlerts';

const REMINDER_MS = 5_000;
const VIBRATION_PATTERN = [0, 400, 200, 400];

/**
 * Le livreur en direct : le serveur lui pousse chaque course proposée
 * (« course-proposee ») dans le salon de son compte. Une proposition ne vit
 * que quelques dizaines de secondes : tant qu'elle attend, la sonnerie revient.
 *
 * Les autres événements (GPS perdu, pause terminée, support, commande prête…)
 * passent par `useRealtimeEvent`, écran par écran.
 */
export function useDriverAlerts({
  token,
  soundEnabled,
  ringInSilentMode,
  pendingOffers,
  onOffer,
  onChanged,
  onNotification,
}: {
  token: string;
  soundEnabled: boolean;
  ringInSilentMode: boolean;
  pendingOffers: number;
  onOffer: (offer: Offer) => void;
  onChanged: () => void;
  onNotification?: () => void;
}) {
  const player = useAudioPlayer(require('../assets/sounds/new_course.wav'));
  const [connected, setConnected] = useState(false);

  const callbacks = useRef({ onOffer, onChanged, onNotification, soundEnabled, ringInSilentMode });
  const playerRef = useRef(player);
  useLayoutEffect(() => {
    callbacks.current = { onOffer, onChanged, onNotification, soundEnabled, ringInSilentMode };
    playerRef.current = player;
  }, [onOffer, onChanged, onNotification, soundEnabled, ringInSilentMode, player]);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  const ring = useCallback(() => {
    if (!callbacks.current.soundEnabled) return;
    if (AppState.currentState !== 'active') return; // Background alerts are driven by FCM, independently of the socket.
    Vibration.vibrate(VIBRATION_PATTERN);
    if (callbacks.current.ringInSilentMode && CourseAlerts) {
      CourseAlerts.ring().catch(e => console.warn('Sonnerie des alarmes indisponible', e));
      return;
    }
    try {
      const nativePlayer = playerRef.current;
      nativePlayer.volume = 1;
      nativePlayer.seekTo(0);
      nativePlayer.play();
    } catch (e) {
      console.warn('Sonnerie impossible', e);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });

    socket.onAny((event: string, payload: unknown) => dispatchRealtime(event, payload));

    socket.on('connect', () => {
      setConnected(true);
      // Ce qui est arrivé pendant la coupure n'a pas été envoyé : on recharge.
      callbacks.current.onChanged();
      dispatchRealtime('reconnecte', null);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('course-proposee', (payload: Offer & { offerId?: string }) => {
      ring();
      callbacks.current.onOffer({ ...payload, id: payload.offerId || payload.id });
    });
    // Commande prête, annulée, course reprise… : le livreur ne reçoit que
    // les annonces de ses propres courses.
    socket.on('donnees-modifiees', (m: { ressource?: string }) => {
      if (m?.ressource === 'orders') callbacks.current.onChanged();
    });
    socket.on('notification', () => callbacks.current.onNotification?.());

    return () => {
      socket.removeAllListeners();
      socket.offAny();
      socket.disconnect();
      setConnected(false);
    };
  }, [token, ring]);

  // Retour au premier plan : le socket a pu être coupé par le système.
  useEffect(() => {
    if (!token) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        callbacks.current.onChanged();
        dispatchRealtime('reconnecte', null);
      }
    });
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    if (!token || pendingOffers === 0 || !soundEnabled) return;
    const id = setInterval(ring, REMINDER_MS);
    return () => clearInterval(id);
  }, [token, pendingOffers, soundEnabled, ring]);

  useEffect(() => {
    if (!token || pendingOffers === 0 || !soundEnabled) {
      CourseAlerts?.silence().catch(() => undefined);
      player.pause();
    }
  }, [token, pendingOffers, soundEnabled, player]);

  return { connected, ring };
}
