import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
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

export default function LoginScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [accessToken, setAccessToken] = useState('');

  const fetchOrders = async (token, orgId) => {
    try {
      console.log('Fetching stores for orgId:', orgId);
      // Fetch stores for this organization
      const storesResponse = await fetch(`${API_URL}/api/stores/org/${orgId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('Stores response status:', storesResponse.status);
      const stores = await storesResponse.json();
      console.log('Stores data:', JSON.stringify(stores, null, 2));

      if (!storesResponse.ok || !Array.isArray(stores) || stores.length === 0) {
        Alert.alert('Aucune boutique trouvée', 'Créez une boutique pour voir les commandes');
        return;
      }

      // Use first store
      const storeId = stores[0].id;
      console.log('Using storeId:', storeId);

      // Fetch orders for this store
      const ordersResponse = await fetch(`${API_URL}/api/orders?storeId=${storeId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('Orders response status:', ordersResponse.status);
      const data = await ordersResponse.json();
      console.log('Orders data:', JSON.stringify(data, null, 2));

      if (ordersResponse.ok) {
        const ordersList = data.orders || data.data || data || [];
        console.log('Setting orders:', ordersList.length);
        setOrders(ordersList);
      } else {
        Alert.alert('Erreur', 'Impossible de charger les commandes');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
      Alert.alert('Erreur', error.message || 'Erreur réseau');
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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {!isLoggedIn ? (
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
      ) : (
        <View style={styles.dashboardContainer}>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Commandes</Text>
              <Text style={styles.headerEmail}>{email}</Text>
            </View>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => {
                setIsLoggedIn(false);
                setEmail('');
                setPassword('');
                setOrders([]);
                setAccessToken('');
              }}
            >
              <Text style={styles.logoutButtonText}>Quitter</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={orders}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderNumber}>#{item.id.slice(-6).toUpperCase()}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status?.toLowerCase()] || '#999' }]}>
                    <Text style={styles.statusText}>{STATUS_LABELS[item.status?.toLowerCase()] || item.status}</Text>
                  </View>
                </View>
                <Text style={styles.customerName}>{item.customerName || 'Anonyme'}</Text>
                <Text style={styles.orderTotal}>{parseFloat(item.totalAmount).toFixed(2)} €</Text>
              </View>
            )}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aucune commande</Text>
              </View>
            }
          />
        </View>
      )}
    </View>
  );
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
    paddingHorizontal: 20,
    paddingVertical: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerEmail: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
  },
  listContent: {
    padding: 15,
    gap: 12,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  customerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  orderTotal: {
    fontSize: 16,
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
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 30,
    opacity: 0.9,
  },
  logoutButton: {
    backgroundColor: '#0055CC',
    borderRadius: 10,
    paddingHorizontal: 30,
    paddingVertical: 12,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
