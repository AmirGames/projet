import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { distanceM } from './deliveries';
import {
  ensureBackgroundPermission,
  lastSentAt,
  Position,
  sendPosition,
  setSendInterval,
  startBackgroundLocation,
  stopBackgroundLocation,
  subscribePositions,
} from './backgroundLocation';

export type { Position };

export type GpsState = 'off' | 'searching' | 'ok' | 'denied' | 'error';

/**
 * Ce que fait le livreur : de là dépend la précision dont on a besoin.
 * 'loading' : profil pas encore chargé, on ne touche à rien (une tâche en
 * arrière-plan déjà lancée continue).
 */
export type DutyMode = 'loading' | 'off' | 'idle' | 'delivery';

/**
 * La position part-elle téléphone verrouillé ?
 * - on : oui (tâche en arrière-plan) ;
 * - denied : « Toujours » refusé, seulement application à l'écran ;
 * - unavailable : impossible ici (Expo Go, web) ;
 * - off : pas de suivi.
 */
export type BackgroundState = 'on' | 'denied' | 'unavailable' | 'off';

/** Où va le livreur pendant une course, et s'il suit la carte en plein écran. */
export interface Tracking {
  target: { lat: number; lng: number } | null;
  navigating: boolean;
}

type Profile = 'loading' | 'off' | 'idle' | 'route' | 'near';

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
 *
 * Ces réglages valent pour le suivi au premier plan ; la tâche en
 * arrière-plan a les siens (voir backgroundLocation.ts).
 */
const PROFILES: Record<Exclude<Profile, 'loading' | 'off'>, { watch: Location.LocationOptions; sendEveryMs: number; heartbeatMs: number }> = {
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
 *
 * Avec l'autorisation « Toujours », la position passe par la tâche en
 * arrière-plan et continue téléphone verrouillé. Sans elle, l'écran la suit
 * lui-même, tant que l'application est ouverte.
 */
export function useDriverLocation(token: string, mode: DutyMode, tracking: Tracking) {
  const [position, setPosition] = useState<Position | null>(null);
  const [gps, setGps] = useState<GpsState>('off');
  const [background, setBackground] = useState<BackgroundState>('off');
  const [near, setNear] = useState(false);
  // Retour dans l'application (depuis les réglages, souvent) : l'autorisation
  // « Toujours » a pu changer, le suivi se relance.
  const [recheck, setRecheck] = useState(0);
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const latest = useRef<Position | null>(null);
  const target = useRef(tracking.target);
  target.current = tracking.target;

  const profile: Profile =
    !token || mode === 'off'
      ? 'off'
      : mode === 'loading'
        ? 'loading'
        : mode === 'idle'
          ? 'idle'
          : tracking.navigating || near
            ? 'near'
            : 'route';

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
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && backgroundRef.current === 'denied') setRecheck((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (profile === 'loading') return;
    if (profile === 'off') {
      setGps('off');
      setBackground('off');
      stopBackgroundLocation();
      return;
    }

    const { watch, sendEveryMs, heartbeatMs } = PROFILES[profile];
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const receive = (p: Position) => {
      latest.current = p;
      setPosition(p);
      setGps('ok');
      updateNear(p);
    };

    (async () => {
      // Un changement de profil ne doit pas faire croire à une perte du signal.
      if (!latest.current) setGps('searching');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== 'granted') {
        setGps('denied');
        setBackground('off');
        return;
      }

      const permission = await ensureBackgroundPermission(true);
      if (cancelled) return;
      if (permission === 'granted' && (await startBackgroundLocation(profile))) {
        if (cancelled) return;
        // La tâche reçoit les positions et les envoie ; l'écran les écoute.
        unsubscribe = subscribePositions(receive);
        setBackground('on');
        return;
      }
      if (cancelled) return;
      // Pas d'arrière-plan : l'écran suit et envoie lui-même.
      await stopBackgroundLocation();
      setBackground(permission === 'unavailable' ? 'unavailable' : 'denied');
      setSendInterval(sendEveryMs);
      try {
        const subscription = await Location.watchPositionAsync(
          watch,
          (loc) => {
            const p: Position = {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: loc.coords.accuracy ?? null,
              at: loc.timestamp,
            };
            receive(p);
            sendPosition(p);
          },
          () => setGps('error')
        );
        if (cancelled) subscription.remove();
        else unsubscribe = () => subscription.remove();
      } catch {
        if (!cancelled) setGps('error');
      }
    })();

    // Un livreur immobile ne déclenche plus le suivi : sa position repart
    // quand même, sinon le serveur le croirait sans signal. La vérification
    // est fréquente (un minuteur ne coûte rien, seul l'envoi réveille la
    // radio) pour ne jamais dépasser l'échéance de plus de 15 s. Écran
    // éteint, c'est la tâche en arrière-plan qui s'en charge.
    const heartbeat = setInterval(() => {
      if (latest.current && Date.now() - lastSentAt() >= heartbeatMs) sendPosition(latest.current, true);
    }, HEARTBEAT_CHECK_MS);

    // La tâche continue au-delà de l'écran : on ne l'arrête que hors ligne
    // (profil « off »), pas en quittant l'écran ni en changeant de profil.
    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      unsubscribe?.();
    };
  }, [token, profile, recheck]);

  return { position, gps, background };
}
