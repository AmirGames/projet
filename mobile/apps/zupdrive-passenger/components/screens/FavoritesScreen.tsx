import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { formatRating, Store } from '../../lib/stores';
import { CouvertureCommerce } from '../CouvertureCommerce';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface Favorite {
  id: string;
  storeId: string;
  store: Store;
}

export default function FavoritesScreen({
  token,
  onBack,
  onOpenStore,
}: {
  token: string;
  onBack: () => void;
  onOpenStore: (storeId: string) => void;
}) {
  const [items, setItems] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: Favorite[] }>('/api/client/me/favorites', token);
      setItems((res.data || []).filter((f) => f.store));
    } catch (e: any) {
      setError(e.message || 'Impossible de charger vos favoris');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = (storeId: string) => {
    setItems((list) => list.filter((f) => f.storeId !== storeId));
    apiFetch(`/api/client/me/favorites/${storeId}`, token, { method: 'DELETE' }).catch(load);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Favoris ❤️" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🤍</Text>
              <Text style={styles.emptyText}>Aucun favori</Text>
              <Text style={styles.emptyHint}>Touchez le cœur d’une vitrine pour la retrouver ici.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpenStore(item.storeId)} activeOpacity={0.85}>
              {/* La même carte photo que l'accueil, le cœur posé dessus. */}
              <CouvertureCommerce store={item.store} hauteur={130}>
                <TouchableOpacity
                  onPress={() => remove(item.storeId)}
                  hitSlop={10}
                  style={styles.coeur}
                  accessibilityLabel={`Retirer ${item.store.name} des favoris`}
                >
                  <Text style={{ fontSize: 18 }}>❤️</Text>
                </TouchableOpacity>
              </CouvertureCommerce>
              <Text style={styles.name} numberOfLines={1}>
                {item.store.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[formatRating(item.store.rating, item.store.totalRatings), item.store.city].filter(Boolean).join(' · ') || ' '}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  card: { marginBottom: 18 },
  coeur: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 8 },
  meta: { fontSize: 13, color: '#6B6B6B', marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 16, color: COLORS.muted },
  emptyHint: { fontSize: 13, color: COLORS.muted, marginTop: 6, textAlign: 'center' },
});
