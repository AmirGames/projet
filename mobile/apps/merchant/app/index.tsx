import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList, ScrollView, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API_URL = 'http://192.168.0.80:3001';

const STATUS_LABELS = {
  pending: 'En attente',
  accepted: 'Acceptée',
  preparing: 'En préparation',
  rejected: 'Refusée',
  ready: 'Prête',
  completed: 'Livrée',
};

const STATUS_COLORS = {
  pending: '#FFA500',
  accepted: '#4CAF50',
  preparing: '#2196F3',
  rejected: '#F44336',
  ready: '#9C27B0',
  completed: '#4CAF50',
};

export default function MerchantApp() {
  const [screen, setScreen] = useState('login');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [accessToken, setAccessToken] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [storeId, setStoreId] = useState('');

  const fetchOrders = async (token, orgId) => {
    try {
      const storesResponse = await fetch(`${API_URL}/api/stores/org/${orgId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const stores = await storesResponse.json();
      if (!storesResponse.ok || !Array.isArray(stores) || stores.length === 0) {
        console.error('Aucune boutique trouvée');
        return;
      }

      const stId = stores[0].id;
      setStoreId(stId);

      const ordersResponse = await fetch(`${API_URL}/api/orders?storeId=${stId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await ordersResponse.json();
      if (ordersResponse.ok) {
        const ordersList = data.orders || data.data || data || [];
        setOrders(ordersList);
      } else {
        console.error('Erreur lors du chargement des commandes');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setAccessToken(data.accessToken);
        setIsLoggedIn(true);
        setScreen('orders');
        if (data.organization) {
          await fetchOrders(data.accessToken, data.organization.id);
        }
      } else {
        Alert.alert('Erreur', data.message || 'Connexion échouée');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setOrders([]);
    setAccessToken('');
    setScreen('login');
  };

  const handleOrderAction = async (action, orderId) => {
    try {
      let endpoint = '';
      let body = {};

      if (action === 'accept') {
        endpoint = `/api/order-management/${storeId}/${orderId}/accept`;
        body = { preparationMinutes: 30 };
      } else if (action === 'reject') {
        endpoint = `/api/order-management/${storeId}/${orderId}/reject`;
        body = { motif: 'OTHER', note: 'Refusé par le commerçant' };
      } else if (action === 'ready') {
        endpoint = `/api/order-management/${storeId}/${orderId}/status`;
        body = { status: 'READY' };
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: action === 'ready' ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        Alert.alert('Succès', `Commande ${action === 'accept' ? 'acceptée' : action === 'reject' ? 'refusée' : 'marquée prête'}`);
        await fetchOrders(accessToken, selectedOrder.storeId);
        setScreen('orders');
      } else {
        Alert.alert('Erreur', 'Impossible d\'effectuer l\'action');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Erreur réseau');
      console.error(error);
    }
  };

  // Login Screen
  if (screen === 'login') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.loginContainer}>
          <Text style={styles.title}>Zupone</Text>
          <Text style={styles.subtitle}>Commerçant</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>Se connecter</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Orders List Screen
  if (screen === 'orders') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.dashboardContainer}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Commandes</Text>
              <Text style={styles.headerEmail}>{email}</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <Text style={styles.logoutButtonText}>Quitter</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.orderCard}
                onPress={() => {
                  setSelectedOrder(item);
                  setScreen('detail');
                }}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderNumber}>#{item.id.slice(-6).toUpperCase()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status?.toLowerCase()] || '#999' }]}>
                    <Text style={styles.statusText}>{STATUS_LABELS[item.status?.toLowerCase()] || item.status}</Text>
                  </View>
                </View>
                <Text style={styles.customerName}>{item.customerName || 'Anonyme'}</Text>
                <Text style={styles.orderTotal}>{parseFloat(item.totalAmount).toFixed(2)} €</Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aucune commande</Text>
              </View>
            }
          />
        </View>
      </View>
    );
  }

  // Order Detail Screen
  if (screen === 'detail' && selectedOrder) {
    const order = selectedOrder;
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.dashboardContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setScreen('orders')}>
              <Text style={styles.backButton}>← Retour</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailContent}>
            <View style={styles.detailOrderHeader}>
              <Text style={styles.detailOrderNumber}>#{order.id.slice(-6).toUpperCase()}</Text>
              <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[order.status?.toLowerCase()] || '#999' }]}>
                <Text style={styles.statusText}>{STATUS_LABELS[order.status?.toLowerCase()] || order.status}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Client</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Nom</Text>
                <Text style={styles.value}>{order.customerName}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{order.customerEmail}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Téléphone</Text>
                <Text style={styles.value}>{order.customerPhone}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Articles</Text>
              {order.items && order.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.product?.name || 'Produit'}</Text>
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                  <Text style={styles.itemPrice}>{parseFloat(item.total).toFixed(2)} €</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Livraison</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Type</Text>
                <Text style={styles.value}>{order.deliveryType === 'DELIVERY' ? 'Livraison' : 'Retrait'}</Text>
              </View>
              {order.deliveryAddress && (
                <>
                  <View style={styles.row}>
                    <Text style={styles.label}>Adresse</Text>
                    <Text style={styles.value}>{order.deliveryAddress}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Ville</Text>
                    <Text style={styles.value}>{order.deliveryCity} ({order.deliveryPostal})</Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Total</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Sous-total</Text>
                <Text style={styles.value}>{parseFloat(order.totalAmount).toFixed(2)} €</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>TVA</Text>
                <Text style={styles.value}>{parseFloat(order.taxAmount).toFixed(2)} €</Text>
              </View>
              <View style={[styles.row, styles.totalRow]}>
                <Text style={[styles.label, styles.totalLabel]}>Total</Text>
                <Text style={styles.totalValue}>{parseFloat(order.totalAmount).toFixed(2)} €</Text>
              </View>
            </View>

            <View style={{ height: 20 }} />
          </ScrollView>

          <View style={styles.actions}>
            {order.status?.toLowerCase() === 'pending' && (
              <>
                <View style={styles.actionGroup}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnAccept]}
                    onPress={() => handleOrderAction('accept', order.id)}
                  >
                    <Text style={styles.btnText}>✓ Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => handleOrderAction('reject', order.id)}
                  >
                    <Text style={styles.btnText}>✗ Refuser</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {order.status?.toLowerCase() === 'accepted' && (
              <TouchableOpacity
                style={[styles.btn, styles.btnReady]}
                onPress={() => handleOrderAction('ready', order.id)}
              >
                <Text style={styles.btnText}>📦 Marquer prêt</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#007AFF',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailHeader: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerEmail: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: '#0055CC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  customerName: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  orderTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
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
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 40,
    textAlign: 'center',
    opacity: 0.9,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
  },
  loginButton: {
    backgroundColor: '#0055CC',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  detailOrderHeader: {
    paddingHorizontal: 12,
    paddingTop: 12,
    marginBottom: 12,
  },
  detailOrderNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  detailContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    borderBottomWidth: 0,
    paddingTop: 8,
    marginTop: 6,
  },
  label: {
    color: '#666',
    fontSize: 13,
    flex: 1,
  },
  value: {
    fontWeight: '600',
    color: '#333',
    fontSize: 13,
    textAlign: 'right',
    marginLeft: 10,
  },
  totalLabel: {
    fontWeight: 'bold',
  },
  totalValue: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  itemQty: {
    color: '#666',
    marginHorizontal: 8,
    fontSize: 13,
  },
  itemPrice: {
    fontWeight: '600',
    color: '#007AFF',
    fontSize: 13,
  },
  actions: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAccept: {
    backgroundColor: '#4CAF50',
  },
  btnReject: {
    backgroundColor: '#f44336',
  },
  btnReady: {
    backgroundColor: '#2196F3',
  },
  btnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
