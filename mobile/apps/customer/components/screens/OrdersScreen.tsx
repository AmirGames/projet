import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { DELIVERY_STATUS, reorderLines, hhmm, isActive, OrderSummary, orderStatus, shortId } from '../../lib/orders';
import { useRealtimeEvent } from '../../lib/realtime';
import type { CartLine } from '../../lib/carts';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';
import { useEffectChargement } from '../../lib/useEffectChargement';

const FILTERS = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'ACTIVE', label: 'En cours' },
  { key: 'DONE', label: 'Terminées' },
];

export default function OrdersScreen({
  token,
  onBack,
  onOpenOrder,
  onReview,
  cartLines,
  onReorder,
}: {
  token: string;
  onBack: () => void;
  onOpenOrder: (orderId: string) => void;
  onReview: (orderId: string) => void;
  /** Les lignes déjà au panier d'un commerce. */
  cartLines: (storeId: string) => CartLine[];
  /** Remet des lignes au panier de ce commerce et ouvre sa vitrine. */
  onReorder: (store: { id: string; name: string }, lines: CartLine[]) => void;
}) {
  const [reordering, setReordering] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: OrderSummary[] }>('/api/client/me/orders', token);
      setOrders(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger vos commandes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffectChargement(() => {
    load();
  }, [load]);

  useRealtimeEvent('order-update', load);
  useRealtimeEvent('delivery-update', (u: { status?: string }) => {
    if (u?.status) load();
  });
  useRealtimeEvent('reconnecte', load);

  const reorder = async (order: OrderSummary) => {
    if (!order.store) return;
    setReordering(order.id);
    try {
      const { lines, absent, added } = await reorderLines(order, cartLines(order.store.id));
      if (added > 0) onReorder({ id: order.store.id, name: order.store.name }, lines);
      if (absent.length > 0) {
        Alert.alert(
          added > 0 ? 'Certains plats manquent' : 'Rien à remettre au panier',
          `Plus disponibles aujourd’hui : ${absent.join(', ')}.`
        );
      }
    } catch (e: any) {
      Alert.alert('Commande impossible', e.message || 'Ce commerce n’est pas joignable pour le moment.');
    } finally {
      setReordering(null);
    }
  };

  const visible = orders.filter((o) =>
    filter === 'ALL' ? true : filter === 'ACTIVE' ? isActive(o) : !isActive(o)
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Mes commandes 🧾" subtitle={`${orders.length} commande${orders.length > 1 ? 's' : ''}`} onBack={onBack} />
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
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={styles.empty}>Aucune commande</Text>}
          renderItem={({ item }) => {
            const st = orderStatus(item.status);
            const date = new Date(item.createdAt);
            const deliveryStep =
              item.deliveryType === 'DELIVERY' && item.deliveryStatus && item.status !== 'REJECTED'
                ? DELIVERY_STATUS[item.deliveryStatus]
                : null;
            return (
              <TouchableOpacity style={styles.card} onPress={() => onOpenOrder(item.id)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.store?.name || 'Commerce'}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: st.color }]}>
                    <Text style={styles.badgeText}>{st.label}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {shortId(item.id)} · {date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} {hhmm(item.createdAt)} ·{' '}
                  {item.deliveryType === 'DELIVERY' ? '🛵 Livraison' : '🥡 Retrait'}
                </Text>
                {deliveryStep ? <Text style={styles.step}>{deliveryStep}</Text> : null}
                <Text style={styles.items} numberOfLines={2}>
                  {item.items
                    .map((i) => `${i.quantity}× ${i.name}${i.supplements?.length ? ` (+ ${i.supplements.map((s) => s.label).join(', ')})` : ''}`)
                    .join(', ')}
                </Text>
                <View style={styles.footer}>
                  <Text style={styles.total}>{formatEuros(item.totalAmount)}</Text>
                  {item.avisARedemander && item.status === 'COMPLETED' ? (
                    <TouchableOpacity onPress={() => onReview(item.id)}>
                      <Text style={styles.review}>⭐ Donner mon avis</Text>
                    </TouchableOpacity>
                  ) : null}
                  {item.status === 'COMPLETED' && item.store ? (
                    <TouchableOpacity onPress={() => reorder(item)} disabled={reordering === item.id}>
                      {reordering === item.id ? (
                        <ActivityIndicator color={COLORS.primary} />
                      ) : (
                        <Text style={styles.review}>🔁 Commander à nouveau</Text>
                      )}
                    </TouchableOpacity>
                  ) : null}
                </View>
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
  card: { backgroundColor: COLORS.card, borderRadius: 8, padding: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: COLORS.text, flexShrink: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  meta: { fontSize: 12, color: COLORS.muted },
  step: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  items: { fontSize: 13, color: '#555', marginTop: 6 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' },
  total: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  review: { color: COLORS.primary, fontWeight: '700' },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
