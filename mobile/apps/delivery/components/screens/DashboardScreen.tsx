import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, RefreshControl, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Delivery, deliveryStatus, Driver, shortId } from '../../lib/deliveries';
import type { BackgroundState, GpsState } from '../../lib/useDriverLocation';
import { COLORS, themedStyles } from '../ui';


const PAUSE_DURATIONS = [15, 30, 60];
const PAUSE_REASONS = ['Repas', 'Pause café', 'Plein / recharge', 'Problème véhicule', 'Autre'];

export interface EarningsSummary {
  today: number;
  week: number;
  month: number;
  total: number;
  deliveryCount: number;
  rating: number | null;
  avis: number;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

// Des fonctions : les couleurs suivent le thème en cours.
const GPS_MESSAGES: Partial<Record<GpsState, { text: string; color: () => string }>> = {
  searching: { text: 'Recherche de votre position…', color: () => COLORS.warning },
  denied: { text: 'Localisation refusée : autorisez-la dans les réglages du téléphone pour recevoir des courses.', color: () => COLORS.danger },
  error: { text: 'Signal GPS indisponible : vérifiez que la localisation est activée.', color: () => COLORS.danger },
};

function PauseCard({
  token,
  driver,
  onDriverChange,
  now,
}: {
  token: string;
  driver: Driver;
  onDriverChange: (patch: Partial<Driver>) => void;
  now: number;
}) {
  const [reason, setReason] = useState(PAUSE_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const end = driver.pausedUntil ? new Date(driver.pausedUntil).getTime() : null;
  const paused = end != null && end > now;

  const call = async (method: 'POST' | 'DELETE', body?: object) => {
    setBusy(true);
    try {
      const res = await apiFetch<{ isAvailable: boolean; pausedUntil: string | null; pauseReason?: string | null }>(
        '/api/drivers/pause',
        token,
        { method, body }
      );
      onDriverChange({ isAvailable: res.isAvailable, pausedUntil: res.pausedUntil, pauseReason: res.pauseReason ?? null });
    } catch (e: any) {
      Alert.alert('Pause', e.message || 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  if (paused) {
    const left = Math.max(0, Math.ceil((end! - now) / 1000));
    return (
      <View style={[styles.card, styles.pauseActive]}>
        <Text style={styles.cardTitle}>☕ En pause{driver.pauseReason ? ` · ${driver.pauseReason}` : ''}</Text>
        <Text style={styles.pauseTimer}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </Text>
        <Text style={styles.muted}>Aucune course ne vous sera proposée d’ici là.</Text>
        <TouchableOpacity style={styles.primaryButton} disabled={busy} onPress={() => call('DELETE')}>
          <Text style={styles.primaryButtonText}>{busy ? '…' : '▶ Reprendre maintenant'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Faire une pause</Text>
      <View style={styles.chips}>
        {PAUSE_REASONS.map((r) => (
          <TouchableOpacity key={r} style={[styles.chip, reason === r && styles.chipActive]} onPress={() => setReason(r)}>
            <Text style={[styles.chipText, reason === r && styles.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.pauseDurations}>
        {PAUSE_DURATIONS.map((m) => (
          <TouchableOpacity
            key={m}
            style={styles.pauseButton}
            disabled={busy}
            onPress={() => call('POST', { minutes: m, reason })}
          >
            <Text style={styles.pauseButtonText}>{m} min</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen({
  header,
  token,
  driver,
  earnings,
  activeDeliveries,
  gps,
  background,
  refreshing,
  onRefresh,
  togglingOnline,
  onToggleOnline,
  onOpenDelivery,
  onDriverChange,
  onSeeEarnings,
  onSeeAccount,
}: {
  header: React.ReactNode;
  token: string;
  driver: Driver | null;
  earnings: EarningsSummary | null;
  activeDeliveries: Delivery[];
  gps: GpsState;
  background: BackgroundState;
  refreshing: boolean;
  onRefresh: () => void;
  togglingOnline: boolean;
  onToggleOnline: (online: boolean) => void;
  onOpenDelivery: (delivery: Delivery) => void;
  onDriverChange: (patch: Partial<Driver>) => void;
  onSeeEarnings: () => void;
  onSeeAccount: () => void;
}) {
  // Les comptes à rebours des propositions et de la pause avancent à la
  // seconde, mais seulement quand il y en a un : sans rien à décompter,
  // redessiner l'écran chaque seconde use la batterie pour rien.
  const [now, setNow] = useState(() => Date.now());
  const pauseEnd = driver?.pausedUntil ? new Date(driver.pausedUntil).getTime() : 0;
  const ticking = pauseEnd > Date.now();
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const dateLabel = new Date(now).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const approved = driver?.status === 'ACTIVE';
  const online = Boolean(driver?.isOnline);
  const firstName = driver?.name?.split(' ')[0];
  const gpsMessage = online ? GPS_MESSAGES[gps] : undefined;

  return (
    <>
      {header}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.greeting}>
          {greeting(new Date(now))}
          {firstName ? ` ${firstName}` : ''} · <Text style={styles.date}>{dateLabel}</Text>
        </Text>

        {driver && !approved && (
          <TouchableOpacity style={styles.alert} onPress={onSeeAccount} activeOpacity={0.85}>
            <Text style={styles.alertIcon}>{driver.status === 'PENDING' ? '📄' : '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {driver.status === 'PENDING' ? 'Dossier en cours de validation' : 'Compte inactif'}
              </Text>
              <Text style={styles.alertText}>
                {driver.statusReason ||
                  (driver.status === 'PENDING'
                    ? 'Vous pourrez vous mettre en ligne dès que la plateforme aura validé vos pièces.'
                    : 'Contactez le support pour plus d’informations.')}
              </Text>
            </View>
            <Text style={styles.alertAction}>Voir ›</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.onlineCard, online && styles.onlineCardOn]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.onlineTitle, online && { color: '#FFFFFF' }]}>{online ? '🟢 En ligne' : '⚪ Hors ligne'}</Text>
            <Text style={[styles.onlineText, online && { color: '#fff', opacity: 0.9 }]}>
              {online
                ? driver?.isAvailable
                  ? 'Vous recevez les courses proches de vous.'
                  : activeDeliveries.length
                    ? 'Course en cours : terminez-la pour en recevoir une autre.'
                    : 'Aucune course ne vous est proposée pour le moment.'
                : 'Passez en ligne pour recevoir des courses.'}
            </Text>
          </View>
          {togglingOnline ? (
            <ActivityIndicator color={online ? '#fff' : COLORS.primary} />
          ) : (
            <Switch
              value={online}
              onValueChange={onToggleOnline}
              disabled={!driver || (!approved && !online)}
              trackColor={{ true: '#7CFC8A', false: COLORS.raised }}
            />
          )}
        </View>

        {gpsMessage && (
          <View style={[styles.gpsBanner, { borderLeftColor: gpsMessage.color() }]}>
            <Text style={styles.gpsText}>📡 {gpsMessage.text}</Text>
          </View>
        )}
        {online && gps === 'ok' && background === 'denied' && (
          <TouchableOpacity
            style={[styles.gpsBanner, { borderLeftColor: COLORS.warning }]}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
          >
            <Text style={styles.gpsText}>
              📡 Votre position s’arrête dès que vous rangez le téléphone : les courses ne vous seront plus proposées et le
              client ne vous verra plus avancer.
            </Text>
            <Text style={styles.gpsLink}>Autoriser la localisation « Toujours » →</Text>
          </TouchableOpacity>
        )}
        {online && driver?.gpsLostAt && gps !== 'ok' && (
          <View style={[styles.gpsBanner, { borderLeftColor: COLORS.danger }]}>
            <Text style={styles.gpsText}>📡 Le serveur ne reçoit plus votre position : aucune course ne vous sera proposée.</Text>
          </View>
        )}


        {activeDeliveries.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Course en cours</Text>
            {activeDeliveries.map((d, i, list) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.queueRow, i === list.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => onOpenDelivery(d)}
              >
                <View style={[styles.queueBar, { backgroundColor: deliveryStatus(d.status).color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueTitle} numberOfLines={1}>
                    {d.status === 'PICKED_UP' ? `📍 ${d.deliveryAddress}` : `🏪 ${d.pickupStore || d.pickupAddress}`}
                  </Text>
                  <Text style={styles.queueMeta}>
                    {shortId(d.orderId)} · {deliveryStatus(d.status).label}
                  </Text>
                </View>
                <Text style={styles.link}>Ouvrir ›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.hero} onPress={onSeeEarnings} activeOpacity={0.85}>
          <Text style={styles.heroLabel}>Gains du jour</Text>
          <Text style={styles.heroValue}>{formatEuros(earnings?.today ?? 0)}</Text>
          <Text style={styles.muted}>Cette semaine : {formatEuros(earnings?.week ?? 0)} · Détail ›</Text>
        </TouchableOpacity>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Courses livrées</Text>
            <Text style={styles.kpiValue}>{earnings?.deliveryCount ?? driver?.completedDeliveries ?? 0}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Note</Text>
            <Text style={styles.kpiValue}>
              {driver?.rating != null ? `${Number(driver.rating).toFixed(1).replace('.', ',')} ★` : '—'}
            </Text>
            <Text style={styles.muted}>{driver?.avis ? `${driver.avis} avis` : 'Pas encore noté'}</Text>
          </View>
        </View>

        {driver && online && activeDeliveries.length === 0 && (
          <PauseCard token={token} driver={driver} onDriverChange={onDriverChange} now={now} />
        )}
      </ScrollView>
    </>
  );
}

const styles = themedStyles(() => ({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 24 },
  greeting: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 12, marginTop: 4 },
  date: { fontWeight: '400', color: COLORS.secondary },
  muted: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
    gap: 12,
  },
  alertIcon: { fontSize: 24 },
  alertTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  alertText: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
  alertAction: { fontSize: 15, fontWeight: '700', color: COLORS.link },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  onlineCardOn: { backgroundColor: COLORS.primary },
  onlineTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  onlineText: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
  gpsBanner: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  gpsText: { fontSize: 13, color: COLORS.text },
  gpsLink: { fontSize: 13, fontWeight: '600', color: COLORS.link, marginTop: 6 },
  hero: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  heroLabel: { fontSize: 13, color: COLORS.secondary },
  heroValue: { fontSize: 44, fontWeight: '600', color: COLORS.text, marginVertical: 2, letterSpacing: -1 },
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14 },
  kpiLabel: { fontSize: 13, color: COLORS.secondary },
  kpiValue: { fontSize: 26, fontWeight: '600', color: COLORS.text, marginVertical: 2 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  link: { fontSize: 14, fontWeight: '600', color: COLORS.link },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  queueBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  queueTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  queueMeta: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  pauseActive: { borderLeftWidth: 4, borderLeftColor: COLORS.warning },
  pauseTimer: { fontSize: 40, fontWeight: '600', color: COLORS.text, marginVertical: 4 },
  primaryButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raised,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  pauseDurations: { flexDirection: 'row', gap: 8 },
  pauseButton: { flex: 1, backgroundColor: COLORS.warningBg, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  pauseButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.warning },
}));
