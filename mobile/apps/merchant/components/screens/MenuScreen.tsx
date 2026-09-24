import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, SectionList, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  isAvailable: boolean;
  status?: string;
  category?: { id: string; name: string; displayOrder?: number } | null;
}

export default function MenuScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiFetch<{ products: Product[] }>(`/api/products/store/${storeId}?limit=500`, token);
      setProducts(data.products || []);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger le menu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Un produit passé épuisé depuis un autre appareil se met à jour ici.
  useRealtimeEvent('produit-disponibilite', (e: { productId: string; storeId: string; isAvailable: boolean }) => {
    if (e.storeId !== storeId) return;
    setProducts((list) => list.map((p) => (p.id === e.productId ? { ...p, isAvailable: e.isAvailable } : p)));
  });
  useRealtimeEvent('reconnecte', load);

  const toggleAvailability = async (product: Product) => {
    const next = !product.isAvailable;
    setPending((p) => ({ ...p, [product.id]: true }));
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, isAvailable: next } : p)));
    try {
      await apiFetch(`/api/products/${product.id}/availability`, token, {
        method: 'PATCH',
        body: { isAvailable: next, storeId },
      });
    } catch (e: any) {
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, isAvailable: !next } : p)));
      Alert.alert('Erreur', e.message || 'Impossible de modifier la disponibilité');
    } finally {
      setPending((p) => ({ ...p, [product.id]: false }));
    }
  };

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const groups = new Map<string, { title: string; order: number; data: Product[] }>();
    for (const p of products) {
      if (q && !p.name.toLowerCase().includes(q)) continue;
      const key = p.category?.id || '_none';
      if (!groups.has(key)) {
        groups.set(key, {
          title: p.category?.name || 'Sans catégorie',
          order: p.category ? p.category.displayOrder ?? 0 : Number.MAX_SAFE_INTEGER,
          data: [],
        });
      }
      groups.get(key)!.data.push(p);
    }
    return [...groups.values()].sort((a, b) => a.order - b.order);
  }, [products, search]);

  const soldOut = products.filter((p) => !p.isAvailable).length;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Menu 🍕"
        subtitle={`${products.length} produits${soldOut ? ` · ${soldOut} épuisé${soldOut > 1 ? 's' : ''}` : ''}`}
        onBack={onBack}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <TextInput
              style={styles.search}
              placeholder="Rechercher un produit"
              placeholderTextColor={COLORS.muted}
              value={search}
              onChangeText={setSearch}
            />
          }
          renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
          renderItem={({ item }) => (
            <View style={[styles.item, !item.isAvailable && styles.itemOff]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.name, !item.isAvailable && styles.nameOff]}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>
                ) : null}
                <Text style={styles.price}>
                  {formatEuros(item.price)}
                  {!item.isAvailable ? '  ·  Épuisé' : ''}
                  {item.status && item.status !== 'PUBLISHED' ? '  ·  Non publié' : ''}
                </Text>
              </View>
              <Switch
                value={item.isAvailable}
                onValueChange={() => toggleAvailability(item)}
                disabled={!!pending[item.id]}
                trackColor={{ true: COLORS.success, false: '#ccc' }}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{search ? 'Aucun produit trouvé' : 'Aucun produit dans le menu'}</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  search: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  item: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemOff: { opacity: 0.6 },
  name: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  nameOff: { textDecorationLine: 'line-through' },
  desc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  price: { fontSize: 13, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
