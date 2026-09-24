import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useOrderStore } from '../store/orderStore';

const STATUS_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'delivering', 'delivered'];

const STATUS_LABELS = {
  pending: 'En attente',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivering: 'En livraison',
  delivered: 'Livrée',
};

export function OrderDetailScreen({ route }) {
  const { orderId } = route.params;
  const { selectedOrder, fetchOrderDetail, updateOrderStatus, loading } = useOrderStore();
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchOrderDetail(orderId);
  }, [orderId]);

  const handleStatusChange = async (newStatus: string) => {
    Alert.alert('Confirmation', `Passer la commande à "${STATUS_LABELS[newStatus as keyof typeof STATUS_LABELS]}"?`, [
      { text: 'Annuler', onPress: () => {} },
      {
        text: 'Confirmer',
        onPress: async () => {
          setUpdating(true);
          try {
            await updateOrderStatus(orderId, newStatus);
            Alert.alert('Succès', 'Statut mis à jour');
          } catch (error) {
            Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
          } finally {
            setUpdating(false);
          }
        },
      },
    ]);
  };

  if (loading || !selectedOrder) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const currentStatusIndex = STATUS_FLOW.indexOf(selectedOrder.status);
  const nextStatuses = STATUS_FLOW.slice(currentStatusIndex + 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Commande</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Numéro:</Text>
          <Text style={styles.value}>#{selectedOrder.orderNumber}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Client:</Text>
          <Text style={styles.value}>{selectedOrder.customer.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Téléphone:</Text>
          <Text style={styles.value}>{selectedOrder.customer.phone}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Statut:</Text>
          <Text style={styles.status}>{STATUS_LABELS[selectedOrder.status as keyof typeof STATUS_LABELS]}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Articles</Text>
        {selectedOrder.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQuantity}>Quantité: {item.quantity}</Text>
            </View>
            <Text style={styles.itemPrice}>{(item.price * item.quantity).toFixed(2)} €</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Total:</Text>
          <Text style={styles.totalPrice}>{selectedOrder.total.toFixed(2)} €</Text>
        </View>
        {selectedOrder.deliveryAddress && (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Adresse:</Text>
            <Text style={styles.value}>{selectedOrder.deliveryAddress}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Action</Text>
        <View style={styles.actionButtons}>
          {nextStatuses.map((status) => (
            <TouchableOpacity
              key={status}
              style={styles.actionButton}
              onPress={() => handleStatusChange(status)}
              disabled={updating}
            >
              <Text style={styles.actionButtonText}>{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 15,
    gap: 15,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  status: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  itemQuantity: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  totalPrice: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '700',
  },
  actionButtons: {
    gap: 10,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
