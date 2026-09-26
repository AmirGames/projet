import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { apiFetch } from './api';
import { distanceM } from './deliveries';

export interface Position {
  lat: number;
  lng: number;
  /** Précision annoncée par le téléphone, en mètres. */
  accuracy: number | null;
  at: number;
}

export type GpsState = 'off' | 'searching' | 'ok' | 'denied' | 'error';

/** Ce que fait le livreur : de là dépend la précision dont on a besoin. */
export type DutyMode = 'off' | 'idle' | 'delivery';

/** Où va le livreur pendant une course, et s'il suit la carte en plein écran. */
export interface Tracking {
  target: { lat: number; lng: number } | null;
  navigating: boolean;
}

type Profile = 'off' | 'idle' | 'route' | 'near';

/**
 * Le GPS est le premier poste de consommation : on ne demande que la
 * précision utile au moment.
 *
 * - idle  : en ligne, sans course. Le serveur choisit le livreur le plus
 *   proche, une centaine de mètres près ; il le croit sans signal au bout de
 *   deux minutes (GPS_PERDU_APRES_MS), une position par minute suffit.
 * - route : en course, loin de l'étape. Le client suit la pastille.
 * - near  : à moins de 500 m de l'étape, ou carte en plein écran. La prise en
 *   charge se déverrouille à 150 m et le client est prévenu à 300 m : il faut
 *   une position fine et fraîche.
 *
 * Chaque envoi réveille la radio du téléphone pour plusieurs secondes :
 * espacer les envois compte autant que baisser la précision.
 */
const PROFILES: Record<Exclude<Profile, 'off'>, { watch: Location.LocationOptions; sendEveryMs: number; heartbeatMs: number }> = {
  idle: {
    watch: { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 100 },
    sendEveryMs: 60_000,
    heartbeatMs: 60_000,
  },
  route: {
    watch: { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
    sendEveryMs: 12_000,
    heartbeatMs: 30_000,
  },
  near: {
    watch: { accuracy: Location.Accuracy.High, timeInterval: 4_000, distanceInterval: 10 },
    sendEveryMs: 12_000,
    heartbeatMs: 30_000,
  },
};

/** On passe en approche à 500 m, et on n'en sort qu'à 700 m : pas de va-et-vient. */
const NEAR_ENTER_M = 500;
const NEAR_EXIT_M = 700;

const HEARTBEAT_CHECK_MS = 15_000;

/**
 * Suit la position du livreur tant qu'il est en ligne ou sur une course, et
 * l'envoie au serveur : c'est elle qui décide à qui la prochaine course est
 * proposée, et que le client voit bouger sur son suivi.
 */
export function useDriverLocation(token: string, mode: DutyMode, tracking: Tracking) {
  const [position, setPosition] = useState<Position | null>(null);
  const [gps, setGps] = useState<GpsState>('off');
  const [near, setNear] = useState(false);
  const lastSent = useRef(0);
  const latest = useRef<Position | null>(null);
  const target = useRef(tracking.target);
  target.current = tracking.target;

  const profile: Profile =
    !token || mode === 'off' ? 'off' : mode === 'idle' ? 'idle' : tracking.navigating || near ? 'near' : 'route';

  // Nouvelle étape (commerce, puis client) : l'approche se réévalue.
  const updateNear = (p: Position | null) => {
    const t = target.current;
    if (!p || !t) {
      setNear(false);
      return;
    }
    const d = distanceM(p, t);
    setNear((was) => (was ? d <= NEAR_EXIT_M : d <= NEAR_ENTER_M));
  };
  useEffect(() => {
    updateNear(latest.current);
  }, [tracking.target?.lat, tracking.target?.lng]);

  useEffect(() => {
    if (profile === 'off') {
      setGps('off');
      return;
    }

    const { watch, sendEveryMs, heartbeatMs } = PROFILES[profile];
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const send = (p: Position, force = false) => {
      if (!force && Date.now() - lastSent.current < sendEveryMs) return;
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
      // Un changement de profil ne doit pas faire croire à une perte du signal.
      if (!latest.current) setGps('searching');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setGps('denied');
        return;
      }
      try {
        subscription = await Location.watchPositionAsync(
          watch,
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
            updateNear(p);
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
    // quand même, sinon le serveur le croirait sans signal. La vérification
    // est fréquente (un minuteur ne coûte rien, seul l'envoi réveille la
    // radio) pour ne jamais dépasser l'échéance de plus de 15 s.
    const heartbeat = setInterval(() => {
      if (latest.current && Date.now() - lastSent.current >= heartbeatMs) send(latest.current, true);
    }, HEARTBEAT_CHECK_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      subscription?.remove();
    };
  }, [token, profile]);

  return { position, gps };
}
