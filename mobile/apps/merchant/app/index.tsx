import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../lib/api';
import StatsScreen from '../components/screens/StatsScreen';
import MenuScreen from '../components/screens/MenuScreen';
import StoreScreen from '../components/screens/StoreScreen';
import SettingsScreen from '../components/screens/SettingsScreen';
import AccountScreen from '../components/screens/AccountScreen';

interface Order {
  id: string;
  status?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalAmount: number;
  taxAmount?: number;
  deliveryType?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostal?: string;
  items?: Array<{
    id: string;
    product?: { name: string };
    quantity: number;
    total: number;
  }>;
  storeId?: string;
  createdAt?: string;
}

const DRAWER_ITEMS = [
  { tab: 'stats', label: '📊 Statistiques' },
  { tab: 'menu', label: '🍕 Menu' },
  { tab: 'boutique', label: '🏪 Boutique' },
  { tab: 'settings', label: '⚙️ Paramètres' },
  { tab: 'account', label: '👤 Mon Compte' },
];

const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

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
  const [screen, setScreen] = useState<string>('login');
  const [tab, setTab] = useState<string>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [accessToken, setAccessToken] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [storeId, setStoreId] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [orgId, setOrgId] = useState<string>('');
  const [preparationMinutes, setPreparationMinutes] = useState<number>(30);

  const fetchOrders = async (token: string, orgId: string) => {
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
        setScreen('dashboard');
        setTab('dashboard');

        if (data.organization) {
          setOrgId(data.organization.id);
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

  const openFromMenu = (target: string) => {
    setTab(target);
    setMenuOpen(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail('');
    setPassword('');
    setOrders([]);
    setAccessToken('');
    setScreen('login');
    setTab('dashboard');
    setMenuOpen(false);
    setOrgId('');
    setStoreId('');
  };

  const handleOrderAction = async (action: string, orderId: string) => {
    try {
      let endpoint = '';
      let body: any = {};

      if (action === 'accept') {
        endpoint = `/api/order-management/${storeId}/${orderId}/accept`;
        body = { preparationMinutes };
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
        if (orgId) {
          await fetchOrders(accessToken, orgId);
        }
        setScreen('dashboard');
        setTab('commandes-jour');
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
      </SafeAreaView>
    );
  }

  // Dashboard Screen
  if (screen === 'dashboard') {
    const todayOrders = orders.filter((o) => isToday(o.createdAt));
    const back = () => setTab('dashboard');

    const renderTabContent = () => {
      if (!storeId && (tab === 'stats' || tab === 'menu' || tab === 'boutique')) {
        return (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucune boutique associée à ce compte</Text>
          </View>
        );
      }
      if (tab === 'stats') return <StatsScreen token={accessToken} storeId={storeId} onBack={back} />;
      if (tab === 'menu') return <MenuScreen token={accessToken} storeId={storeId} onBack={back} />;
      if (tab === 'boutique') return <StoreScreen token={accessToken} storeId={storeId} onBack={back} />;
      if (tab === 'settings') {
        return (
          <SettingsScreen
            preparationMinutes={preparationMinutes}
            onChangePreparation={setPreparationMinutes}
            onLogout={handleLogout}
            onBack={back}
          />
        );
      }
      if (tab === 'account') return <AccountScreen token={accessToken} onLogout={handleLogout} onBack={back} />;
      if (tab === 'dashboard') {
        return (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Tableau de Bord</Text>
                <Text style={styles.headerEmail}>{email}</Text>
              </View>
            </View>
            <ScrollView style={styles.dashboardContent}>
              <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{orders.length}</Text>
                  <Text style={styles.statLabel}>Commandes</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{orders.filter((o: Order) => o.status?.toLowerCase() === 'pending').length}</Text>
                  <Text style={styles.statLabel}>En attente</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{orders.filter((o: Order) => o.status?.toLowerCase() === 'preparing').length}</Text>
                  <Text style={styles.statLabel}>En préparation</Text>
                </View>
              </View>
            </ScrollView>
          </>
        );
      } else if (tab === 'commandes-jour') {
        return (
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Commandes du Jour</Text>
                <Text style={styles.headerEmail}>{email}</Text>
              </View>
            </View>
            <FlatList
              data={todayOrders}
              keyExtractor={(item) => item.id}
              renderItem={({ item }: { item: Order }) => {
                const statusKey = item.status?.toLowerCase() as keyof typeof STATUS_LABELS;
                return (
                  <TouchableOpacity
                    style={styles.orderCard}
                    onPress={() => {
                      setSelectedOrder(item);
                      setScreen('detail');
                    }}
                  >
                    <View style={styles.orderHeader}>
                      <Text style={styles.orderNumber}>#{item.id.slice(-6).toUpperCase()}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusKey && STATUS_COLORS[statusKey] ? STATUS_COLORS[statusKey] : '#999' }]}>
                        <Text style={styles.statusText}>{statusKey && STATUS_LABELS[statusKey] ? STATUS_LABELS[statusKey] : item.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.customerName}>{item.customerName || 'Anonyme'}</Text>
                    <Text style={styles.orderTotal}>{parseFloat(String(item.totalAmount)).toFixed(2)} €</Text>
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Aucune commande aujourd'hui</Text>
                </View>
              }
            />
          </>
        );
      }
    };

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" />

        <View style={styles.dashboardContainer}>
          {renderTabContent()}

          <View style={styles.bottomTabBar}>
            <TouchableOpacity
              style={styles.tabButtonLeft}
              onPress={() => setMenuOpen(true)}
            >
              <Text style={styles.tabIcon}>☰</Text>
              <Text style={styles.tabLabel}>Menu</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButtonCenter, tab === 'dashboard' && styles.tabButtonActive]}
              onPress={() => setTab('dashboard')}
            >
              <Text style={[styles.tabIcon, tab === 'dashboard' && styles.tabIconActive]}>📊</Text>
              <Text style={[styles.tabLabel, tab === 'dashboard' && styles.tabLabelActive]}>Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButtonRight, tab === 'commandes-jour' && styles.tabButtonActive]}
              onPress={() => setTab('commandes-jour')}
            >
              <Text style={[styles.tabIcon, tab === 'commandes-jour' && styles.tabIconActive]}>📋</Text>
              <Text style={[styles.tabLabel, tab === 'commandes-jour' && styles.tabLabelActive]}>Commandes du Jour</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu Drawer */}
        {menuOpen && (
          <View style={styles.menuOverlay}>
            <View style={styles.menuDrawer}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>Menu</Text>
                <TouchableOpacity onPress={() => setMenuOpen(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>

              {DRAWER_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.tab}
                  style={[styles.menuItem, tab === item.tab && styles.menuItemActive]}
                  onPress={() => openFromMenu(item.tab)}
                >
                  <Text style={styles.menuItemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={[styles.menuItem, styles.menuItemLogout]} onPress={handleLogout}>
                <Text style={styles.menuItemLogoutText}>🚪 Déconnexion</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.menuBackdrop}
              onPress={() => setMenuOpen(false)}
            />
          </View>
        )}
      </SafeAreaView>
    );
  }

  // Order Detail Screen
  if (screen === 'detail' && selectedOrder) {
    const order = selectedOrder;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.dashboardContainer}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setScreen('dashboard')}>
              <Text style={styles.backButton}>← Retour</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.detailContent}>
            <View style={styles.detailOrderHeader}>
              <Text style={styles.detailOrderNumber}>#{order.id.slice(-6).toUpperCase()}</Text>
              {(() => {
                const statusKey = order.status?.toLowerCase() as keyof typeof STATUS_LABELS;
                return (
                  <View style={[styles.statusBadge, { backgroundColor: statusKey && STATUS_COLORS[statusKey] ? STATUS_COLORS[statusKey] : '#999' }]}>
                    <Text style={styles.statusText}>{statusKey && STATUS_LABELS[statusKey] ? STATUS_LABELS[statusKey] : order.status}</Text>
                  </View>
                );
              })()}
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
              {order.items && order.items.map((item: any) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.product?.name || 'Produit'}</Text>
                  <Text style={styles.itemQty}>x{item.quantity}</Text>
                  <Text style={styles.itemPrice}>{parseFloat(String(item.total)).toFixed(2)} €</Text>
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
                <Text style={styles.value}>{parseFloat(String(order.totalAmount)).toFixed(2)} €</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>TVA</Text>
                <Text style={styles.value}>{parseFloat(String(order.taxAmount || 0)).toFixed(2)} €</Text>
              </View>
              <View style={[styles.row, styles.totalRow]}>
                <Text style={[styles.label, styles.totalLabel]}>Total</Text>
                <Text style={styles.totalValue}>{parseFloat(String(order.totalAmount)).toFixed(2)} €</Text>
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
                    onPress={() => handleOrderAction('accept', String(order.id))}
                  >
                    <Text style={styles.btnText}>✓ Accepter</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => handleOrderAction('reject', String(order.id))}
                  >
                    <Text style={styles.btnText}>✗ Refuser</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {order.status?.toLowerCase() === 'accepted' && (
              <TouchableOpacity
                style={[styles.btn, styles.btnReady]}
                onPress={() => handleOrderAction('ready', String(order.id))}
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
    position: 'relative',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    zIndex: 999,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuDrawer: {
    width: '70%',
    backgroundColor: '#fff',
    paddingTop: 20,
    paddingBottom: 20,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
    fontWeight: 'bold',
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  menuItemActive: {
    backgroundColor: '#EAF3FF',
  },
  menuItemLogout: {
    marginTop: 8,
    borderBottomWidth: 0,
  },
  menuItemLogoutText: {
    fontSize: 16,
    color: '#f44336',
    fontWeight: '500',
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
  bottomTabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    paddingBottom: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabButtonLeft: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabButtonCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabButtonRight: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabIconActive: {
    fontSize: 24,
  },
  tabLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  dashboardContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  settingsContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  settingItem: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingArrow: {
    fontSize: 16,
    color: '#999',
  },
  logoutText: {
    color: '#f44336',
  },
  accountContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 30,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 30,
    alignItems: 'center',
  },
  profileAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 40,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#999',
  },
});
