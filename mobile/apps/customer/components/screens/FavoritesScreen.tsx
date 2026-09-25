import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { formatRating, Store, storeLogo } from '../../lib/stores';
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
          renderItem={({ item }) => {
            const logo = storeLogo(item.store);
            return (
              <TouchableOpacity style={styles.card} onPress={() => onOpenStore(item.storeId)}>
                <View style={styles.logoBox}>
                  {logo ? <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" /> : <Text style={{ fontSize: 26 }}>🍽️</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.store.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[formatRating(item.store.rating, item.store.totalRatings), item.store.city].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => remove(item.storeId)} hitSlop={10}>
                  <Text style={{ fontSize: 22 }}>❤️</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: 48, height: 48 },
  name: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  empty: { alignItems: 'center', marginTop: 50 },
  emptyIcon: { fontSize: 44, marginBottom: 8 },
  emptyText: { fontSize: 16, color: COLORS.muted },
  emptyHint: { fontSize: 13, color: COLORS.muted, marginTop: 6, textAlign: 'center' },
});
