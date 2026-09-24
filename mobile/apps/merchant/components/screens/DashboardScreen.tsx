import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatEuros } from '../../lib/api';
import { isPending, Order, statusColor, statusLabel } from '../../lib/orders';
import { COLORS } from '../ui';

const EXCLUDED = ['REJECTED', 'CANCELLED'];
const ACTIVE = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];
const STATUS_ORDER: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PREPARING: 2, READY: 3 };

const INK = { primary: '#1F2328', secondary: '#57606A', muted: '#8C959F' };
const GOOD = '#1A7F37';
const BAD = '#CF222E';
const GRID = '#E6E8EB';
const BAR = COLORS.primary;
const CHART_HEIGHT = 120;

const upper = (s?: string) => (s || '').toUpperCase();
const amount = (o: Order) => parseFloat(String(o.totalAmount)) || 0;
const time = (o: Order) => (o.createdAt ? new Date(o.createdAt).getTime() : 0);

function sinceLabel(iso?: string, now = Date.now()) {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Bonne nuit';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

/** Variation vs hier à la même heure : flèche + texte, jamais la couleur seule. */
function Delta({ now, before, compact = false }: { now: number; before: number; compact?: boolean }) {
  if (before <= 0) {
    return <Text style={styles.deltaNeutral}>{now > 0 ? (compact ? 'Rien hier' : 'Aucune vente hier à cette heure') : '—'}</Text>;
  }
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <Text style={styles.deltaNeutral}>= identique à hier</Text>;
  const up = pct > 0;
  return (
    <Text style={[styles.delta, { color: up ? GOOD : BAD }]}>
      {up ? '▲' : '▼'} {up ? '+' : ''}
      {pct} %<Text style={styles.deltaNeutral}>{compact ? ' vs hier' : ' vs hier à cette heure'}</Text>
    </Text>
  );
}

function HourlyChart({ orders, now }: { orders: Order[]; now: Date }) {
  const [selected, setSelected] = useState<number | null>(null);

  const { hours, counts, revenue, max } = useMemo(() => {
    const c = new Array(24).fill(0);
    const r = new Array(24).fill(0);
    for (const o of orders) {
      const h = new Date(time(o)).getHours();
      c[h] += 1;
      r[h] += amount(o);
    }
    const withOrders = c.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
    const current = now.getHours();
    const start = Math.min(withOrders[0] ?? current, 11, current);
    const end = Math.max(withOrders[withOrders.length - 1] ?? current, current);
    const range = [];
    for (let h = start; h <= end; h++) range.push(h);
    return { hours: range, counts: c, revenue: r, max: Math.max(1, ...c) };
  }, [orders, now]);

  const peak = hours.reduce((best, h) => (counts[h] > counts[best] ? h : best), hours[0]);
  const shown = selected ?? null;

  return (
    <View>
      <View style={styles.chartHeader}>
        <Text style={styles.cardTitle}>Commandes par heure</Text>
        <Text style={styles.chartHint}>
          {shown !== null
            ? `${shown}h–${shown + 1}h · ${counts[shown]} commande${counts[shown] > 1 ? 's' : ''} · ${formatEuros(revenue[shown])}`
            : 'Touchez une barre'}
        </Text>
      </View>
      <View style={styles.chart}>
        {[0.5, 1].map((f) => (
          <View key={f} style={[styles.gridLine, { bottom: CHART_HEIGHT * f }]} />
        ))}
        <View style={styles.bars}>
          {hours.map((h) => {
            const n = counts[h];
            const height = n ? Math.max(4, (n / max) * CHART_HEIGHT) : 0;
            const isPeak = h === peak && n > 0;
            return (
              <TouchableOpacity
                key={h}
                style={styles.slot}
                activeOpacity={0.7}
                onPress={() => setSelected(selected === h ? null : h)}
                accessibilityLabel={`${h} heures : ${n} commandes`}
              >
                {(isPeak || selected === h) && n > 0 ? <Text style={styles.barValue}>{n}</Text> : null}
                <View
                  style={[
                    styles.bar,
                    { height, opacity: selected === null || selected === h ? 1 : 0.35 },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.axis}>
        {hours.map((h, i) => (
          <Text key={h} style={styles.axisLabel}>
            {i % Math.ceil(hours.length / 6) === 0 ? `${h}h` : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function DashboardScreen({
  header,
  orders,
  refreshing,
  onRefresh,
  onOpenOrder,
  onSeeOrders,
}: {
  header: React.ReactNode;
  orders: Order[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenOrder: (order: Order) => void;
  onSeeOrders: () => void;
}) {
  // Les « il y a X min » et la comparaison à hier avancent avec l'horloge.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart.getTime() - 86_400_000;
    const yesterdaySameTime = now.getTime() - 86_400_000;

    const valid = orders.filter((o) => !EXCLUDED.includes(upper(o.status)));
    const today = valid.filter((o) => time(o) >= todayStart.getTime());
    const yesterday = valid.filter((o) => time(o) >= yesterdayStart && time(o) <= yesterdaySameTime);

    const sum = (list: Order[]) => list.reduce((s, o) => s + amount(o), 0);
    const revenue = sum(today);
    const revenueY = sum(yesterday);

    const allToday = orders.filter((o) => time(o) >= todayStart.getTime());
    const queue = allToday
      .filter((o) => ACTIVE.includes(upper(o.status)))
      .sort((a, b) => STATUS_ORDER[upper(a.status)] - STATUS_ORDER[upper(b.status)] || time(a) - time(b));

    const products = new Map<string, number>();
    for (const o of today) {
      for (const item of o.items || []) {
        const name = item.product?.name || 'Produit';
        products.set(name, (products.get(name) || 0) + item.quantity);
      }
    }
    const top = [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      today,
      revenue,
      revenueY,
      count: today.length,
      countY: yesterday.length,
      avg: today.length ? revenue / today.length : 0,
      avgY: yesterday.length ? revenueY / yesterday.length : 0,
      pending: allToday.filter(isPending).length,
      preparing: allToday.filter((o) => ['ACCEPTED', 'PREPARING'].includes(upper(o.status))).length,
      ready: allToday.filter((o) => upper(o.status) === 'READY').length,
      rejected: allToday.filter((o) => EXCLUDED.includes(upper(o.status))).length,
      delivery: today.filter((o) => o.deliveryType === 'DELIVERY').length,
      queue,
      top,
    };
  }, [orders, now]);

  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      {header}
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.greeting}>
          {greeting(now)} · <Text style={styles.date}>{dateLabel}</Text>
        </Text>

        {data.pending > 0 && (
          <TouchableOpacity style={styles.alert} onPress={onSeeOrders} activeOpacity={0.85}>
            <Text style={styles.alertIcon}>⏳</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>
                {data.pending} commande{data.pending > 1 ? 's' : ''} à accepter
              </Text>
              <Text style={styles.alertText}>Le client attend votre réponse</Text>
            </View>
            <Text style={styles.alertAction}>Traiter ›</Text>
          </TouchableOpacity>
        )}

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>Chiffre d'affaires du jour</Text>
          <Text style={styles.heroValue}>{formatEuros(data.revenue)}</Text>
          <Delta now={data.revenue} before={data.revenueY} />
        </View>

        <View style={styles.kpis}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Commandes</Text>
            <Text style={styles.kpiValue}>{data.count}</Text>
            <Delta now={data.count} before={data.countY} compact />
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Panier moyen</Text>
            <Text style={styles.kpiValue}>{formatEuros(data.avg)}</Text>
            <Delta now={data.avg} before={data.avgY} compact />
          </View>
        </View>

        <View style={styles.pipeline}>
          {[
            { label: 'À accepter', value: data.pending, status: 'PENDING' },
            { label: 'En cuisine', value: data.preparing, status: 'PREPARING' },
            { label: 'Prêtes', value: data.ready, status: 'READY' },
          ].map((step) => (
            <TouchableOpacity key={step.label} style={styles.step} onPress={onSeeOrders}>
              <View style={[styles.stepDot, { backgroundColor: statusColor(step.status) }]} />
              <Text style={styles.stepValue}>{step.value}</Text>
              <Text style={styles.stepLabel}>{step.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>En cours</Text>
            <TouchableOpacity onPress={onSeeOrders}>
              <Text style={styles.link}>Tout voir ›</Text>
            </TouchableOpacity>
          </View>
          {data.queue.length === 0 ? (
            <Text style={styles.empty}>Aucune commande en cours 👌</Text>
          ) : (
            data.queue.slice(0, 5).map((o, i, list) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.queueRow, i === list.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => onOpenOrder(o)}
              >
                <View style={[styles.queueBar, { backgroundColor: statusColor(o.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.queueTitle} numberOfLines={1}>
                    {o.customerName || 'Client'} · {o.deliveryType === 'DELIVERY' ? '🛵' : '🛍️'}
                  </Text>
                  <Text style={styles.queueMeta}>
                    {statusLabel(o.status)} · {sinceLabel(o.createdAt, now.getTime())}
                  </Text>
                </View>
                <Text style={styles.queueAmount}>{formatEuros(o.totalAmount)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.card}>
          {data.count ? (
            <HourlyChart orders={data.today} now={now} />
          ) : (
            <>
              <Text style={styles.cardTitle}>Commandes par heure</Text>
              <Text style={styles.empty}>Le graphique apparaîtra avec la première commande du jour.</Text>
            </>
          )}
        </View>

        <View style={styles.row2}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardTitle}>Top du jour</Text>
            {data.top.length === 0 ? (
              <Text style={styles.empty}>—</Text>
            ) : (
              data.top.map(([name, qty], i) => (
                <View key={name} style={styles.topRow}>
                  <Text style={styles.topRank}>{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.topQty}>×{qty}</Text>
                </View>
              ))
            )}
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardTitle}>Répartition</Text>
            <Text style={styles.splitLine}>🛍️ Retrait <Text style={styles.splitValue}>{data.count - data.delivery}</Text></Text>
            <Text style={styles.splitLine}>🛵 Livraison <Text style={styles.splitValue}>{data.delivery}</Text></Text>
            {data.rejected > 0 && (
              <Text style={styles.splitLine}>✗ Refusées <Text style={styles.splitValue}>{data.rejected}</Text></Text>
            )}
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 12, paddingBottom: 24 },
  greeting: { fontSize: 15, fontWeight: '600', color: INK.primary, marginBottom: 12, marginTop: 4 },
  date: { fontWeight: '400', color: INK.secondary },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
    gap: 12,
  },
  alertIcon: { fontSize: 24 },
  alertTitle: { fontSize: 16, fontWeight: '700', color: INK.primary },
  alertText: { fontSize: 13, color: INK.secondary, marginTop: 2 },
  alertAction: { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  hero: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  heroLabel: { fontSize: 13, color: INK.secondary },
  heroValue: { fontSize: 48, fontWeight: '600', color: INK.primary, marginVertical: 2, letterSpacing: -1 },
  delta: { fontSize: 13, fontWeight: '600' },
  deltaNeutral: { fontSize: 12, fontWeight: '400', color: INK.muted },
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14 },
  kpiLabel: { fontSize: 13, color: INK.secondary },
  kpiValue: { fontSize: 26, fontWeight: '600', color: INK.primary, marginVertical: 2 },
  pipeline: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  step: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  stepDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  stepValue: { fontSize: 22, fontWeight: '700', color: INK.primary },
  stepLabel: { fontSize: 12, color: INK.secondary, marginTop: 2 },
  card: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: INK.primary, marginBottom: 6 },
  link: { fontSize: 14, fontWeight: '600', color: COLORS.primary },
  empty: { fontSize: 13, color: INK.muted, paddingVertical: 8 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GRID,
    gap: 10,
  },
  queueBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  queueTitle: { fontSize: 15, fontWeight: '600', color: INK.primary },
  queueMeta: { fontSize: 12, color: INK.secondary, marginTop: 2 },
  queueAmount: { fontSize: 15, fontWeight: '600', color: INK.primary },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartHint: { fontSize: 12, color: INK.secondary },
  chart: { height: CHART_HEIGHT + 18, marginTop: 8, justifyContent: 'flex-end' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: GRID },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 18,
    borderBottomWidth: 1,
    borderBottomColor: '#D0D7DE',
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingHorizontal: 1 },
  bar: {
    width: '100%',
    maxWidth: 24,
    backgroundColor: BAR,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barValue: { fontSize: 11, fontWeight: '600', color: INK.primary, marginBottom: 2 },
  axis: { flexDirection: 'row', marginTop: 4 },
  axisLabel: { flex: 1, fontSize: 10, color: INK.muted, textAlign: 'center' },
  row2: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 },
  topRank: { width: 16, fontSize: 13, fontWeight: '700', color: INK.muted },
  topName: { flex: 1, fontSize: 13, color: INK.primary },
  topQty: { fontSize: 13, fontWeight: '600', color: INK.secondary },
  splitLine: { fontSize: 13, color: INK.secondary, paddingVertical: 3 },
  splitValue: { fontWeight: '700', color: INK.primary },
});
