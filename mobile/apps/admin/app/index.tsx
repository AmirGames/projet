import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, ApiError, apiFetch, setMfaRequiredHandler, setUnauthorizedHandler, setSessionRenewedHandler } from '../lib/api';
import MfaScreen from '../components/MfaScreen';
import { chargerPermissions, MesPermissions, peutLire, peutModifier } from '../lib/permissions';
import { clearSession, loadSession, saveSession, Session } from '../lib/session';
import { COLORS, ScreenHeader } from '../components/ui';
import DashboardScreen from '../components/screens/DashboardScreen';
import MerchantsScreen from '../components/screens/MerchantsScreen';
import DriversScreen from '../components/screens/DriversScreen';
import SupportScreen from '../components/screens/SupportScreen';
import AccountScreen from '../components/screens/AccountScreen';
import PayoutsScreen from '../components/screens/PayoutsScreen';
import TeamScreen from '../components/screens/TeamScreen';
import { useDerniereValeur } from '../lib/useDerniereValeur';

/**
 * L'application de l'équipe d'administration (superowner et membres de
 * l'équipe). Elle n'est qu'un client de l'API /api/superowner : chaque route
 * contrôle elle-même le rôle et les permissions du compte, et journalise les
 * actions. Les onglets sont masqués selon /me/permissions par simple confort.
 */

type Onglet = 'dashboard' | 'merchants' | 'drivers' | 'payouts' | 'support' | 'team' | 'account';

// `superOwnerSeul` : l'équipe n'est réglable que par le superowner (le serveur
// refuse tout autre compte, voir team.admin.routes).
const ONGLETS: { id: Onglet; label: string; icone: string; section?: string; superOwnerSeul?: boolean }[] = [
  { id: 'dashboard', label: 'Accueil', icone: '📊', section: 'dashboard' },
  { id: 'merchants', label: 'Commerces', icone: '🏪', section: 'organizations' },
  { id: 'drivers', label: 'Livreurs', icone: '🛵', section: 'drivers' },
  { id: 'payouts', label: 'Versements', icone: '💶', section: 'payouts' },
  { id: 'support', label: 'Support', icone: '💬', section: 'support-tickets' },
  { id: 'team', label: 'Équipe', icone: '🛡️', superOwnerSeul: true },
  { id: 'account', label: 'Compte', icone: '👤' },
];

interface ReponseConnexion {
  accessToken: string;
  refreshToken?: string;
  user?: { id: string; email: string; isSuperOwner: boolean; isSystemAdmin: boolean };
}

/** Un onglet s'affiche si le rôle ouvre sa section (confort : le serveur tranche). */
function visible(o: (typeof ONGLETS)[number], perms: MesPermissions) {
  if (o.superOwnerSeul) return perms.isSuperOwner;
  return !o.section || peutLire(perms, o.section);
}

async function postAuth(path: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data?.error || data?.message || `Erreur ${response.status}`, response.status);
  return data as ReponseConnexion;
}

export default function AdminApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [permissions, setPermissions] = useState<MesPermissions | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const sessionRef = useDerniereValeur(session);

  const handleLogout = useCallback(() => {
    const current = sessionRef.current;
    // Ferme la session côté serveur : le jeton ne vaut plus rien, même copié.
    if (current) postAuth('/api/auth/logout', { refreshToken: current.refreshToken }).catch(() => undefined);
    clearSession();
    setSession(null);
    setPermissions(null);
    setMfaRequired(false);
    setPassword('');
    setOnglet('dashboard');
  }, [sessionRef]);

  /** Ouvre la session si le compte appartient à l'équipe d'administration. */
  const ouvrir = async (next: Session): Promise<boolean> => {
    try {
      const mfa = await apiFetch<{ required: boolean; verified: boolean; recovery: boolean }>('/api/auth/mfa', next.accessToken);
      if (mfa.required && (!mfa.verified || mfa.recovery)) {
        await saveSession(next); setSession(next); setMfaRequired(true); return true;
      }
      const perms = await chargerPermissions(next.accessToken);
      await saveSession(next);
      setPermissions(perms);
      setSession(next);
      setEmail(next.email);
      const premier = ONGLETS.find((o) => visible(o, perms));
      setOnglet(premier?.id ?? 'account');
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        postAuth('/api/auth/logout', { refreshToken: next.refreshToken }).catch(() => undefined);
        await clearSession();
        Alert.alert('Accès refusé', 'Ce compte ne fait pas partie de l’équipe d’administration ZupEat.');
        return false;
      }
      throw e;
    }
  };

  // Démarrage : on reprend la session enregistrée et on renouvelle le jeton.
  useEffect(() => {
    setMfaRequiredHandler(() => setMfaRequired(true));
    (async () => {
      const stored = await loadSession();
      if (stored?.refreshToken) {
        try {
          const data = await postAuth('/api/auth/refresh', { refreshToken: stored.refreshToken });
          await ouvrir({
            ...stored,
            accessToken: data.accessToken,
            // Le jeton de renouvellement tourne : l'ancien ne vaut plus.
            refreshToken: data.refreshToken || stored.refreshToken,
            userId: data.user?.id ?? stored.userId,
          });
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403)) await clearSession();
          setEmail(stored.email);
        }
      }
      setBooting(false);
    })();
     
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      handleLogout();
      Alert.alert('Session expirée', 'Veuillez vous reconnecter.');
    });
    // La session renouvelée en cours d'usage : l'écran garde le jeton valable.
    setSessionRenewedHandler((renewed) => setSession(renewed));
    return () => {
      setMfaRequiredHandler(null);
      setUnauthorizedHandler(null);
      setSessionRenewedHandler(null);
    };
  }, [handleLogout]);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    setLoading(true);
    try {
      const data = await postAuth('/api/auth/login', { email: email.trim(), password });
      if (!data.user?.isSuperOwner && !data.user?.isSystemAdmin) {
        postAuth('/api/auth/logout', { refreshToken: data.refreshToken }).catch(() => undefined);
        Alert.alert('Accès refusé', 'Ce compte ne fait pas partie de l’équipe d’administration.');
        return;
      }
      await ouvrir({ accessToken: data.accessToken, refreshToken: data.refreshToken || '', email: data.user.email, userId: data.user.id });
    } catch (e) {
      Alert.alert('Connexion impossible', e instanceof Error ? e.message : 'Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  };

  if (booting) {
    return (
      <View style={[styles.center, { backgroundColor: COLORS.primary }]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  if (session && mfaRequired) return <MfaScreen token={session.accessToken} onLogout={handleLogout} onDone={() => { setMfaRequired(false); void ouvrir(session).catch(() => setMfaRequired(true)); }} />;

  if (!session || !permissions) {
    return (
      <View style={styles.login}>
        <StatusBar style="light" />
        <Text style={styles.title}>ZupOne</Text>
        <Text style={styles.subtitle}>Administration</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor="#999"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
          onSubmitEditing={handleLogin}
        />
        <TouchableOpacity style={[styles.button, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Se connecter</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  const token = session.accessToken;
  const visibles = ONGLETS.filter((o) => visible(o, permissions));
  const courant = visibles.find((o) => o.id === onglet) ?? visibles[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.primary }} edges={['top']}>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        {courant.id !== 'support' && <ScreenHeader title={courant.label} subtitle={email} />}
        {courant.id === 'dashboard' && <DashboardScreen token={token} />}
        {courant.id === 'merchants' && <MerchantsScreen token={token} modifiable={peutModifier(permissions, 'organizations')} />}
        {courant.id === 'drivers' && <DriversScreen token={token} modifiable={peutModifier(permissions, 'drivers')} />}
        {courant.id === 'support' && (
          <>
            <ScreenHeader title="Support" subtitle={email} />
            <SupportScreen token={token} modifiable={peutModifier(permissions, 'support-tickets')} />
          </>
        )}
        {courant.id === 'payouts' && <PayoutsScreen token={token} modifiable={peutModifier(permissions, 'payouts')} />}
        {courant.id === 'team' && <TeamScreen token={token} monId={session.userId} />}
        {courant.id === 'account' && <AccountScreen email={email} permissions={permissions} onLogout={handleLogout} onMfa={() => setMfaRequired(true)} />}
      </View>
      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        {visibles.map((o) => (
          <TouchableOpacity key={o.id} style={styles.tab} onPress={() => setOnglet(o.id)}>
            <Text style={styles.tabIcon}>{o.icone}</Text>
            <Text style={[styles.tabLabel, o.id === courant.id && { color: COLORS.primary, fontWeight: '700' }]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  login: { flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: COLORS.primary },
  title: { fontSize: 40, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 18, color: '#fff', opacity: 0.9, textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 15, fontSize: 16, color: '#333' },
  button: { backgroundColor: '#3B4B73', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, color: '#666', marginTop: 2 },
});
