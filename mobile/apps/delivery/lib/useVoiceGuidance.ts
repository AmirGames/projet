import { useEffect, useRef } from 'react';
import * as Speech from 'expo-speech';
import { distanceM } from './deliveries';
import { NavStep, Phase, voiceAnnouncement } from './navigation';

/**
 * Les annonces vocales du guidage : chaque manœuvre est annoncée une fois en
 * la découvrant (« Dans 800 mètres, tournez à droite »), rappelée à 400 m si
 * elle était loin, puis dite au moment de tourner. Une manœuvre est reconnue
 * par son point : l'itinéraire recalculé ne la fait pas répéter.
 */
export function useVoiceGuidance(
  steps: NavStep[],
  current: number,
  driver: { lat: number; lng: number } | null,
  enabled: boolean
) {
  const spoken = useRef(new Map<string, Phase>());

  const step = steps[current];
  const metres = step && driver ? distanceM(driver, step) : null;

  useEffect(() => {
    if (!enabled || !step || metres == null || step.type === 'depart') return;
    const key = `${step.type}:${step.lat.toFixed(5)},${step.lng.toFixed(5)}`;
    const phase = spoken.current.get(key);

    const announcement = voiceAnnouncement(step, metres, phase);
    if (!announcement) return;
    const { next, text } = announcement;

    spoken.current.set(key, next);
    // La consigne la plus récente remplace celle qui serait encore en cours.
    Speech.stop()
      .catch(() => undefined)
      .then(() => Speech.speak(text, { language: 'fr-FR' }));
  }, [enabled, step, metres]);

  // Coupé dans les paramètres, ou la carte se ferme : silence.
  useEffect(() => {
    if (!enabled) Speech.stop().catch(() => undefined);
  }, [enabled]);
  useEffect(() => () => void Speech.stop().catch(() => undefined), []);
}
