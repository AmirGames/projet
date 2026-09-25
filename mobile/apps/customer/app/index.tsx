import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, apiFetch, setUnauthorizedHandler } from '../lib/api';
import {
  clearSession,
  DeliveryAddress,
  loadAddress,
  loadSession,
  saveAddress,
  saveSession,
  Session,
} from '../lib/session';
import { Carts, CartLine, itemCount, loadCarts, saveCarts, sortedCarts, withLines } from '../lib/carts';
import { isActive, OrderSummary, orderStatus } from '../lib/orders';
import { useCustomerRealtime } from '../lib/useCustomerRealtime';
import { useCartSync } from '../lib/useCartSync';
import { onCustomerNotificationTap, PushCustomerData, PushSetup, registerForPush, unregisterPush } from '../lib/push';
import { COLORS } from '../components/ui';
import HomeScreen from '../components/screens/HomeScreen';
import StoreScreen from '../components/screens/StoreScreen';
import CartsScreen from '../components/screens/CartsScreen';
import CheckoutScreen from '../components/screens/CheckoutScreen';
import OrdersScreen from '../components/screens/OrdersScreen';
import OrderScreen from '../components/screens/OrderScreen';
import ReviewScreen from '../components/screens/ReviewScreen';
import FavoritesScreen from '../components/screens/FavoritesScreen';
import NotificationsScreen from '../components/screens/NotificationsScreen';
import AddressScreen from '../components/screens/AddressScreen';
import SettingsScreen from '../components/screens/SettingsScreen';
import AccountScreen, { CustomerProfile } from '../components/screens/AccountScreen';

const DRAWER_ITEMS = [
  { tab: 'orders', label: '🧾 Mes commandes' },
  { tab: 'favorites', label: '❤️ Favoris' },
  { tab: 'notifications', label: '🔔 Notifications' },
  { tab: 'settings', label: '⚙️ Paramètres' },
  { tab: 'account', label: '👤 Mon Compte' },
];

/**
 * Les écrans plein cadre, ouverts par-dessus les onglets : une vitrine, le
 * tunnel de commande, une commande, un avis, l'adresse. « Retour » dépile.
 */
type Page =
  | { kind: 'store'; storeId: string }
  | { kind: 'checkout'; storeId: string }
  | { kind: 'order'; orderId: string }
  | { kind: 'review'; orderId: string }
  | { kind: 'address' };

export default function CustomerApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<string>('home');
  const [pages, setPages] = useState<Page[]>([]);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [carts, setCarts] = useState<Carts>({});
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [banner, setBanner] = useState<{ orderId: string; title: string; message: string } | null>(null);
  const [pushSetup, setPushSetup] = useState<PushSetup | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PushCustomerData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);

  const token = session?.accessToken || '';
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const pushTokenRef = useRef<string | null>(null);

  const page = pages[pages.length - 1];
  const pushPage = (p: Page) => {
    setMenuOpen(false);
    setPages((stack) => [...stack, p]);
  };
  const popPage = () => setPages((stack) => stack.slice(0, -1));

  const activeOrders = useMemo(() => orders.filter(isActive), [orders]);
  const activeOrderIds = useMemo(() => activeOrders.map((o) => o.id), [activeOrders]);
  const cartList = useMemo(() => sortedCarts(carts), [carts]);
  const cartItems = cartList.reduce((n, c) => n + itemCount(c.lines), 0);

  const updateCarts = useCallback((update: (c: Carts) => Carts) => {
    setCarts((current) => {
      const next = update(current);
      saveCarts(next);
      return next;
    });
  }, []);

  // Les paniers suivent le compte : ceux du site apparaissent ici, en direct.
  useCartSync({ token, carts, setCarts });

  const loadOrders = useCallback(async (accessToken: string) => {
    if (!accessToken) return;
    try {
      const res = await apiFetch<{ data: OrderSummary[] }>('/api/client/me/orders', accessToken);
      setOrders(res.data || []);
    } catch {
      // La liste affichée reste : elle sera relue au prochain événement.
    }
  }, []);

  const loadUnread = useCallback(async (accessToken: string) => {
    try {
      const res = await apiFetch<{ unreadCount: number }>('/api/notifications?limit=1', accessToken);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Le compteur sera recalculé plus tard.
    }
  }, []);

  const openSession = async (next: Session) => {
    setSession(next);
    setEmail(next.email);
    setTab('home');
    setPages([]);
    apiFetch<{ data: CustomerProfile }>('/api/client/me', next.accessToken)
      .then((res) => setProfile(res.data))
      .catch(() => undefined);
    await Promise.all([loadOrders(next.accessToken), loadUnread(next.accessToken)]);
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
    setProfile(null);
    setOrders([]);
    setPages([]);
    setTab('home');
    setMenuOpen(false);
    setBanner(null);
    setUnreadCount(0);
  }, []);

  // Démarrage : paniers et adresse du téléphone, puis la session renouvelée.
  useEffect(() => {
    (async () => {
      const [stored, storedAddress, storedCarts] = await Promise.all([loadSession(), loadAddress(), loadCarts()]);
      setAddress(storedAddress);
      setCarts(storedCarts);
      if (stored?.refreshToken) {
        try {
          const response = await fetch(`${API_URL}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          });
          const data = await response.json();
          if (response.ok && data.accessToken) {
            const renewed = { ...stored, accessToken: data.accessToken };
            await saveSession(renewed);
            await openSession(renewed);
          } else if (response.status === 401 || response.status === 403) {
            // Jeton refusé : on se reconnecte.
            await clearSession();
            setEmail(stored.email);
          } else {
            // Serveur en erreur : on garde la session telle quelle.
            await openSession(stored);
          }
        } catch {
          await openSession(stored);
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

  // Ce téléphone suit les commandes même application fermée.
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

  // Toucher une notification ouvre la commande concernée.
  useEffect(() => onCustomerNotificationTap(setPendingOpen), []);

  useEffect(() => {
    if (!pendingOpen || !session) return;
    setPendingOpen(null);
    if (pendingOpen.orderId) {
      setBanner(null);
      pushPage({ kind: 'order', orderId: pendingOpen.orderId });
    } else {
      setPages([]);
      setTab('notifications');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen, session]);

  // Un même changement arrive souvent par plusieurs événements : un seul
  // rechargement suffit.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => loadOrders(token), 300);
  };

  const viewingOrder = (orderId: string) => page?.kind === 'order' && page.orderId === orderId;

  const { connected } = useCustomerRealtime({
    token,
    activeOrderIds,
    onOrderUpdate: (u) => {
      setOrders((list) => list.map((o) => (o.id === u.orderId ? { ...o, status: u.status } : o)));
      scheduleReload();
      // L'écran de la commande affiche déjà la nouvelle : le bandeau servirait
      // de doublon.
      if (u.title && u.message && !viewingOrder(u.orderId)) {
        setBanner({ orderId: u.orderId, title: u.title, message: u.message });
      }
    },
    onDeliveryUpdate: (u) => {
      if (u.status) scheduleReload();
      if (u.livreurProche && !viewingOrder(u.orderId)) {
        setBanner({ orderId: u.orderId, title: 'Votre livreur est bientôt là', message: 'Vous pouvez descendre devant la porte.' });
      }
    },
    onNotification: () => {
      loadUnread(token);
      setNotifRefreshKey((k) => k + 1);
    },
    onReconnect: scheduleReload,
  });

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(id);
  }, [banner]);

  const handleAuth = async () => {
    if (!email || !password || (mode === 'signup' && name.trim().length < 2)) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(mode === 'signup' ? { name: name.trim() } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Erreur', data.error || data.message || (mode === 'signup' ? 'Inscription échouée' : 'Connexion échouée'));
        return;
      }

      // Tout compte peut commander : la fiche client naît à la première visite.
      const next: Session = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        email: data.user?.email || email.trim(),
      };
      await saveSession(next);
      setPassword('');
      await openSession(next);
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const changeAddress = (next: DeliveryAddress) => {
    setAddress(next);
    saveAddress(next);
    popPage();
  };

  const setLines = (store: { id: string; name: string; logo?: string | null }, lines: CartLine[]) =>
    updateCarts((c) => withLines(c, store, lines));

  const openFromMenu = (target: string) => {
    setPages([]);
    setTab(target);
    setMenuOpen(false);
  };

  // Panier vidé depuis le tunnel : il n'y a plus rien à commander.
  useEffect(() => {
    if (page?.kind === 'checkout' && !carts[page.storeId]) popPage();
  }, [page, carts]);

  const clearUnread = useCallback((n: number) => setUnreadCount(n), []);
  const onProfileLoaded = useCallback((p: CustomerProfile) => setProfile(p), []);

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
        <ScrollView contentContainerStyle={styles.loginContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Zupone</Text>
          <Text style={styles.subtitle}>Vos commerces de quartier, livrés</Text>

          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
              editable={!loading}
            />
          )}

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
            placeholder={mode === 'signup' ? 'Mot de passe (6 caractères minimum)' : 'Mot de passe'}
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>{mode === 'signup' ? 'Créer mon compte' : 'Se connecter'}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')} disabled={loading}>
            <Text style={styles.switchMode}>
              {mode === 'signup' ? 'J’ai déjà un compte : me connecter' : 'Pas encore de compte ? En créer un'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Écrans plein cadre
  if (page) {
    let content: React.ReactNode = null;
    if (page.kind === 'store') {
      const cart = carts[page.storeId];
      content = (
        <StoreScreen
          key={page.storeId}
          token={token}
          storeId={page.storeId}
          address={address}
          lines={cart?.lines || []}
          onChangeLines={(lines, store) => setLines(store, lines)}
          onBack={popPage}
          onCheckout={() => pushPage({ kind: 'checkout', storeId: page.storeId })}
        />
      );
    } else if (page.kind === 'checkout') {
      const cart = carts[page.storeId];
      if (cart) {
        content = (
          <CheckoutScreen
            key={page.storeId}
            token={token}
            cart={cart}
            address={address}
            onChangeLines={(lines) => setLines({ id: cart.storeId, name: cart.storeName, logo: cart.storeLogo }, lines)}
            onChangeAddress={() => pushPage({ kind: 'address' })}
            onBack={popPage}
            onBackToStore={() =>
              setPages((stack) => {
                const below = stack[stack.length - 2];
                return below?.kind === 'store' && below.storeId === cart.storeId
                  ? stack.slice(0, -1)
                  : [...stack.slice(0, -1), { kind: 'store', storeId: cart.storeId }];
              })
            }
            onOrdered={(orderId) => {
              updateCarts((c) => withLines(c, { id: cart.storeId, name: cart.storeName }, []));
              loadOrders(token);
              setTab('current');
              setPages([{ kind: 'order', orderId }]);
            }}
          />
        );
      }
    } else if (page.kind === 'order') {
      content = (
        <OrderScreen
          key={page.orderId}
          token={token}
          orderId={page.orderId}
          onBack={popPage}
          onReview={(orderId) => pushPage({ kind: 'review', orderId })}
        />
      );
    } else if (page.kind === 'review') {
      content = (
        <ReviewScreen
          key={page.orderId}
          token={token}
          orderId={page.orderId}
          onBack={popPage}
          onDone={() => {
            popPage();
            loadOrders(token);
          }}
        />
      );
    } else if (page.kind === 'address') {
      content = <AddressScreen current={address} onBack={popPage} onSave={changeAddress} />;
    }

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={styles.dashboardContainer}>{content}</View>
      </SafeAreaView>
    );
  }

  const currentOrder = activeOrders[0];
  const firstName = profile?.name?.split(' ')[0];
  const headerSubtitle = (
    <View style={styles.subtitleRow}>
      <View style={[styles.liveDot, { backgroundColor: connected ? '#7CFC8A' : '#FFB3B3' }]} />
      <Text style={styles.headerEmail}>
        {profile?.name || email}
        {connected ? '' : '  · hors ligne'}
      </Text>
    </View>
  );
  const back = () => setTab('home');
  const bell = (
    <TouchableOpacity style={styles.bell} onPress={() => setTab('notifications')} hitSlop={8}>
      <Text style={styles.bellIcon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={styles.bellBadge}>
          <Text style={styles.tabBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
  const header = (title: string) => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {headerSubtitle}
      </View>
      {bell}
    </View>
  );

  const renderTabContent = () => {
    if (tab === 'orders') {
      return (
        <OrdersScreen
          token={token}
          onBack={back}
          onOpenOrder={(orderId) => pushPage({ kind: 'order', orderId })}
          onReview={(orderId) => pushPage({ kind: 'review', orderId })}
        />
      );
    }
    if (tab === 'favorites') {
      return <FavoritesScreen token={token} onBack={back} onOpenStore={(storeId) => pushPage({ kind: 'store', storeId })} />;
    }
    if (tab === 'notifications') {
      return (
        <NotificationsScreen
          token={token}
          refreshKey={notifRefreshKey}
          onBack={back}
          onUnreadChange={clearUnread}
          onOpenOrder={(orderId) => pushPage({ kind: 'order', orderId })}
        />
      );
    }
    if (tab === 'settings') {
      return (
        <SettingsScreen
          address={address}
          pushEnabled={pushSetup?.status === 'enabled'}
          pushInfo={pushSetup ? (pushSetup.status === 'enabled' ? undefined : pushSetup.reason) : 'Vérification…'}
          onChangeAddress={() => pushPage({ kind: 'address' })}
          onBack={back}
        />
      );
    }
    if (tab === 'account') return <AccountScreen token={token} onBack={back} onProfileLoaded={onProfileLoaded} />;
    if (tab === 'carts') {
      return (
        <CartsScreen
          header={header('Mes paniers')}
          carts={cartList}
          onCheckout={(storeId) => pushPage({ kind: 'checkout', storeId })}
          onOpenStore={(storeId) => pushPage({ kind: 'store', storeId })}
          onClear={(storeId) => updateCarts((c) => withLines(c, { id: storeId, name: '' }, []))}
          onBrowse={back}
        />
      );
    }
    if (tab === 'current') {
      if (currentOrder) {
        return (
          <>
            {activeOrders.length > 1 && (
              <ScrollView horizontal style={styles.ordersStrip} contentContainerStyle={{ gap: 8, padding: 8 }}>
                {activeOrders.map((o) => (
                  <TouchableOpacity key={o.id} style={styles.orderChip} onPress={() => pushPage({ kind: 'order', orderId: o.id })}>
                    <Text style={styles.orderChipText} numberOfLines={1}>
                      {o.store?.name || 'Commande'} · {orderStatus(o.status).label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <OrderScreen
              key={currentOrder.id}
              token={token}
              orderId={currentOrder.id}
              onBack={back}
              onReview={(orderId) => pushPage({ kind: 'review', orderId })}
            />
          </>
        );
      }
      return (
        <>
          {header('Commande en cours')}
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛵</Text>
            <Text style={styles.emptyText}>Aucune commande en cours</Text>
            <Text style={styles.emptyHint}>Vos commandes se suivent ici en direct, du commerce à votre porte.</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={back}>
              <Text style={styles.emptyButtonText}>Commander</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }
    return (
      <HomeScreen
        header={header(firstName ? `Bonjour ${firstName}` : 'Accueil')}
        address={address}
        carts={cartList}
        onChangeAddress={() => pushPage({ kind: 'address' })}
        onOpenStore={(store) => pushPage({ kind: 'store', storeId: store.id })}
        onOpenCart={(storeId) => pushPage({ kind: 'store', storeId })}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.dashboardContainer}>
        {renderTabContent()}

        <View style={styles.bottomTabBar}>
          <TouchableOpacity style={styles.tabButton} onPress={() => setMenuOpen(true)}>
            <View>
              <Text style={styles.tabIcon}>☰</Text>
              {unreadCount > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tabLabel}>Menu</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabButton, tab === 'home' && styles.tabButtonActive]} onPress={() => setTab('home')}>
            <Text style={styles.tabIcon}>🏠</Text>
            <Text style={[styles.tabLabel, tab === 'home' && styles.tabLabelActive]}>Accueil</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabButton, tab === 'carts' && styles.tabButtonActive]} onPress={() => setTab('carts')}>
            <View>
              <Text style={styles.tabIcon}>🛒</Text>
              {cartItems > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: COLORS.success }]}>
                  <Text style={styles.tabBadgeText}>{cartItems}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === 'carts' && styles.tabLabelActive]}>Paniers</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tabButton, tab === 'current' && styles.tabButtonActive]} onPress={() => setTab('current')}>
            <View>
              <Text style={styles.tabIcon}>🛵</Text>
              {activeOrders.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{activeOrders.length}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === 'current' && styles.tabLabelActive]}>Commande en cours</Text>
          </TouchableOpacity>
        </View>
      </View>

      {banner && (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.9}
          onPress={() => {
            const orderId = banner.orderId;
            setBanner(null);
            pushPage({ kind: 'order', orderId });
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>🔔 {banner.title}</Text>
            <Text style={styles.bannerText} numberOfLines={2}>
              {banner.message}
            </Text>
          </View>
          <Text style={styles.bannerAction}>Voir ›</Text>
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
              <TouchableOpacity onPress={() => setMenuOpen(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              <View style={styles.profileBlock}>
                <Text style={styles.profileBlockLabel}>Livrer à</Text>
                <TouchableOpacity style={styles.profileCurrent} onPress={() => pushPage({ kind: 'address' })}>
                  <Text style={styles.profileName} numberOfLines={2}>
                    📍 {address?.label || 'Choisir mon adresse'}
                  </Text>
                </TouchableOpacity>
              </View>

              {DRAWER_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.tab}
                  style={[styles.menuItem, tab === item.tab && styles.menuItemActive]}
                  onPress={() => openFromMenu(item.tab)}
                >
                  <Text style={styles.menuItemText}>
                    {item.label}
                    {item.tab === 'notifications' && unreadCount > 0 ? `  (${unreadCount})` : ''}
                    {item.tab === 'orders' && activeOrders.length > 0 ? `  (${activeOrders.length} en cours)` : ''}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={[styles.menuItem, styles.menuItemLogout]} onPress={handleLogout}>
                <Text style={styles.menuItemLogoutText}>🚪 Déconnexion</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
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
  bell: {
    padding: 6,
  },
  bellIcon: {
    fontSize: 22,
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
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
    backgroundColor: COLORS.primary,
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
  profileBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  profileBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  profileCurrent: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dashboardContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: COLORS.primary,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  emptyHint: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
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
  switchMode: {
    marginTop: 18,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  ordersStrip: {
    flexGrow: 0,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  orderChip: {
    backgroundColor: '#EAF3FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 240,
  },
  orderChipText: {
    color: COLORS.primary,
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
  tabButtonActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
