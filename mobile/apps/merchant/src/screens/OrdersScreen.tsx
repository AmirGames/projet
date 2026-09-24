import React, { useEffect, useState } from 'react';
import {
  View,
  FlatList,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useOrderStore } from '../store/orderStore';
import { useNavigation } from '@react-navigation/native';

const STATUS_COLORS = {
  pending: '#FFA500',
  accepted: '#4CAF50',
  preparing: '#2196F3',
  ready: '#9C27B0',
  delivering: '#FF9800',
  delivered: '#4CAF50',
};

const STATUS_LABELS = {
  pending: 'En attente',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivering: 'En livraison',
  delivered: 'Livrée',
};

export function OrdersScreen() {
  const navigation = useNavigation();
  const { orders, loading, fetchOrders, error } = useOrderStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchOrders();
    });

    return unsubscribe;
  }, [navigation, fetchOrders]);

  useEffect(() => {
    if (!orders.length && !loading) {
      fetchOrders();
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const renderOrder = ({ item }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderNumber}>Commande #{item.orderNumber}</Text>
          <Text style={styles.customerName}>{item.customer.name}</Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as keyof typeof STATUS_COLORS] }]}
        >
          <Text style={styles.statusText}>{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS]}</Text>
        </View>
      </View>

      <View style={styles.orderDetails}>
        <Text style={styles.itemsCount}>{item.items.length} article(s)</Text>
        <Text style={styles.totalPrice}>{item.total.toFixed(2)} €</Text>
      </View>

      <Text style={styles.timestamp}>{new Date(item.createdAt).toLocaleTimeString('fr-FR')}</Text>
    </TouchableOpacity>
  );

  if (loading && !orders.length) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucune commande pour le moment</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 15,
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  customerName: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  itemsCount: {
    fontSize: 14,
    color: '#666',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
