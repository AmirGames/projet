import React from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatEuros } from '../../lib/api';
import { Cart, cartTotal, itemCount } from '../../lib/carts';
import { COLORS } from '../ui';

/** Un panier par commerce : on commande l'un, les autres attendent. */
export default function CartsScreen({
  header,
  carts,
  onCheckout,
  onOpenStore,
  onClear,
  onBrowse,
}: {
  header: React.ReactNode;
  carts: Cart[];
  onCheckout: (storeId: string) => void;
  onOpenStore: (storeId: string) => void;
  onClear: (storeId: string) => void;
  onBrowse: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      {header}
      <FlatList
        data={carts}
        keyExtractor={(c) => c.storeId}
        contentContainerStyle={carts.length ? styles.list : styles.emptyContainer}
        ListEmptyComponent={
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.emptyIcon}>🛒</Text>
            <Text style={styles.emptyText}>Aucun panier en cours</Text>
            <Text style={styles.emptyHint}>Ajoutez des plats depuis la vitrine d’un commerce.</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={onBrowse}>
              <Text style={styles.emptyButtonText}>Voir les commerces</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const count = itemCount(item.lines);
          return (
            <View style={styles.card}>
              <TouchableOpacity onPress={() => onOpenStore(item.storeId)}>
                <Text style={styles.store}>🏪 {item.storeName || 'Commerce'} ›</Text>
              </TouchableOpacity>
              {item.lines.map((l) => (
                <Text key={`${l.productId}:${l.variantId || ''}`} style={styles.line} numberOfLines={1}>
                  {l.quantity}× {l.name}
                  {l.variantName ? ` · ${l.variantName}` : ''}
                </Text>
              ))}
              <View style={styles.footer}>
                <Text style={styles.total}>
                  {count} article{count > 1 ? 's' : ''} · {formatEuros(cartTotal(item.lines))}
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Vider le panier', item.storeName, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Vider', style: 'destructive', onPress: () => onClear(item.storeId) },
                    ])
                  }
                >
                  <Text style={styles.clear}>Vider</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.order} onPress={() => onCheckout(item.storeId)}>
                <Text style={styles.orderText}>Commander</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emptyIcon: { fontSize: 48, marginBottom: 8 },
  emptyText: { fontSize: 16, color: COLORS.muted },
  emptyHint: { fontSize: 13, color: COLORS.muted, marginTop: 6, textAlign: 'center' },
  emptyButton: { marginTop: 16, backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  emptyButtonText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 12 },
  store: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 6 },
  line: { fontSize: 14, color: '#555', paddingVertical: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  total: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  clear: { color: COLORS.danger, fontWeight: '600' },
  order: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  orderText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
