import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface Ratings {
  moyenne: number | null;
  avis: number;
  notes: { id: string; note: number; commentaire?: string | null; createdAt: string }[];
}

const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

/** Ce que les clients disent des courses — jamais qui le dit. */
export default function ReviewsScreen({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<Ratings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: Ratings }>('/api/drivers/ratings', token);
      setData(res.data);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les avis');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Mes avis ⭐" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={data?.notes || []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <View style={styles.summary}>
              <Text style={styles.average}>
                {data?.moyenne != null ? data.moyenne.toFixed(1).replace('.', ',') : '—'}
              </Text>
              <Text style={styles.summaryStars}>{data?.moyenne != null ? stars(Math.round(data.moyenne)) : ''}</Text>
              <Text style={styles.count}>
                {data?.avis ? `${data.avis} avis client${data.avis > 1 ? 's' : ''}` : 'Pas encore noté'}
              </Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>Les clients pourront vous noter après chaque course livrée.</Text>}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemStars}>{stars(item.note)}</Text>
                <Text style={styles.itemDate}>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
              </View>
              {item.commentaire ? <Text style={styles.comment}>« {item.commentaire} »</Text> : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  summary: { backgroundColor: COLORS.card, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 12 },
  average: { fontSize: 48, fontWeight: '700', color: COLORS.text },
  summaryStars: { fontSize: 22, color: '#F5A623', marginTop: 2 },
  count: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  item: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemStars: { fontSize: 16, color: '#F5A623' },
  itemDate: { fontSize: 12, color: COLORS.muted },
  comment: { fontSize: 14, color: COLORS.text, marginTop: 6, lineHeight: 20 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 24, paddingHorizontal: 24 },
});
