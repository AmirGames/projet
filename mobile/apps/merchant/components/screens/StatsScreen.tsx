import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

type Period = 'today' | '7d' | '30d';

const PERIODS: { key: Period; label: string; days: number; previous: string; short: string }[] = [
  { key: 'today', label: "Aujourd'hui", days: 1, previous: 'hier à la même heure', short: 'hier' },
  { key: '7d', label: '7 jours', days: 7, previous: 'les 7 jours d’avant', short: '7 j avant' },
  { key: '30d', label: '30 jours', days: 30, previous: 'les 30 jours d’avant', short: '30 j avant' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptées',
  PREPARING: 'En préparation',
  READY: 'Prêtes',
  COMPLETED: 'Terminées',
  DELIVERED: 'Livrées',
  REJECTED: 'Refusées',
  CANCELLED: 'Annulées',
};

const EXCLUDED = ['REJECTED', 'CANCELLED'];
const INK = { primary: '#1F2328', secondary: '#57606A', muted: '#8C959F' };
const GOOD = '#1A7F37';
const BAD = '#CF222E';
const GRID = '#E6E8EB';
const CHART_HEIGHT = 140;
const DAY = 86_400_000;

interface ReportOrder {
  status: string;
  totalAmount: number | string;
  createdAt: string;
}

interface SalesReport {
  statusBreakdown?: Record<string, number>;
  orders?: ReportOrder[];
}

interface ProductPerf {
  id: string;
  name: string;
  totalSold: number;
  totalRevenue: number;
}

interface Bucket {
  key: string;
  label: string;
  tooltip: string;
  revenue: number;
  count: number;
}

const amount = (o: ReportOrder) => parseFloat(String(o.totalAmount)) || 0;
const valid = (list: ReportOrder[] = []) => list.filter((o) => !EXCLUDED.includes((o.status || '').toUpperCase()));

function startOf(period: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const days = PERIODS.find((p) => p.key === period)!.days;
  d.setDate(d.getDate() - (days - 1));
  return d;
}

/** Montant court pour les étiquettes du graphique : 1 234 € → 1,2 k€. */
function compactEuros(v: number) {
  if (v >= 1000) return `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`;
  return `${Math.round(v)} €`;
}

function buckets(period: Period, orders: ReportOrder[]): Bucket[] {
  if (period === 'today') {
    const now = new Date().getHours();
    const byHour = new Array(24).fill(null).map(() => ({ revenue: 0, count: 0 }));
    for (const o of orders) {
      const h = new Date(o.createdAt).getHours();
      byHour[h].revenue += amount(o);
      byHour[h].count += 1;
    }
    const hours = byHour.map((b, h) => (b.count ? h : -1)).filter((h) => h >= 0);
    const start = Math.min(hours[0] ?? now, 11, now);
    const end = Math.max(hours[hours.length - 1] ?? now, now);
    const out: Bucket[] = [];
    for (let h = start; h <= end; h++) {
      out.push({ key: String(h), label: `${h}h`, tooltip: `${h}h–${h + 1}h`, ...byHour[h] });
    }
    return out;
  }

  const days = PERIODS.find((p) => p.key === period)!.days;
  const start = startOf(period);
  const out: Bucket[] = [];
  const index = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const key = d.toDateString();
    const b: Bucket = {
      key,
      label: days <= 7 ? d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '') : String(d.getDate()),
      tooltip: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
      revenue: 0,
      count: 0,
    };
    out.push(b);
    index.set(key, b);
  }
  for (const o of orders) {
    const b = index.get(new Date(o.createdAt).toDateString());
    if (b) {
      b.revenue += amount(o);
      b.count += 1;
    }
  }
  return out;
}

function Delta({ now, before, previous }: { now: number; before: number; previous: string }) {
  if (before <= 0) return <Text style={styles.deltaNeutral}>{now > 0 ? `Aucune vente ${previous}` : '—'}</Text>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <Text style={styles.deltaNeutral}>= identique à {previous}</Text>;
  const up = pct > 0;
  return (
    <Text style={[styles.delta, { color: up ? GOOD : BAD }]}>
      {up ? '▲ +' : '▼ '}
      {pct} %<Text style={styles.deltaNeutral}> vs {previous}</Text>
    </Text>
  );
}

function RevenueChart({ data, title }: { data: Bucket[]; title: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((b) => b.revenue));
  const peak = data.reduce((best, b) => (b.revenue > best.revenue ? b : best), data[0]);
  const current = data.find((b) => b.key === selected);
  const labelEvery = Math.ceil(data.length / 7);

  return (
    <View>
      <View style={styles.chartHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.chartHint}>
        {current
          ? `${current.tooltip} · ${formatEuros(current.revenue)} · ${current.count} commande${current.count > 1 ? 's' : ''}`
          : 'Touchez une barre pour le détail'}
      </Text>
      <View style={styles.chart}>
        <Text style={[styles.gridLabel, { bottom: CHART_HEIGHT + 2 }]}>{compactEuros(max)}</Text>
        <View style={[styles.gridLine, { bottom: CHART_HEIGHT }]} />
        <View style={[styles.gridLine, { bottom: CHART_HEIGHT / 2 }]} />
        <View style={styles.bars}>
          {data.map((b) => {
            const height = b.revenue ? Math.max(3, (b.revenue / max) * CHART_HEIGHT) : 0;
            const dim = selected !== null && selected !== b.key;
            return (
              <TouchableOpacity
                key={b.key}
                style={styles.slot}
                activeOpacity={0.7}
                onPress={() => setSelected(selected === b.key ? null : b.key)}
                accessibilityLabel={`${b.tooltip} : ${formatEuros(b.revenue)}`}
              >
                <View style={[styles.bar, { height, opacity: dim ? 0.35 : 1 }]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.axis}>
        {data.map((b, i) => (
          <Text key={b.key} style={[styles.axisLabel, b.key === peak?.key && peak.revenue > 0 && styles.axisPeak]}>
            {i % labelEvery === 0 || i === data.length - 1 ? b.label : ''}
          </Text>
        ))}
      </View>
      {peak && peak.revenue > 0 && (
        <Text style={styles.peak}>
          Meilleur {data.length > 1 && data[0].label.endsWith('h') ? 'créneau' : 'jour'} : {peak.tooltip} ·{' '}
          {formatEuros(peak.revenue)}
        </Text>
      )}
    </View>
  );
}

export default function StatsScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('7d');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [previous, setPrevious] = useState<ReportOrder[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const start = startOf(period);
      const span = PERIODS.find((p) => p.key === period)!.days * DAY;
      // Même durée juste avant, arrêtée à la même heure pour « aujourd'hui ».
      const prevStart = new Date(start.getTime() - span);
      const prevEnd = period === 'today' ? new Date(Date.now() - DAY) : new Date(start.getTime() - 1);
      const q = (s: Date, e?: Date) =>
        `/api/reports/sales?storeId=${storeId}&startDate=${encodeURIComponent(s.toISOString())}${
          e ? `&endDate=${encodeURIComponent(e.toISOString())}` : ''
        }`;
      const [sales, prev, perf] = await Promise.all([
        apiFetch<SalesReport>(q(start), token),
        apiFetch<SalesReport>(q(prevStart, prevEnd), token),
        apiFetch<{ products: ProductPerf[] }>(`/api/reports/products/${storeId}`, token),
      ]);
      setReport(sales);
      setPrevious(valid(prev.orders));
      setTopProducts((perf.products || []).filter((p) => p.totalSold > 0).slice(0, 5));
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les statistiques');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, storeId, token]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const stats = useMemo(() => {
    const orders = valid(report?.orders);
    const revenue = orders.reduce((s, o) => s + amount(o), 0);
    const prevRevenue = previous.reduce((s, o) => s + amount(o), 0);
    return {
      orders,
      revenue,
      prevRevenue,
      count: orders.length,
      prevCount: previous.length,
      avg: orders.length ? revenue / orders.length : 0,
      prevAvg: previous.length ? prevRevenue / previous.length : 0,
      refused: (report?.orders?.length || 0) - orders.length,
      chart: buckets(period, orders),
    };
  }, [report, previous, period]);

  const periodInfo = PERIODS.find((p) => p.key === period)!;
  const breakdown = Object.entries(report?.statusBreakdown || {}).filter(([, n]) => n > 0);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Statistiques 📊" onBack={onBack} />

      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.period, period === p.key && styles.periodActive]}
            onPress={() => setPeriod(p.key)}
          >
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={ui.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Chiffre d'affaires</Text>
            <Text style={styles.heroValue}>{formatEuros(stats.revenue)}</Text>
            <Delta now={stats.revenue} before={stats.prevRevenue} previous={periodInfo.previous} />
          </View>

          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Commandes</Text>
              <Text style={styles.kpiValue}>{stats.count}</Text>
              <Delta now={stats.count} before={stats.prevCount} previous={periodInfo.short} />
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>Panier moyen</Text>
              <Text style={styles.kpiValue}>{formatEuros(stats.avg)}</Text>
              <Delta now={stats.avg} before={stats.prevAvg} previous={periodInfo.short} />
            </View>
          </View>

          <Card>
            {stats.count ? (
              <RevenueChart
                key={period}
                data={stats.chart}
                title={period === 'today' ? "Chiffre d'affaires par heure" : "Chiffre d'affaires par jour"}
              />
            ) : (
              <>
                <Text style={styles.cardTitle}>Chiffre d'affaires</Text>
                <Text style={styles.empty}>Aucune vente sur la période.</Text>
              </>
            )}
          </Card>

          <Card title="Commandes par statut">
            {breakdown.length === 0 ? (
              <Text style={styles.empty}>Aucune commande sur la période</Text>
            ) : (
              breakdown.map(([status, count], i) => (
                <Row key={status} label={STATUS_LABELS[status] || status} value={count} last={i === breakdown.length - 1} />
              ))
            )}
            {stats.refused > 0 && (
              <Text style={styles.footnote}>Les commandes refusées ou annulées ne comptent pas dans le chiffre d'affaires.</Text>
            )}
          </Card>

          <Card title="Meilleures ventes (depuis l'ouverture)">
            {topProducts.length === 0 ? (
              <Text style={styles.empty}>Pas encore de ventes</Text>
            ) : (
              topProducts.map((p, i) => (
                <Row
                  key={p.id}
                  label={`${i + 1}. ${p.name}`}
                  value={`${p.totalSold} vendus · ${formatEuros(p.totalRevenue)}`}
                  last={i === topProducts.length - 1}
                />
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  periods: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
  period: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  periodActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  periodTextActive: { color: '#fff', fontWeight: '600' },
  hero: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16, marginBottom: 12 },
  heroLabel: { fontSize: 13, color: INK.secondary },
  heroValue: { fontSize: 44, fontWeight: '600', color: INK.primary, marginVertical: 2, letterSpacing: -1 },
  delta: { fontSize: 13, fontWeight: '600' },
  deltaNeutral: { fontSize: 12, fontWeight: '400', color: INK.muted },
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: COLORS.card, borderRadius: 12, padding: 14 },
  kpiLabel: { fontSize: 13, color: INK.secondary },
  kpiValue: { fontSize: 24, fontWeight: '600', color: INK.primary, marginVertical: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: INK.primary },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartHint: { fontSize: 12, color: INK.secondary, marginTop: 4, minHeight: 16 },
  chart: { height: CHART_HEIGHT + 16, marginTop: 6, justifyContent: 'flex-end' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: GRID },
  gridLabel: { position: 'absolute', right: 0, fontSize: 10, color: INK.muted, backgroundColor: COLORS.card, paddingLeft: 4 },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#D0D7DE',
  },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingHorizontal: 1 },
  bar: {
    width: '100%',
    maxWidth: 24,
    backgroundColor: COLORS.primary,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  axis: { flexDirection: 'row', marginTop: 4 },
  axisLabel: { flex: 1, fontSize: 10, color: INK.muted, textAlign: 'center' },
  axisPeak: { color: INK.primary, fontWeight: '700' },
  peak: { fontSize: 12, color: INK.secondary, marginTop: 10 },
  empty: { color: COLORS.muted, fontSize: 13, paddingVertical: 8 },
  footnote: { fontSize: 12, color: INK.muted, marginTop: 8 },
});
