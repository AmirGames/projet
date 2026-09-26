import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { deliveryStatus, formatKm, hhmm, shortId } from '../../lib/deliveries';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface HistoryItem {
  id: string;
  orderId: string;
  status: string;
  cancellationReason?: string | null;
  store: string;
  deliveryCity: string;
  distanceKm: number | null;
  payout: number;
  deliveredAt?: string | null;
  durationMin?: number | null;
  proofType?: string | null;
  rating?: { note: number; commentaire?: string | null } | null;
  createdAt: string;
}

interface HistoryResponse {
  data: HistoryItem[];
  pagination: { page: number; pages: number; total: number };
  resume: { livrees: number; gains: number; distanceKm: number };
}

const FILTERS = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'ACTIVE', label: 'En cours' },
  { key: 'DELIVERED', label: 'Livrées' },
  { key: 'CANCELLED', label: 'Annulées' },
];

const PROOF_LABELS: Record<string, string> = { CODE: '🔢 Code', PHOTO: '📷 Photo' };

export default function HistoryScreen({
  token,
  onBack,
  onOpenDelivery,
}: {
  token: string;
  onBack: () => void;
  onOpenDelivery: (deliveryId: string) => void;
}) {
  const [filter, setFilter] = useState('ALL');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [summary, setSummary] = useState<HistoryResponse['resume'] | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (nextPage = 1) => {
      setError('');
      try {
        const res = await apiFetch<HistoryResponse>(`/api/drivers/history?filtre=${filter}&page=${nextPage}&parPage=20`, token);
        setItems((list) => (nextPage === 1 ? res.data : [...list, ...res.data]));
        setSummary(res.resume);
        setPage(res.pagination.page);
        setPages(res.pagination.pages);
      } catch (e: any) {
        setError(e.message || "Impossible de charger l'historique");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter, token]
  );

  useEffect(() => {
    setLoading(true);
    load(1);
  }, [load]);

  const more = () => {
    if (loadingMore || page >= pages) return;
    setLoadingMore(true);
    load(page + 1);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Historique 🗂️" subtitle={summary ? `${summary.livrees} course${summary.livrees > 1 ? 's' : ''} livrée${summary.livrees > 1 ? 's' : ''}` : undefined} onBack={onBack} />
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key} style={[styles.chip, filter === f.key && styles.chipActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={() => load(1)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1); }} />}
          onEndReached={more}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={
            summary ? (
              <View style={styles.summary}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{formatEuros(summary.gains)}</Text>
                  <Text style={styles.summaryLabel}>Gains</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{formatKm(summary.distanceKm)}</Text>
                  <Text style={styles.summaryLabel}>Parcourus</Text>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucune course</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.link} style={{ marginVertical: 12 }} /> : null}
          renderItem={({ item }) => {
            const st = deliveryStatus(item.status);
            const date = new Date(item.deliveredAt || item.createdAt);
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => onOpenDelivery(item.id)}
                disabled={item.status === 'CANCELLED'}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>
                    {shortId(item.orderId)} · {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} {hhmm(date.toISOString())}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: st.color }]}>
                    <Text style={styles.badgeText}>{st.label}</Text>
                  </View>
                </View>
                <Text style={styles.line} numberOfLines={1}>
                  🏪 {item.store || 'Commerce'} → 📍 {item.deliveryCity || '—'}
                </Text>
                <Text style={styles.meta}>
                  {formatKm(item.distanceKm)}
                  {item.durationMin != null ? ` · ${item.durationMin} min` : ''}
                  {item.proofType ? ` · ${PROOF_LABELS[item.proofType] || item.proofType}` : ''}
                  {item.rating ? ` · ${'★'.repeat(item.rating.note)}` : ''}
                </Text>
                {item.cancellationReason ? <Text style={styles.meta}>Motif : {item.cancellationReason}</Text> : null}
                {item.payout > 0 && <Text style={styles.payout}>{formatEuros(item.payout)}</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list: { padding: 12, paddingBottom: 24 },
  summary: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  summaryItem: { flex: 1, backgroundColor: COLORS.card, borderRadius: 10, padding: 12 },
  summaryValue: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  summaryLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  card: { backgroundColor: COLORS.card, borderRadius: 8, padding: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  line: { fontSize: 13, color: COLORS.secondary },
  meta: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  payout: { fontSize: 15, fontWeight: '600', color: COLORS.link, marginTop: 6 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
