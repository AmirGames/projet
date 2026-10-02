import { useEffect, useRef, useState } from 'react';
import { distanceM } from './deliveries';
import { NavStep, Phase, voiceAnnouncement } from './navigation';
import { checkVoice, say, silence, VoiceCheck } from './voice';

/**
 * Les annonces vocales du guidage : chaque manœuvre est annoncée une fois en
 * la découvrant (« Dans 800 mètres, tournez à droite »), rappelée à 400 m si
 * elle était loin, puis dite au moment de tourner. Une manœuvre est reconnue
 * par son point : l'itinéraire recalculé ne la fait pas répéter.
 *
 * Renvoie ce qui empêche le téléphone de parler, le cas échéant : le bandeau
 * le dit au livreur plutôt que de rester muet sans explication.
 */
export function useVoiceGuidance(
  steps: NavStep[],
  current: number,
  driver: { lat: number; lng: number } | null,
  enabled: boolean
): Exclude<VoiceCheck, 'ok'> | null {
  const spoken = useRef(new Map<string, Phase>());
  const [problem, setProblem] = useState<Exclude<VoiceCheck, 'ok'> | null>(null);

  // Une fois par ouverture de la carte : le téléphone a-t-il une voix française ?
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    checkVoice().then((check) => alive && setProblem(check === 'ok' ? null : check));
    return () => {
      alive = false;
    };
  }, [enabled]);

  const step = steps[current];
  const metres = step && driver ? distanceM(driver, step) : null;

  useEffect(() => {
    if (!enabled || !step || metres == null || step.type === 'depart') return;
    const key = `${step.type}:${step.lat.toFixed(5)},${step.lng.toFixed(5)}`;
    const phase = spoken.current.get(key);

    const announcement = voiceAnnouncement(step, metres, phase);
    if (!announcement) return;
    spoken.current.set(key, announcement.next);
    say(announcement.text, () => setProblem('no-engine'));
  }, [enabled, step, metres]);

  // Coupé dans les paramètres, ou la carte se ferme : silence.
  useEffect(() => {
    if (!enabled) silence();
  }, [enabled]);
  useEffect(() => () => silence(), []);

  return enabled ? problem : null;
}
