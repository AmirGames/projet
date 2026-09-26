import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, ApiError, apiFetch, formatEuros, setUnauthorizedHandler } from '../lib/api';
import { clearSession, DEFAULT_PREFS, loadPrefs, loadSession, Prefs, savePrefs, saveSession, Session } from '../lib/session';
import { Delivery, Driver, formatKm, Offer } from '../lib/deliveries';
import { useDriverAlerts } from '../lib/useDriverAlerts';
import { DutyMode, Tracking, useDriverLocation } from '../lib/useDriverLocation';
import { useRealtimeEvent } from '../lib/realtime';
import { onDriverNotificationTap, PushDriverData, PushSetup, registerForPush, unregisterPush } from '../lib/push';
import { COLORS, DARK } from '../components/ui';
import DashboardScreen, { EarningsSummary } from '../components/screens/DashboardScreen';
import DeliveryScreen from '../components/screens/DeliveryScreen';
import HistoryScreen from '../components/screens/HistoryScreen';
import EarningsScreen from '../components/screens/EarningsScreen';
import ReviewsScreen from '../components/screens/ReviewsScreen';
import NotificationsScreen from '../components/screens/NotificationsScreen';
import SupportScreen from '../components/screens/SupportScreen';
import SettingsScreen from '../components/screens/SettingsScreen';
import AccountScreen from '../components/screens/AccountScreen';

/** Filet de sécurité si la connexion temps réel tombe : les propositions sont relues. */
const OFFERS_POLL_MS = 10_000;

const DRAWER_ITEMS = [
  { tab: 'history', label: '🗂️ Historique' },
  { tab: 'earnings', label: '💶 Revenus' },
  { tab: 'reviews', label: '⭐ Mes avis' },
  { tab: 'notifications', label: '🔔 Notifications' },
  { tab: 'support', label: '💬 Support' },
  { tab: 'settings', label: '⚙️ Paramètres' },
  { tab: 'account', label: '👤 Mon Compte' },
];

export default function DeliveryApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [tab, setTab] = useState<string>('dashboard');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<Delivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [banner, setBanner] = useState<Offer | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [answeringOfferId, setAnsweringOfferId] = useState<string | null>(null);
  const [pushSetup, setPushSetup] = useState<PushSetup | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PushDriverData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);

  const token = session?.accessToken || '';
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const pushTokenRef = useRef<string | null>(null);

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  };

  const patchDriver = useCallback((patch: Partial<Driver>) => setDriver((d) => (d ? { ...d, ...patch } : d)), []);

  const loadOffers = useCallback(async (accessToken: string) => {
    if (!accessToken) return;
    try {
      const res = await apiFetch<{ data: Offer[] }>('/api/drivers/offers', accessToken);
      setOffers(res.data || []);
    } catch {
      // Les propositions déjà affichées restent : elles expirent d'elles-mêmes.
    }
  }, []);

  /** Tout ce que l'accueil affiche : le livreur, ses courses, ses gains. */
  const loadAll = useCallback(
    async (accessToken: string) => {
      if (!accessToken) return;
      await Promise.all([
        apiFetch<{ data: Driver }>('/api/drivers/me', accessToken)
          .then((res) => setDriver(res.data))
          .catch((e) => console.warn('Profil livreur indisponible', e)),
        apiFetch<{ data: Delivery[] }>('/api/drivers/deliveries?status=ACTIVE', accessToken)
          .then((res) => setActiveDeliveries(res.data || []))
          .catch(() => undefined),
        apiFetch<EarningsSummary>('/api/drivers/earnings', accessToken)
          .then(setEarnings)
          .catch(() => undefined),
        loadOffers(accessToken),
      ]);
    },
    [loadOffers]
  );

  const openSession = async (next: Session) => {
    setSession(next);
    setEmail(next.email);
    setTab('dashboard');
    await loadAll(next.accessToken);
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
    setDriver(null);
    setEarnings(null);
    setOffers([]);
    setActiveDeliveries([]);
    setOpenDeliveryId(null);
    setTab('dashboard');
    setMenuOpen(false);
    setBanner(null);
    setUnreadCount(0);
    setSupportUnread(0);
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
          if (response.ok && data.accessToken && data.driver) {
            const renewed = { ...stored, accessToken: data.accessToken };
            await saveSession(renewed);
            await openSession(renewed);
          } else if (response.ok || response.status === 401 || response.status === 403) {
            // Jeton refusé, ou compte qui n'est plus livreur : on se reconnecte.
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

  // Ce téléphone reçoit les courses même application fermée.
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

  // Toucher une notification ouvre la course, la proposition ou le support.
  useEffect(() => onDriverNotificationTap(setPendingOpen), []);

  const loadUnread = useCallback(async (accessToken: string) => {
    try {
      const [notifs, support] = await Promise.all([
        apiFetch<{ unreadCount: number }>('/api/notifications?limit=1', accessToken),
        apiFetch<{ data: { unread: number } }>('/api/drivers/support/unread', accessToken),
      ]);
      setUnreadCount(notifs.unreadCount || 0);
      setSupportUnread(support.data?.unread || 0);
    } catch {
      // Les compteurs restent tels quels : ils seront recalculés plus tard.
    }
  }, []);

  useEffect(() => {
    if (token) loadUnread(token);
  }, [token, loadUnread]);

  // Position : transmise tant que le livreur est en ligne ou sur une course,
  // avec la précision qu'il faut à ce moment-là (voir useDriverLocation).
  const [tracking, setTracking] = useState<Tracking>({ target: null, navigating: false });
  const dutyMode: DutyMode = activeDeliveries.length > 0 ? 'delivery' : driver?.isOnline ? 'idle' : 'off';
  const { position, gps } = useDriverLocation(token, dutyMode, tracking);

  // Une proposition expirée disparaît d'elle-même, et la sonnerie avec : un
  // seul réveil, à l'échéance de la plus proche.
  useEffect(() => {
    if (offers.length === 0) return;
    const next = Math.min(...offers.map((o) => new Date(o.expiresAt).getTime()));
    const id = setTimeout(() => {
      setOffers((list) => list.filter((o) => new Date(o.expiresAt).getTime() > Date.now()));
    }, Math.max(0, next - Date.now()) + 50);
    return () => clearTimeout(id);
  }, [offers]);

  useEffect(() => {
    if (banner && !offers.some((o) => o.id === banner.id)) setBanner(null);
  }, [offers, banner]);

  // Un même changement arrive souvent par plusieurs événements : un seul
  // rechargement suffit.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = () => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => loadAll(token), 300);
  };

  const { connected, ring } = useDriverAlerts({
    token,
    soundEnabled: prefs.soundEnabled,
    pendingOffers: offers.length,
    onOffer: (offer) => {
      setOffers((list) => (list.some((o) => o.id === offer.id) ? list : [...list, offer]));
      if (tabRef.current !== 'dashboard') setBanner(offer);
    },
    onChanged: scheduleReload,
    onNotification: () => {
      loadUnread(token);
      setNotifRefreshKey((k) => k + 1);
    },
  });

  // Filet de sécurité : les propositions ne sont relues que si la connexion
  // temps réel est coupée. Connectée, elle les apporte d'elle-même, et la
  // reconnexion recharge tout (onChanged).
  useEffect(() => {
    if (!token || !driver?.isOnline || connected) return;
    const id = setInterval(() => loadOffers(token), OFFERS_POLL_MS);
    return () => clearInterval(id);
  }, [token, driver?.isOnline, connected, loadOffers]);

  useRealtimeEvent('mis-hors-ligne', (e: { raison?: string; message?: string }) => {
    patchDriver({ isOnline: false, isAvailable: false });
    Alert.alert('Vous êtes hors ligne', e?.message || e?.raison || 'Votre position n’arrivait plus au serveur.');
  });
  useRealtimeEvent('pause-terminee', (e: { isAvailable: boolean; isOnline: boolean }) => {
    patchDriver({ isAvailable: e.isAvailable, isOnline: e.isOnline, pausedUntil: null, pauseReason: null });
  });
  useRealtimeEvent('gps-perdu', () => patchDriver({ gpsLostAt: new Date().toISOString() }));
  useRealtimeEvent('gps-retabli', () => patchDriver({ gpsLostAt: null }));
  useRealtimeEvent('support-message', (m: { sender?: string }) => {
    if (m?.sender === 'SUPPORT' && tabRef.current !== 'support') setSupportUnread((n) => n + 1);
  });

  const openDelivery = (deliveryId: string) => {
    setBanner(null);
    setMenuOpen(false);
    setOpenDeliveryId(deliveryId);
  };

  useEffect(() => {
    if (!pendingOpen || !session) return;
    setPendingOpen(null);
    if (pendingOpen.deliveryId) {
      openDelivery(pendingOpen.deliveryId);
    } else if (pendingOpen.tag === 'support') {
      setOpenDeliveryId(null);
      setTab('support');
    } else {
      setOpenDeliveryId(null);
      setTab('dashboard');
      loadAll(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpen, session]);

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
        Alert.alert('Erreur', data.error || data.message || 'Connexion échouée');
        return;
      }

      // Seul un compte livreur ouvre cette application.
      try {
        await apiFetch('/api/drivers/me', data.accessToken);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          Alert.alert('Accès refusé', "Ce compte n'est pas un compte livreur.");
          return;
        }
        throw e;
      }

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

  const toggleOnline = async (online: boolean) => {
    setTogglingOnline(true);
    try {
      const res = await apiFetch<{ isOnline: boolean; isAvailable: boolean; pausedUntil: string | null }>(
        '/api/drivers/availability',
        token,
        { method: 'PATCH', body: { isOnline: online } }
      );
      patchDriver({ isOnline: res.isOnline, isAvailable: res.isAvailable, pausedUntil: res.pausedUntil });
      if (res.isOnline) loadOffers(token);
      else setOffers([]);
    } catch (e: any) {
      Alert.alert(online ? 'Mise en ligne impossible' : 'Erreur', e.message || 'Réessayez');
    } finally {
      setTogglingOnline(false);
    }
  };

  const answerOffer = async (offer: Offer, answer: 'accept' | 'decline') => {
    setAnsweringOfferId(offer.id);
    try {
      const res = await apiFetch<{ data?: { id?: string } }>(`/api/drivers/offers/${offer.id}/${answer}`, token, {
        method: 'POST',
      });
      setOffers((list) => list.filter((o) => o.id !== offer.id));
      setBanner(null);
      if (answer === 'accept') {
        await loadAll(token);
        // Direction la course : adresse de retrait et itinéraire.
        const deliveryId = res.data?.id || offer.deliveryId;
        if (deliveryId) openDelivery(deliveryId);
      }
    } catch (e: any) {
      Alert.alert('Course', e.message || "La réponse n'a pas été enregistrée");
      loadOffers(token);
    } finally {
      setAnsweringOfferId(null);
    }
  };

  const openFromMenu = (target: string) => {
    setOpenDeliveryId(null);
    setTab(target);
    setMenuOpen(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadAll(token);
    setRefreshing(false);
  };

  const clearSupportUnread = useCallback(() => setSupportUnread(0), []);
  const onDriverLoaded = useCallback((d: Driver) => setDriver(d), []);

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
          <Text style={styles.subtitle}>Livreur</Text>

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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Se connecter</Text>}
          </TouchableOpacity>

          <Text style={styles.signupHint}>Pas encore livreur ? Inscrivez-vous sur le site Zupone.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Delivery Detail Screen
  if (openDeliveryId) {
    return (
      <SafeAreaView style={[styles.container, styles.containerDark]} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <DeliveryScreen
          key={openDeliveryId}
          deliveryId={openDeliveryId}
          token={token}
          position={position}
          navigationApp={prefs.navigationApp}
          onBack={() => setOpenDeliveryId(null)}
          onChanged={() => loadAll(token)}
          onTrackingChange={setTracking}
        />
      </SafeAreaView>
    );
  }

  const currentDelivery = activeDeliveries[0];
  const headerSubtitle = (
    <View style={styles.subtitleRow}>
      <View style={[styles.liveDot, { backgroundColor: connected ? '#7CFC8A' : '#FFB3B3' }]} />
      <Text style={styles.headerEmail}>
        {driver?.name || email}
        {connected ? '' : '  · hors ligne'}
      </Text>
    </View>
  );
  const back = () => setTab('dashboard');
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

  const renderTabContent = () => {
    if (tab === 'history') return <HistoryScreen token={token} onBack={back} onOpenDelivery={openDelivery} />;
    if (tab === 'earnings') return <EarningsScreen token={token} onBack={back} />;
    if (tab === 'reviews') return <ReviewsScreen token={token} onBack={back} />;
    if (tab === 'notifications') {
      return (
        <NotificationsScreen token={token} refreshKey={notifRefreshKey} onBack={back} onUnreadChange={setUnreadCount} />
      );
    }
    if (tab === 'support') return <SupportScreen token={token} onBack={back} onRead={clearSupportUnread} />;
    if (tab === 'settings') {
      return (
        <SettingsScreen
          prefs={prefs}
          onChangePrefs={updatePrefs}
          onTestSound={ring}
          pushEnabled={pushSetup?.status === 'enabled'}
          pushInfo={pushSetup ? (pushSetup.status === 'enabled' ? undefined : pushSetup.reason) : 'Vérification…'}
          gps={gps}
          onBack={back}
        />
      );
    }
    if (tab === 'account') return <AccountScreen token={token} onBack={back} onDriverLoaded={onDriverLoaded} />;
    if (tab === 'course') {
      if (currentDelivery) {
        return (
          <DeliveryScreen
            key={currentDelivery.id}
            deliveryId={currentDelivery.id}
            token={token}
            position={position}
            navigationApp={prefs.navigationApp}
            onBack={back}
            onChanged={() => loadAll(token)}
            onTrackingChange={setTracking}
          />
        );
      }
      return (
        <>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Course en cours</Text>
              {headerSubtitle}
            </View>
            {bell}
          </View>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🛵</Text>
            <Text style={styles.emptyText}>Aucune course en cours</Text>
            <Text style={styles.emptyHint}>
              {driver?.isOnline ? 'Les courses proposées apparaissent sur l’accueil.' : 'Passez en ligne pour recevoir des courses.'}
            </Text>
            <TouchableOpacity style={styles.emptyButton} onPress={back}>
              <Text style={styles.emptyButtonText}>Aller à l’accueil</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }
    return (
      <DashboardScreen
        header={
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Accueil</Text>
              {headerSubtitle}
            </View>
            {bell}
          </View>
        }
        token={token}
        driver={driver}
        earnings={earnings}
        offers={offers}
        activeDeliveries={activeDeliveries}
        gps={gps}
        refreshing={refreshing}
        onRefresh={refresh}
        togglingOnline={togglingOnline}
        onToggleOnline={toggleOnline}
        answeringOfferId={answeringOfferId}
        onAnswerOffer={answerOffer}
        onOpenDelivery={(d) => openDelivery(d.id)}
        onDriverChange={patchDriver}
        onSeeEarnings={() => setTab('earnings')}
        onSeeAccount={() => setTab('account')}
      />
    );
  };

  // L'écran de course est au thème sombre, jusque sous la barre d'état.
  const courseDark = tab === 'course' && Boolean(currentDelivery);

  return (
    <SafeAreaView style={[styles.container, courseDark && styles.containerDark]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={[styles.dashboardContainer, courseDark && styles.containerDark]}>
        {renderTabContent()}

        <View style={[styles.bottomTabBar, courseDark && styles.bottomTabBarDark]}>
          <TouchableOpacity style={styles.tabButton} onPress={() => setMenuOpen(true)}>
            <View>
              <Text style={styles.tabIcon}>☰</Text>
              {supportUnread > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{supportUnread}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tabLabel}>Menu</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, tab === 'dashboard' && styles.tabButtonActive]}
            onPress={() => setTab('dashboard')}
          >
            <View>
              <Text style={styles.tabIcon}>🏠</Text>
              {offers.length > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: COLORS.success }]}>
                  <Text style={styles.tabBadgeText}>{offers.length}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === 'dashboard' && styles.tabLabelActive]}>Accueil</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, tab === 'course' && styles.tabButtonActive]}
            onPress={() => setTab('course')}
          >
            <View>
              <Text style={styles.tabIcon}>🛵</Text>
              {currentDelivery && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>1</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, tab === 'course' && styles.tabLabelActive]}>Course en cours</Text>
          </TouchableOpacity>
        </View>
      </View>

      {banner && (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.9}
          onPress={() => {
            setBanner(null);
            setTab('dashboard');
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>🔔 Nouvelle course · {formatEuros(banner.payout)}</Text>
            <Text style={styles.bannerText} numberOfLines={1}>
              {banner.pickupStore || 'Commerce'} · livraison {formatKm(banner.distanceKm)}
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
              {driver && (
                <View style={styles.driverBlock}>
                  <Text style={styles.driverBlockLabel}>Livreur</Text>
                  <View style={styles.driverCurrent}>
                    <Text style={styles.driverName} numberOfLines={1}>
                      {driver.isOnline ? '🟢' : '⚪'} {driver.name || email}
                    </Text>
                  </View>
                </View>
              )}

              {DRAWER_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.tab}
                  style={[styles.menuItem, tab === item.tab && styles.menuItemActive]}
                  onPress={() => openFromMenu(item.tab)}
                >
                  <Text style={styles.menuItemText}>
                    {item.label}
                    {item.tab === 'notifications' && unreadCount > 0 ? `  (${unreadCount})` : ''}
                    {item.tab === 'support' && supportUnread > 0 ? `  (${supportUnread})` : ''}
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
  containerDark: {
    backgroundColor: DARK.bg,
  },
  bottomTabBarDark: {
    backgroundColor: DARK.card,
    borderTopColor: DARK.border,
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
  driverBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  driverBlockLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  driverCurrent: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  driverName: {
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
    flex: 1,
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
  signupHint: {
    marginTop: 20,
    color: '#fff',
    fontSize: 14,
    opacity: 0.85,
    textAlign: 'center',
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
