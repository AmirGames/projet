import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

type Period = 'today' | '7d' | '30d';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: '7d', label: '7 jours' },
  { key: '30d', label: '30 jours' },
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptées',
  PREPARING: 'En préparation',
  READY: 'Prêtes',
  COMPLETED: 'Livrées',
  DELIVERED: 'Livrées',
  REJECTED: 'Refusées',
  CANCELLED: 'Annulées',
};

function startOf(period: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === '7d') d.setDate(d.getDate() - 6);
  if (period === '30d') d.setDate(d.getDate() - 29);
  return d;
}

interface SalesReport {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  statusBreakdown?: Record<string, number>;
}

interface ProductPerf {
  id: string;
  name: string;
  totalSold: number;
  totalRevenue: number;
}

export default function StatsScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('today');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [topProducts, setTopProducts] = useState<ProductPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const startDate = startOf(period).toISOString();
      const [sales, perf] = await Promise.all([
        apiFetch<SalesReport>(`/api/reports/sales?storeId=${storeId}&startDate=${encodeURIComponent(startDate)}`, token),
        apiFetch<{ products: ProductPerf[] }>(`/api/reports/products/${storeId}`, token),
      ]);
      setReport(sales);
      setTopProducts((perf.products || []).filter((p) => p.totalSold > 0).slice(0, 5));
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les statistiques');
    } finally {
      setLoading(false);
    }
  }, [period, storeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const breakdown = Object.entries(report?.statusBreakdown || {}).filter(([, n]) => n > 0);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Statistiques" onBack={onBack} />

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
        <ScrollView contentContainerStyle={ui.content}>
          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{formatEuros(report?.totalRevenue)}</Text>
              <Text style={styles.kpiLabel}>Chiffre d'affaires</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{report?.totalOrders ?? 0}</Text>
              <Text style={styles.kpiLabel}>Commandes</Text>
            </View>
          </View>
          <View style={styles.kpis}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{formatEuros(report?.averageOrderValue)}</Text>
              <Text style={styles.kpiLabel}>Panier moyen</Text>
            </View>
          </View>

          <Card title="Commandes par statut">
            {breakdown.length === 0 ? (
              <Text style={styles.empty}>Aucune commande sur la période</Text>
            ) : (
              breakdown.map(([status, count], i) => (
                <Row key={status} label={STATUS_LABELS[status] || status} value={count} last={i === breakdown.length - 1} />
              ))
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
  kpis: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  kpi: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 16, alignItems: 'center' },
  kpiValue: { fontSize: 22, fontWeight: 'bold', color: COLORS.primary, marginBottom: 4 },
  kpiLabel: { fontSize: 12, color: '#666' },
  empty: { color: COLORS.muted, fontSize: 13, paddingVertical: 8 },
});
