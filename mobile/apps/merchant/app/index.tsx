import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, FlatList, ScrollView, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, apiFetch, formatEuros, setUnauthorizedHandler } from '../lib/api';
import { clearSession, DEFAULT_PREFS, loadPrefs, loadSession, Prefs, savePrefs, saveSession, Session } from '../lib/session';
import { isPending, isToday, Order, statusColor, statusLabel } from '../lib/orders';
import { NewOrderEvent, useOrderAlerts } from '../lib/useOrderAlerts';
import { onOrderNotificationTap, PushOrderData, PushSetup, registerForPush, unregisterPush } from '../lib/push';
import StatsScreen from '../components/screens/StatsScreen';
import MenuScreen from '../components/screens/MenuScreen';
import StoreScreen from '../components/screens/StoreScreen';
import SettingsScreen from '../components/screens/SettingsScreen';
import AccountScreen from '../components/screens/AccountScreen';
import OrderDetailScreen from '../components/screens/OrderDetailScreen';

interface StoreSummary {
  id: string;
  name: string;
  city?: string | null;
  isOpen?: boolean;
}

const DRAWER_ITEMS = [
  { tab: 'stats', label: '📊 Statistiques' },
  { tab: 'menu', label: '🍕 Menu' },
  { tab: 'boutique', label: '🏪 Boutique' },
  { tab: 'settings', label: '⚙️ Paramètres' },
  { tab: 'account', label: '👤 Mon Compte' },
];

export default function MerchantApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [tab, setTab] = useState<string>('dashboard');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [storeId, setStoreId] = useState<string>('');
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [storePickerOpen, setStorePickerOpen] = useState<boolean>(false);
  const [banner, setBanner] = useState<NewOrderEvent | null>(null);
  const [pushSetup, setPushSetup] = useState<PushSetup | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PushOrderData | null>(null);

  const token = session?.accessToken || '';
  const currentStore = stores.find((s) => s.id === storeId);
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pushTokenRef = useRef<string | null>(null);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  };

  const loadOrders = useCallback(async (accessToken: string, stId: string) => {
    if (!accessToken || !stId) return;
    try {
      const data = await apiFetch<any>(`/api/orders?storeId=${stId}`, accessToken);
      // Une réponse d'une boutique qu'on a quittée entre-temps est ignorée.
      if (stId === storeIdRef.current) setOrders(data.orders || data.data || data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des commandes:', error);
    }
  }, []);

  const loadStores = async (accessToken: string, organizationId: string, preferredStoreId?: string) => {
    try {
      const list = await apiFetch<StoreSummary[]>(`/api/stores/org/${organizationId}`, accessToken);
      if (!Array.isArray(list) || list.length === 0) return;
      const chosen = list.find((s) => s.id === preferredStoreId) || list[0];
      setStores(list);
      setStoreId(chosen.id);
      storeIdRef.current = chosen.id;
      await loadOrders(accessToken, chosen.id);
    } catch (error) {
      console.error('Erreur lors du chargement des boutiques:', error);
    }
  };

  const openSession = async (next: Session, storedPrefs: Prefs) => {
    setSession(next);
    setEmail(next.email);
    setTab('dashboard');
    await loadStores(next.accessToken, next.orgId, storedPrefs.storeId);
  };

  const handleLogout = useCallback(() => {
    const current = sessionRef.current;
    if (current && pushTokenRef.current) unregisterPush(current.accessToken, pushTokenRef.current);
    pushTokenRef.current = null;
    setPushSetup(null);
    setPendingOpen(null);
    clearSession();
    setSession(null);
    setPassword('');
    setOrders([]);
    setSelectedOrder(null);
    setTab('dashboard');
    setMenuOpen(false);
    setStoreId('');
    setStores([]);
    setStorePickerOpen(false);
    setBanner(null);
  }, []);

  // Démarrage : on reprend la session enregistrée et on renouvelle le jeton.
  useEffect(() => {
    (async () => {
      const [stored, storedPrefs] = await Promise.all([loadSession(), loadPrefs()]);
      setPrefs(storedPrefs);
      if (stored?.refreshToken) {
        try {
          const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          });
          const data = await response.json();
          if (response.ok && data.accessToken && data.organization) {
            const renewed = { ...stored, accessToken: data.accessToken, orgId: data.organization.id };
            await saveSession(renewed);
            await openSession(renewed, storedPrefs);
          } else if (response.status === 401 || response.status === 403) {
            await clearSession();
            setEmail(stored.email);
          } else {
            // Serveur injoignable ou en erreur : on garde la session telle quelle.
            await openSession(stored, storedPrefs);
          }
        } catch {
          await openSession(stored, storedPrefs);
        }
      }
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      handleLogout();
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
    });
    return () => setUnauthorizedHandler(null);
  }, [handleLogout]);

  // Ce téléphone reçoit les commandes même application fermée.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    registerForPush(token).then((setup) => {
      if (cancelled) return;
      pushTokenRef.current = setup.status === 'enabled' ? setup.token : null;
      setPushSetup(setup);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Toucher une notification ouvre la commande, dans la bonne boutique.
  useEffect(() => onOrderNotificationTap(setPendingOpen), []);

  const pendingCount = orders.filter(isPending).length;

  const { connected, ring } = useOrderAlerts({
    token,
    soundEnabled: prefs.soundEnabled,
    pendingCount,
    onNewOrder: (event) => {
      setBanner(event);
      if (event.storeId === storeIdRef.current) loadOrders(token, event.storeId);
    },
    onOrdersChanged: () => loadOrders(token, storeIdRef.current),
  });

  const switchStore = async (id: string) => {
    setStorePickerOpen(false);
    setMenuOpen(false);
    if (id === storeId) return;
    setStoreId(id);
    storeIdRef.current = id;
    setOrders([]);
    setSelectedOrder(null);
    updatePrefs({ storeId: id });
    await loadOrders(token, id);
  };

  useEffect(() => {
    if (!pendingOpen || !session || !storeId) return;
    if (pendingOpen.storeId && pendingOpen.storeId !== storeId && stores.some((s) => s.id === pendingOpen.storeId)) {
      switchStore(pendingOpen.storeId);
      return;
    }
    setBanner(null);
    setTab('commandes-jour');
    const order = orders.find((o) => o.id === pendingOpen.orderId);
    if (order) setSelectedOrder(order);
    if (order || orders.length > 0) setPendingOpen(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen, session, storeId, stores, orders]);

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
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Erreur', data.message || 'Connexion échouée');
      } else if (!data.organization) {
        Alert.alert('Accès refusé', "Ce compte n'est rattaché à aucun commerce.");
      } else {
        const next: Session = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          email: data.user?.email || email.trim(),
          orgId: data.organization.id,
        };
        await saveSession(next);
        setPassword('');
        await openSession(next, prefs);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setStorePickerOpen(false);
  };

  const openFromMenu = (target: string) => {
    setTab(target);
    setMenuOpen(false);
  };

  const openOrder = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    setBanner(null);
    if (order) setSelectedOrder(order);
    else setTab('commandes-jour');
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadOrders(token, storeId);
    setRefreshing(false);
  };

  if (booting) {
    return (
      <SafeAreaView style={[styles.container, styles.splash]}>
        <StatusBar style="light" />
        <Text style={styles.title}>Zupone</Text>
        <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
      </SafeAreaView>
    );
  }

  // Login Screen
  if (!session) {
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

  // Order Detail Screen
  if (selectedOrder) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <OrderDetailScreen
          key={selectedOrder.id}
          initialOrder={selectedOrder}
          token={token}
          storeId={storeId}
          defaultPreparation={prefs.preparationMinutes}
          onBack={() => setSelectedOrder(null)}
          onChanged={() => loadOrders(token, storeId)}
        />
      </SafeAreaView>
    );
  }

  const todayOrders = orders
    .filter((o) => isToday(o.createdAt))
    .sort((a, b) => Number(isPending(b)) - Number(isPending(a)));
  const openStorePicker = () => {
    setStorePickerOpen(true);
    setMenuOpen(true);
  };
  const headerSubtitle = (
    <View style={styles.subtitleRow}>
      <View style={[styles.liveDot, { backgroundColor: connected ? '#7CFC8A' : '#FFB3B3' }]} />
      <TouchableOpacity disabled={stores.length < 2} onPress={openStorePicker}>
        <Text style={styles.headerEmail}>
          {currentStore?.name || email}
          {stores.length > 1 ? '  ▾ Changer' : ''}
          {connected ? '' : '  · hors ligne'}
        </Text>
      </TouchableOpacity>
    </View>
  );
  const back = () => setTab('dashboard');

  const renderTabContent = () => {
    if (!storeId && (tab === 'stats' || tab === 'menu' || tab === 'boutique')) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Aucune boutique associée à ce compte</Text>
        </View>
      );
    }
    if (tab === 'stats') return <StatsScreen key={storeId} token={token} storeId={storeId} onBack={back} />;
    if (tab === 'menu') return <MenuScreen key={storeId} token={token} storeId={storeId} onBack={back} />;
    if (tab === 'boutique') return <StoreScreen key={storeId} token={token} storeId={storeId} onBack={back} />;
    if (tab === 'settings') {
      return (
        <SettingsScreen
          preparationMinutes={prefs.preparationMinutes}
          onChangePreparation={(m) => updatePrefs({ preparationMinutes: m })}
          soundEnabled={prefs.soundEnabled}
          onChangeSound={(enabled) => updatePrefs({ soundEnabled: enabled })}
          onTestSound={ring}
          pushEnabled={pushSetup?.status === 'enabled'}
          pushInfo={pushSetup ? (pushSetup.status === 'enabled' ? undefined : pushSetup.reason) : 'Vérification…'}
          onLogout={handleLogout}
          onBack={back}
        />
      );
    }
    if (tab === 'account') return <AccountScreen token={token} onLogout={handleLogout} onBack={back} />;
    if (tab === 'commandes-jour') {
      return (
        <>
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Commandes du Jour</Text>
              {headerSubtitle}
            </View>
          </View>
          <FlatList
            data={todayOrders}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.orderCard, isPending(item) && styles.orderCardPending]}
                onPress={() => setSelectedOrder(item)}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderNumber}>
                    #{item.id.slice(-6).toUpperCase()}
                    {item.createdAt
                      ? `  ·  ${new Date(item.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) }]}>
                    <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                <Text style={styles.customerName}>
                  {item.customerName || 'Anonyme'}  ·  {item.deliveryType === 'DELIVERY' ? '🛵 Livraison' : '🛍️ Retrait'}
                </Text>
                <Text style={styles.orderTotal}>{formatEuros(item.totalAmount)}</Text>
              </TouchableOpacity>
            )}
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
    return (
      <>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Tableau de Bord</Text>
            {headerSubtitle}
          </View>
        </View>
        <ScrollView
          style={styles.dashboardContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{todayOrders.length}</Text>
              <Text style={styles.statLabel}>Aujourd'hui</Text>
            </View>
            <TouchableOpacity style={[styles.statCard, pendingCount > 0 && styles.statCardAlert]} onPress={() => setTab('commandes-jour')}>
              <Text style={[styles.statValue, pendingCount > 0 && { color: '#fff' }]}>{pendingCount}</Text>
              <Text style={[styles.statLabel, pendingCount > 0 && { color: '#fff' }]}>En attente</Text>
            </TouchableOpacity>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{orders.filter((o) => (o.status || '').toUpperCase() === 'PREPARING').length}</Text>
              <Text style={styles.statLabel}>En préparation</Text>
            </View>
          </View>
        </ScrollView>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.dashboardContainer}>
        {renderTabContent()}

        <View style={styles.bottomTabBar}>
          <TouchableOpacity style={styles.tabButtonLeft} onPress={() => setMenuOpen(true)}>
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
            <View>
              <Text style={[styles.tabIcon, tab === 'commandes-jour' && styles.tabIconActive]}>📋</Text>
              {pendingCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{pendingCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === 'commandes-jour' && styles.tabLabelActive]}>Commandes du Jour</Text>
          </TouchableOpacity>
        </View>
      </View>

      {banner && (
        <TouchableOpacity style={styles.banner} activeOpacity={0.9} onPress={() => openOrder(banner.orderId)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>🔔 Nouvelle commande</Text>
            <Text style={styles.bannerText} numberOfLines={1}>
              {banner.customerName || 'Client'} · {banner.deliveryType === 'DELIVERY' ? 'Livraison' : 'Retrait'}
              {banner.totalAmount !== undefined ? ` · ${formatEuros(banner.totalAmount)}` : ''}
              {banner.storeId !== storeId
                ? ` · ${stores.find((s) => s.id === banner.storeId)?.name || 'autre boutique'}`
                : ''}
            </Text>
          </View>
          {banner.storeId === storeId ? (
            <Text style={styles.bannerAction}>Voir ›</Text>
          ) : (
            <TouchableOpacity onPress={() => { switchStore(banner.storeId); setBanner(null); setTab('commandes-jour'); }}>
              <Text style={styles.bannerAction}>Ouvrir ›</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setBanner(null)} hitSlop={10}>
            <Text style={styles.bannerClose}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Menu Drawer */}
      {menuOpen && (
        <View style={styles.menuOverlay}>
          <View style={styles.menuDrawer}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity onPress={closeMenu}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {currentStore && (
              <View style={styles.storeBlock}>
                <Text style={styles.storeBlockLabel}>Boutique</Text>
                <TouchableOpacity
                  style={styles.storeCurrent}
                  disabled={stores.length < 2}
                  onPress={() => setStorePickerOpen((o) => !o)}
                >
                  <Text style={styles.storeCurrentName} numberOfLines={1}>🏪 {currentStore.name}</Text>
                  {stores.length > 1 && <Text style={styles.storeChevron}>{storePickerOpen ? '▴' : '▾'}</Text>}
                </TouchableOpacity>
                {storePickerOpen &&
                  stores.map((s) => (
                    <TouchableOpacity key={s.id} style={styles.storeOption} onPress={() => switchStore(s.id)}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.storeOptionName, s.id === storeId && styles.storeOptionActive]} numberOfLines={1}>
                          {s.name}
                        </Text>
                        {s.city ? <Text style={styles.storeOptionCity}>{s.city}</Text> : null}
                      </View>
                      {s.id === storeId && <Text style={styles.storeOptionActive}>✓</Text>}
                    </TouchableOpacity>
                  ))}
              </View>
            )}

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
          <TouchableOpacity style={styles.menuBackdrop} onPress={closeMenu} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  orderCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  statCardAlert: {
    backgroundColor: '#FFA500',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f44336',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  banner: {
    position: 'absolute',
    top: 56,
    left: 12,
    right: 12,
    backgroundColor: '#1B5E20',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 500,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  bannerText: {
    color: '#fff',
    opacity: 0.9,
    fontSize: 13,
    marginTop: 2,
  },
  bannerAction: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bannerClose: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.8,
  },
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
  storeBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  storeBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  storeCurrent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  storeCurrentName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  storeChevron: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  storeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  storeOptionName: {
    fontSize: 14,
    color: '#333',
  },
  storeOptionCity: {
    fontSize: 12,
    color: '#999',
    marginTop: 1,
  },
  storeOptionActive: {
    color: '#007AFF',
    fontWeight: '700',
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
  bottomTabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    paddingBottom: 8,
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
});
