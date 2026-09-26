import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Cart, cartTotal, itemCount } from '../../lib/carts';
import type { DeliveryAddress } from '../../lib/session';
import { Famille, formatKm, formatRating, Store, storeLogo } from '../../lib/stores';
import { COLORS, ErrorBox, Loading } from '../ui';

const SORTS = [
  { key: 'rating', label: '⭐ Mieux notés' },
  { key: 'distance', label: '📍 Plus proches' },
  { key: 'delivery', label: '🛵 Livraison la moins chère' },
];

/** Les frais qui s'appliquent vraiment : ceux de la zone, sinon le forfait. */
const feeOf = (store: Store) =>
  store.livraison ? (store.livraison.livrable ? store.livraison.frais : Infinity) : Number(store.deliveryCost || 0);

export default function HomeScreen({
  header,
  address,
  carts,
  onChangeAddress,
  onOpenStore,
  onOpenCart,
}: {
  header: React.ReactNode;
  address: DeliveryAddress | null;
  carts: Cart[];
  onChangeAddress: () => void;
  onOpenStore: (store: Store) => void;
  onOpenCart: (storeId: string) => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [famille, setFamille] = useState<string | null>(null);
  const [sort, setSort] = useState('rating');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<{ data: { familles: Famille[] } }>('/api/stores/types', null)
      .then((res) => setFamilles(res.data?.familles || []))
      .catch(() => undefined);
  }, []);

  // Proches de l'adresse (avec les frais jusqu'à elle), ou tous faute de coordonnées.
  const load = useCallback(async () => {
    setError('');
    try {
      const path =
        address?.latitude != null && address?.longitude != null
          ? `/api/client/stores/nearby?latitude=${address.latitude}&longitude=${address.longitude}&maxDistance=10`
          : '/api/client/stores';
      const res = await apiFetch<{ data: Store[] }>(path, null);
      setStores(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les commerces');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address?.latitude, address?.longitude]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = stores.filter(
      (s) =>
        (!famille || s.famille === famille) &&
        (!q || [s.name, s.description, s.genreLibelle, s.city].some((v) => v?.toLowerCase().includes(q)))
    );
    if (sort === 'rating') list.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    else if (sort === 'distance') list.sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    else list.sort((a, b) => feeOf(a) - feeOf(b));
    // Quel que soit le tri, celles qui livrent à l'adresse passent devant (tri stable).
    list.sort((a, b) => Number(b.livraison?.livrable !== false) - Number(a.livraison?.livrable !== false));
    return list;
  }, [stores, famille, sort, search]);

  const listHeader = (
    <View>
      <TouchableOpacity style={styles.address} onPress={onChangeAddress}>
        <Text style={styles.addressIcon}>📍</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.addressLabel}>Livrer à</Text>
          <Text style={styles.addressText} numberOfLines={1}>
            {address?.label || 'Choisir mon adresse'}
          </Text>
        </View>
        <Text style={styles.addressChange}>Modifier</Text>
      </TouchableOpacity>

      <TextInput
        style={styles.search}
        placeholder="🔍  Rechercher un commerce, un plat…"
        placeholderTextColor="#999"
        value={search}
        onChangeText={setSearch}
        returnKeyType="search"
      />

      {familles.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.familles}>
          {familles.map((f) => {
            const active = famille === f.code;
            return (
              <TouchableOpacity
                key={f.code}
                style={[styles.famille, active && styles.familleActive]}
                onPress={() => setFamille(active ? null : f.code)}
              >
                <Text style={styles.familleEmoji}>{f.emoji}</Text>
                <Text style={[styles.familleText, active && styles.familleTextActive]} numberOfLines={1}>
                  {f.libelle}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {carts.length > 0 && (
        <View style={styles.cartsBlock}>
          <Text style={styles.sectionTitle}>Paniers en cours</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {carts.map((cart) => (
              <TouchableOpacity key={cart.storeId} style={styles.cartCard} onPress={() => onOpenCart(cart.storeId)}>
                <Text style={styles.cartStore} numberOfLines={1}>
                  🛒 {cart.storeName || 'Commerce'}
                </Text>
                <Text style={styles.cartMeta}>
                  {itemCount(cart.lines)} article{itemCount(cart.lines) > 1 ? 's' : ''} · {formatEuros(cartTotal(cart.lines))}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts}>
        {SORTS.map((s) => (
          <TouchableOpacity key={s.key} style={[styles.chip, sort === s.key && styles.chipActive]} onPress={() => setSort(s.key)}>
            <Text style={[styles.chipText, sort === s.key && styles.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>
        {visible.length} commerce{visible.length > 1 ? 's' : ''}
        {address?.latitude != null ? ' autour de vous' : ''}
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {header}
      {loading ? (
        <Loading />
      ) : error && stores.length === 0 ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏪</Text>
              <Text style={styles.emptyText}>Aucun commerce ne correspond</Text>
              {famille || search ? (
                <TouchableOpacity onPress={() => { setFamille(null); setSearch(''); }}>
                  <Text style={styles.reset}>Voir tous les commerces</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          renderItem={({ item }) => <StoreCard store={item} onPress={() => onOpenStore(item)} />}
        />
      )}
    </View>
  );
}

function StoreCard({ store, onPress }: { store: Store; onPress: () => void }) {
  const logo = storeLogo(store);
  const open = store.isOpenNow !== false && store.isOpen !== false;
  const rating = formatRating(store.rating, store.totalRatings);
  const liv = store.livraison;
  const delivery = liv
    ? liv.livrable
      ? `🛵 ${liv.frais > 0 ? formatEuros(liv.frais) : 'Livraison offerte'}${liv.minimum > 0 ? ` · min. ${formatEuros(liv.minimum)}` : ''}`
      : '🥡 Retrait sur place uniquement'
    : Number(store.deliveryCost || 0) > 0
      ? `🛵 ${formatEuros(store.deliveryCost)}`
      : null;

  return (
    <TouchableOpacity style={[styles.card, !open && { opacity: 0.6 }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.logoBox}>
        {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : <Text style={styles.logoFallback}>🍽️</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {store.name}
          </Text>
          {!open && (
            <View style={styles.closed}>
              <Text style={styles.closedText}>Fermé</Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {[store.genreLibelle, store.city].filter(Boolean).join(' · ') || ' '}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[rating || 'Nouveau', formatKm(store.distance), liv?.deliveryMinutes ? `${liv.deliveryMinutes} min` : '']
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {delivery ? <Text style={styles.delivery}>{delivery}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  address: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  addressIcon: { fontSize: 22, marginRight: 10 },
  addressLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', textTransform: 'uppercase' },
  addressText: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  addressChange: { color: COLORS.primary, fontWeight: '600', marginLeft: 10 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 10,
  },
  familles: { gap: 6, paddingBottom: 6 },
  famille: { width: 76, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  familleActive: { backgroundColor: '#EAF3FF', borderWidth: 1, borderColor: COLORS.primary },
  familleEmoji: { fontSize: 30 },
  familleText: { fontSize: 12, color: '#555', marginTop: 4, paddingHorizontal: 2 },
  familleTextActive: { color: COLORS.primary, fontWeight: '700' },
  cartsBlock: { marginTop: 6, marginBottom: 4 },
  cartCard: { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 10, minWidth: 170, maxWidth: 230 },
  cartStore: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  cartMeta: { fontSize: 12, color: '#2E7D32', marginTop: 3 },
  sorts: { gap: 8, paddingVertical: 10 },
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
  sectionTitle: { fontSize: 11, fontWeight: '600', color: COLORS.muted, textTransform: 'uppercase', marginBottom: 8 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 12,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 60, height: 60 },
  logoFallback: { fontSize: 30 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, flexShrink: 1 },
  closed: { backgroundColor: '#9E9E9E', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  closedText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  delivery: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 15, color: COLORS.muted },
  reset: { color: COLORS.primary, fontWeight: '600', marginTop: 12 },
});
