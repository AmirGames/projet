import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch } from '../../lib/api';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  status: string;
  product?: { name: string } | null;
  customer?: { name?: string | null } | null;
  signalement: 'EN_ATTENTE' | 'RETIRE' | 'CONSERVE' | null;
  motifDecision?: string | null;
  peutSignaler: boolean;
}

interface Stats {
  totalReviews: number;
  averageRating: number;
  ratingBreakdown: Record<string, number>;
}

const PAGE = 20;
const stars = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

const REPORT_STATE: Record<string, { label: string; color: string }> = {
  EN_ATTENTE: { label: 'Signalé · en cours d’examen', color: '#FFA500' },
  RETIRE: { label: 'Retiré par la plateforme', color: COLORS.success },
  CONSERVE: { label: 'Conservé par la plateforme', color: '#666' },
};

export default function ReviewsScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState<Review | null>(null);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [list, s] = await Promise.all([
        apiFetch<{ data: Review[]; total: number }>(`/api/reviews/${storeId}?take=${PAGE}`, token),
        apiFetch<Stats>(`/api/reviews/${storeId}/store/stats`, token),
      ]);
      setReviews(list.data || []);
      setTotal(list.total || 0);
      setStats(s);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les avis');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (loadingMore || reviews.length >= total) return;
    setLoadingMore(true);
    try {
      const list = await apiFetch<{ data: Review[] }>(`/api/reviews/${storeId}?skip=${reviews.length}&take=${PAGE}`, token);
      setReviews((r) => [...r, ...(list.data || [])]);
    } catch {
      // On réessaiera au prochain défilement.
    } finally {
      setLoadingMore(false);
    }
  };

  const sendReport = async () => {
    if (!reporting) return;
    if (reason.trim().length < 5) {
      Alert.alert('Motif trop court', 'Expliquez en quelques mots pourquoi vous signalez cet avis.');
      return;
    }
    setSending(true);
    try {
      await apiFetch(`/api/reviews/${storeId}/${reporting.id}/report`, token, {
        method: 'POST',
        body: { reason: reason.trim() },
      });
      setReviews((list) =>
        list.map((r) => (r.id === reporting.id ? { ...r, signalement: 'EN_ATTENTE', peutSignaler: false } : r))
      );
      setReporting(null);
      setReason('');
      Alert.alert('Avis signalé', 'La plateforme va l’examiner.');
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Signalement impossible');
    } finally {
      setSending(false);
    }
  };

  const maxCount = Math.max(1, ...Object.values(stats?.ratingBreakdown || {}));

  const header = stats ? (
    <View style={styles.statsCard}>
      <View style={styles.avgBlock}>
        <Text style={styles.avg}>{stats.totalReviews ? stats.averageRating.toFixed(1) : '—'}</Text>
        <Text style={styles.avgStars}>{stars(Math.round(stats.averageRating))}</Text>
        <Text style={styles.avgCount}>{stats.totalReviews} avis</Text>
      </View>
      <View style={{ flex: 1 }}>
        {['5', '4', '3', '2', '1'].map((n) => (
          <View key={n} style={styles.barRow}>
            <Text style={styles.barLabel}>{n}★</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${((stats.ratingBreakdown[n] || 0) / maxCount) * 100}%` }]} />
            </View>
            <Text style={styles.barCount}>{stats.ratingBreakdown[n] || 0}</Text>
          </View>
        ))}
      </View>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Avis clients ⭐" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={<Text style={styles.empty}>Pas encore d’avis</Text>}
          renderItem={({ item }) => {
            const state = item.signalement ? REPORT_STATE[item.signalement] : null;
            return (
              <View style={[styles.review, item.status === 'REMOVED' && { opacity: 0.55 }]}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewStars}>{stars(item.rating)}</Text>
                  <Text style={styles.reviewDate}>{new Date(item.createdAt).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Text style={styles.reviewAuthor}>
                  {item.customer?.name || 'Client'}
                  {item.product?.name ? ` · ${item.product.name}` : ' · la boutique'}
                </Text>
                {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}
                {state ? (
                  <Text style={[styles.reportState, { color: state.color }]}>
                    {state.label}
                    {item.motifDecision ? ` — ${item.motifDecision}` : ''}
                  </Text>
                ) : null}
                {item.peutSignaler ? (
                  <TouchableOpacity onPress={() => setReporting(item)} style={styles.reportBtn}>
                    <Text style={styles.reportBtnText}>⚑ Signaler</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!reporting} transparent animationType="slide" onRequestClose={() => setReporting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Signaler cet avis</Text>
            <Text style={styles.sheetHelp}>
              Vous ne pouvez ni supprimer ni masquer un avis : la plateforme l’examine et décide.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. : propos injurieux, client jamais venu…"
              placeholderTextColor={COLORS.muted}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={1000}
            />
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bg }]} onPress={() => setReporting(null)}>
                <Text style={[styles.btnText, { color: COLORS.text }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.danger }]} onPress={sendReport} disabled={sending}>
                <Text style={styles.btnText}>{sending ? 'Envoi…' : 'Signaler'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  statsCard: { backgroundColor: COLORS.card, borderRadius: 10, padding: 16, flexDirection: 'row', marginBottom: 12, gap: 16 },
  avgBlock: { alignItems: 'center', justifyContent: 'center', minWidth: 80 },
  avg: { fontSize: 36, fontWeight: 'bold', color: COLORS.text },
  avgStars: { color: '#F5A623', fontSize: 14 },
  avgCount: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  barLabel: { width: 26, fontSize: 12, color: '#666' },
  barTrack: { flex: 1, height: 8, backgroundColor: COLORS.bg, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#F5A623' },
  barCount: { width: 28, textAlign: 'right', fontSize: 12, color: '#666' },
  review: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8 },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewStars: { color: '#F5A623', fontSize: 16 },
  reviewDate: { color: COLORS.muted, fontSize: 12 },
  reviewAuthor: { fontSize: 13, color: '#666', marginTop: 4 },
  reviewComment: { fontSize: 14, color: COLORS.text, marginTop: 6, lineHeight: 20 },
  reportState: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  reportBtn: { alignSelf: 'flex-end', marginTop: 6, paddingVertical: 4 },
  reportBtnText: { color: COLORS.danger, fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.text },
  sheetHelp: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 12 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
