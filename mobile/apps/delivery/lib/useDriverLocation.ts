import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { apiFetch } from './api';

/** Cadence d'envoi : assez fréquente pour un suivi utile, assez espacée pour la batterie. */
const SEND_INTERVAL_MS = 15_000;

export interface Position {
  lat: number;
  lng: number;
  /** Précision annoncée par le téléphone, en mètres. */
  accuracy: number | null;
  at: number;
}

export type GpsState = 'off' | 'searching' | 'ok' | 'denied' | 'error';

/**
 * Suit la position du livreur tant qu'il est en ligne ou sur une course, et
 * l'envoie au serveur : c'est elle qui décide à qui la prochaine course est
 * proposée, et que le client voit bouger sur son suivi.
 */
export function useDriverLocation(token: string, active: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  const [gps, setGps] = useState<GpsState>('off');
  const lastSent = useRef(0);
  const latest = useRef<Position | null>(null);

  useEffect(() => {
    if (!token || !active) {
      setGps('off');
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const send = (p: Position, force = false) => {
      if (!force && Date.now() - lastSent.current < SEND_INTERVAL_MS) return;
      lastSent.current = Date.now();
      apiFetch('/api/drivers/location', token, {
        method: 'PATCH',
        body: { latitude: p.lat, longitude: p.lng },
      }).catch(() => {
        // Hors réseau : la position repartira au prochain envoi.
        lastSent.current = 0;
      });
    };

    (async () => {
      setGps('searching');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setGps('denied');
        return;
      }
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10 },
          (loc) => {
            const p: Position = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? null,
              at: loc.timestamp,
            };
            latest.current = p;
            setPosition(p);
            setGps('ok');
            send(p);
          },
          () => setGps('error')
        );
        if (cancelled) subscription.remove();
      } catch {
        if (!cancelled) setGps('error');
      }
    })();

    // Un livreur immobile ne déclenche plus le suivi : sa position repart
    // quand même, sinon le serveur le croirait sans signal.
    const heartbeat = setInterval(() => {
      if (latest.current) send(latest.current, true);
    }, SEND_INTERVAL_MS * 2);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      subscription?.remove();
    };
  }, [token, active]);

  return { position, gps };
}
