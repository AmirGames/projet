import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { formatEuros } from '../lib/api';
import { Delivery, formatKm, hhmm, shortId } from '../lib/deliveries';
import { COLORS, themedStyles, ui } from './ui';

/** Sans geste du livreur, l'accueil revient au bout de ce délai. */
const AUTO_RETURN_S = 20;

const PROOF_LABELS: Record<string, string> = {
  CODE: '🤝 Remise en main propre (code du client)',
  PHOTO: '📦 Déposée en lieu sûr (photo envoyée au client)',
};

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/**
 * La fin de la course : ce qu'elle a rapporté, la distance, le temps passé,
 * puis retour à l'accueil pour la suivante.
 *
 * Le livreur finissait sur un simple bandeau vert, sans savoir ce que la
 * course lui avait payé : il devait ouvrir ses revenus pour le découvrir.
 *
 * Remise faite sans réseau : le bilan (qui vient du serveur) arrive au
 * retour du réseau, l'écran l'annonce en attendant.
 */
export default function CompletionSummary({
  delivery,
  pending,
  todayEarnings,
  autoReturn,
  onBack,
}: {
  delivery: Delivery;
  /** La remise attend encore le réseau. */
  pending: boolean;
  /** Gains du jour, cette course comprise quand le serveur l'a comptée. */
  todayEarnings: number | null;
  /** Course terminée à l'instant : l'accueil revient seul. Pas depuis l'historique. */
  autoReturn: boolean;
  onBack: () => void;
}) {
  const bilan = delivery.bilan;
  // Le retour automatique ne part qu'une fois le bilan affiché, et s'arrête
  // dès que le livreur touche l'écran : il lit peut-être encore.
  const [countdown, setCountdown] = useState<number | null>(null);
  const ready = Boolean(bilan) && !pending;
  useEffect(() => {
    if (ready && autoReturn) setCountdown(AUTO_RETURN_S);
  }, [ready, autoReturn]);
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      onBack();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);
  const stop = () => setCountdown(null);

  const distance = bilan?.distanceKm ?? delivery.distance ?? null;
  const steps = [
    { label: 'Acceptée', at: bilan?.acceptedAt },
    { label: 'Récupérée au commerce', at: bilan?.pickedUpAt },
    { label: 'Livrée', at: bilan?.deliveredAt },
  ].filter((s) => s.at);

  return (
    <ScrollView contentContainerStyle={ui.content} onTouchStart={stop} onScrollBeginDrag={stop}>
      <View style={styles.hero}>
        <Text style={styles.check}>✅</Text>
        <Text style={styles.title}>Course terminée</Text>
        <Text style={styles.subtitle}>
          {delivery.pickupStore ? `${delivery.pickupStore} · ` : ''}
          {shortId(delivery.orderId)}
        </Text>
        {bilan ? (
          <>
            <Text style={styles.payout}>+ {formatEuros(bilan.payout)}</Text>
            <Text style={styles.payoutLabel}>pour cette course</Text>
          </>
        ) : (
          <Text style={styles.pendingText}>
            {pending
              ? '📴 La remise part dès le retour du réseau. Le montant de la course s’affichera à ce moment-là.'
              : 'Calcul du montant…'}
          </Text>
        )}
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Distance</Text>
          <Text style={styles.tileValue}>{formatKm(distance)}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Durée</Text>
          <Text style={styles.tileValue}>{bilan?.durationMin != null ? formatMinutes(bilan.durationMin) : '—'}</Text>
        </View>
      </View>

      {(steps.length > 0 || bilan?.proofType) && (
        <View style={styles.card}>
          {steps.map((s) => (
            <View key={s.label} style={styles.stepRow}>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Text style={styles.stepTime}>{hhmm(s.at)}</Text>
            </View>
          ))}
          {bilan?.proofType && PROOF_LABELS[bilan.proofType] ? (
            <Text style={styles.proof}>{PROOF_LABELS[bilan.proofType]}</Text>
          ) : null}
        </View>
      )}

      {todayEarnings != null && ready && autoReturn && (
        <View style={styles.today}>
          <Text style={styles.todayLabel}>Aujourd’hui</Text>
          <Text style={styles.todayValue}>{formatEuros(todayEarnings)}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={onBack}>
        <Text style={styles.primaryButtonText}>
          {autoReturn ? 'Retour à l’accueil' : 'Retour'}
          {countdown != null ? ` (${countdown})` : ''}
        </Text>
      </TouchableOpacity>
      {countdown != null && (
        <TouchableOpacity onPress={stop} style={styles.stay}>
          <Text style={styles.stayText}>Rester sur cet écran</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  hero: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  check: { fontSize: 44 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  subtitle: { fontSize: 14, color: COLORS.secondary, marginTop: 4 },
  payout: { fontSize: 48, fontWeight: '700', color: COLORS.successText, marginTop: 20, letterSpacing: -1 },
  payoutLabel: { fontSize: 14, color: COLORS.secondary },
  pendingText: { fontSize: 14, color: COLORS.text, textAlign: 'center', marginTop: 18, lineHeight: 20 },
  tiles: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14 },
  tileLabel: { fontSize: 13, color: COLORS.secondary },
  tileValue: { fontSize: 24, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12, gap: 8 },
  stepRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stepLabel: { fontSize: 14, color: COLORS.text },
  stepTime: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  proof: { fontSize: 13, color: COLORS.secondary, marginTop: 4 },
  today: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.successBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  todayLabel: { fontSize: 15, color: COLORS.successOnBg, fontWeight: '600' },
  todayValue: { fontSize: 20, color: COLORS.successOnBg, fontWeight: '700' },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stay: { alignItems: 'center', paddingVertical: 14 },
  stayText: { fontSize: 14, color: COLORS.link, fontWeight: '600' },
}));
