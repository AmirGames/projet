import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { distanceM, formatDistance } from '../lib/deliveries';
import { instruction, maneuverIcon, NavStep, nextManeuver } from '../lib/navigation';
import { useVoiceGuidance } from '../lib/useVoiceGuidance';
import { COLORS, themedStyles } from './ui';

/**
 * Le guidage virage par virage, au-dessus de la carte plein écran : la
 * prochaine manœuvre (flèche, distance, consigne), celle d'après, et la liste
 * de toutes les étapes d'un toucher. Le guidage avance seul avec le GPS ;
 * l'itinéraire, recalculé par la carte quand le livreur avance ou s'écarte,
 * le remet à jour. Les consignes sont aussi dites à voix haute, sauf si le
 * livreur coupe le son (bouton 🔊, ou les paramètres).
 */
export default function GuidanceCard({
  steps,
  driver,
  voice,
  onToggleVoice,
}: {
  steps: NavStep[];
  driver: { lat: number; lng: number } | null;
  voice: boolean;
  onToggleVoice: () => void;
}) {
  const [listOpen, setListOpen] = useState(false);
  // La manœuvre en cours, pour cet itinéraire : un nouvel itinéraire repart
  // de sa première manœuvre.
  const [progress, setProgress] = useState({ steps, index: 1 });
  const sameRoute = progress.steps === steps;
  const current = nextManeuver(steps, sameRoute ? progress.index : 1, driver);

  useEffect(() => {
    if (sameRoute && progress.index === current) return;
    // Une manœuvre faite : une brève vibration, le livreur garde les yeux sur la route.
    if (sameRoute) Vibration.vibrate(60);
    setProgress({ steps, index: current });
  }, [sameRoute, progress.index, current, steps]);

  useVoiceGuidance(steps, current, driver, voice);

  if (steps.length < 2) return null;
  const step = steps[current];
  const then = steps[current + 1];
  const toManeuver = driver ? distanceM(driver, step) : null;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.main} onPress={() => setListOpen((o) => !o)} activeOpacity={0.8}>
        <Text style={styles.arrow}>{maneuverIcon(step)}</Text>
        <View style={{ flex: 1 }}>
          {toManeuver != null && <Text style={styles.distance}>{formatDistance(toManeuver)}</Text>}
          <Text style={styles.instruction} numberOfLines={2}>
            {instruction(step)}
          </Text>
        </View>
        <Text style={styles.toggle}>{listOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.voice}
        onPress={onToggleVoice}
        hitSlop={10}
        accessibilityLabel={voice ? 'Couper les annonces vocales' : 'Activer les annonces vocales'}
      >
        <Text style={styles.voiceText}>{voice ? '🔊' : '🔇'}</Text>
      </TouchableOpacity>
      {then && !listOpen && (
        <Text style={styles.then} numberOfLines={1}>
          Puis {maneuverIcon(then)} {instruction(then)}
        </Text>
      )}
      {listOpen && (
        <ScrollView style={styles.list}>
          {steps.slice(1).map((s, i) => {
            const done = i + 1 < current;
            return (
              <View key={i} style={[styles.row, i + 1 === current && styles.rowCurrent]}>
                <Text style={[styles.rowArrow, done && styles.done]}>{maneuverIcon(s)}</Text>
                <Text style={[styles.rowText, done && styles.done]} numberOfLines={2}>
                  {instruction(s)}
                </Text>
                {s.type !== 'arrive' && <Text style={[styles.rowDistance, done && styles.done]}>{formatDistance(s.distance)}</Text>}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: { backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  main: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  arrow: { fontSize: 40, fontWeight: '800', color: COLORS.link, width: 56, textAlign: 'center', marginRight: 8 },
  distance: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  instruction: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  toggle: { fontSize: 14, color: COLORS.muted, marginLeft: 8, marginRight: 36 },
  voice: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceText: { fontSize: 18 },
  then: {
    fontSize: 13,
    color: COLORS.secondary,
    backgroundColor: COLORS.raised,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  list: { maxHeight: 260 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  rowCurrent: { backgroundColor: COLORS.brandBg },
  rowArrow: { fontSize: 18, width: 24, textAlign: 'center', color: COLORS.link },
  rowText: { flex: 1, fontSize: 14, color: COLORS.text },
  rowDistance: { fontSize: 13, color: COLORS.muted },
  done: { opacity: 0.45 },
}));
