import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, FlatList } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, apiFetch, setUnauthorizedHandler } from '../lib/api';
import { clearSession, loadSession, saveSession, Session } from '../lib/session';
import { registerForPush, unregisterPush } from '../lib/push';
import { COLORS } from '../components/ui';

// ZupDrive Driver App - Main navigation
// Screens: Dashboard (courses), Course details, Earnings, Profile

interface Course {
  id: string;
  passengerId: string;
  departAddress: string;
  arriveeAddress: string;
  prixCentimes: number;
  status: 'RECHERCHE' | 'ACCEPTEE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
  createdAt: string;
}

interface DriverProfile {
  id: string;
  nomComplet: string;
  rating: number;
  totalCourses: number;
  status: 'VALIDE' | 'SUSPENDU';
}

interface Earnings {
  totalEarningsCentimes: number;
  pendingCentimes: number;
  payouts: Array<{ id: string; amount: number; status: string; period: { start: string; end: string } }>;
}

export default function ZupDriveDriverApp() {
  const [booting, setBooting] = useState(true);
  const pushToken = useRef<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<string>('home');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  const token = session?.accessToken || '';
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Boot: restore session if exists
  useEffect(() => {
    (async () => {
      try {
        const savedSession = await loadSession();
        if (savedSession) {
          setSession(savedSession);
          await fetchProfile(savedSession.accessToken);
          await fetchCourses(savedSession.accessToken);
          await fetchEarnings(savedSession.accessToken);
        }
      } catch (e) {
        logger.warn('Boot session restore failed', e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  // Handle unauthorized: clear session and go back to login
  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSession();
      setSession(null);
      setTab('home');
    });
  }, []);

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await apiFetch('/api/zupdrive/chauffeur/me', token);
      setProfile(res.data);
    } catch (e) {
      logger.warn('Failed to fetch profile', e);
    }
  }, []);

  const fetchCourses = useCallback(async (token: string) => {
    try {
      const res = await apiFetch('/api/zupdrive/courses', token);
      setCourses(res.data || []);
    } catch (e) {
      logger.warn('Failed to fetch courses', e);
    }
  }, []);

  const fetchEarnings = useCallback(async (token: string) => {
    try {
      const res = await apiFetch('/api/zupdrive/payment/earnings', token);
      setEarnings(res.data);
    } catch (e) {
      logger.warn('Failed to fetch earnings', e);
    }
  }, []);

  const handleLogin = async () => {
    if (!phone || !otp) {
      Alert.alert('Erreur', 'Veuillez entrer votre téléphone et le code OTP');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/zupdrive/chauffeur/auth/otp', null, {
        method: 'POST',
        body: { phone, otp },
      });
      const newSession: Session = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        // La connexion se fait par téléphone + code : le serveur ne renvoie pas toujours de courriel.
        email: res.data.email ?? '',
      };
      await saveSession(newSession);
      setSession(newSession);
      await fetchProfile(newSession.accessToken);
      await fetchCourses(newSession.accessToken);
      await fetchEarnings(newSession.accessToken);
      const push = await registerForPush(newSession.accessToken);
      pushToken.current = push.status === 'enabled' ? push.token : null;
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Authentification échouée');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui',
        style: 'destructive',
        onPress: async () => {
          if (session && pushToken.current) {
            await unregisterPush(session.accessToken, pushToken.current);
            pushToken.current = null;
          }
          await clearSession();
          setSession(null);
          setProfile(null);
          setCourses([]);
          setTab('home');
        },
      },
    ]);
  };

  const acceptCourse = async (courseId: string) => {
    try {
      await apiFetch(`/api/zupdrive/courses/${courseId}/accept`, token, {
        method: 'POST',
      });
      Alert.alert('Succès', 'Course acceptée');
      await fetchCourses(token);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible d\'accepter la course');
    }
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!session) {
    // Login screen
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <Text style={styles.title}>ZupDrive Chauffeur</Text>

          <View style={styles.input}>
            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              placeholder="+32 4XX XXX XXX"
              value={phone}
              onChangeText={setPhone}
              editable={!loading}
              style={styles.textInput}
            />
          </View>

          <View style={styles.input}>
            <Text style={styles.label}>Code OTP</Text>
            <TextInput
              placeholder="123456"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              editable={!loading}
              style={styles.textInput}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Se connecter</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Main app
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {tab === 'home' && '📍 Courses'}
          {tab === 'earnings' && '💰 Revenus'}
          {tab === 'profile' && '👤 Profil'}
        </Text>
        {profile && <Text style={styles.headerSubtitle}>{profile.nomComplet}</Text>}
      </View>

      {/* Content */}
      {tab === 'home' && (
        <FlatList
          data={courses.filter((c) => ['RECHERCHE', 'ACCEPTEE'].includes(c.status))}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.courseCard}>
              <Text style={styles.courseFrom}>{item.departAddress}</Text>
              <Text style={styles.courseTo}>→ {item.arriveeAddress}</Text>
              <View style={styles.courseFooter}>
                <Text style={styles.coursePrice}>€{(item.prixCentimes / 100).toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptCourse(item.id)}
                  disabled={item.status === 'ACCEPTEE'}
                >
                  <Text style={styles.acceptButtonText}>
                    {item.status === 'ACCEPTEE' ? '✓ Acceptée' : 'Accepter'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>Pas de courses disponibles</Text>}
          contentContainerStyle={styles.content}
        />
      )}

      {tab === 'earnings' && earnings && (
        <ScrollView style={styles.content}>
          <View style={styles.earningsCard}>
            <Text style={styles.earningsLabel}>Revenus totaux</Text>
            <Text style={styles.earningsAmount}>€{(earnings.totalEarningsCentimes / 100).toFixed(2)}</Text>
            <Text style={styles.earningsPending}>En attente: €{(earnings.pendingCentimes / 100).toFixed(2)}</Text>
          </View>
          {earnings.payouts.map((p) => (
            <View key={p.id} style={styles.payoutCard}>
              <Text style={styles.payoutLabel}>{p.period.start} → {p.period.end}</Text>
              <Text style={styles.payoutAmount}>€{(p.amount / 100).toFixed(2)}</Text>
              <Text style={styles.payoutStatus}>{p.status}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === 'profile' && profile && (
        <ScrollView style={styles.content}>
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{profile.nomComplet}</Text>
            <View style={styles.profileStat}>
              <Text style={styles.profileLabel}>Rating</Text>
              <Text style={styles.profileValue}>⭐ {profile.rating.toFixed(1)}</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileLabel}>Courses complétées</Text>
              <Text style={styles.profileValue}>{profile.totalCourses}</Text>
            </View>
            <View style={styles.profileStat}>
              <Text style={styles.profileLabel}>Status</Text>
              <Text style={styles.profileValue}>{profile.status === 'VALIDE' ? '✓ Validé' : '⚠️ Suspendu'}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Se déconnecter</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Tab navigation */}
      <View style={styles.tabBar}>
        {['home', 'earnings', 'profile'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'home' && '📍'}
              {t === 'earnings' && '💰'}
              {t === 'profile' && '👤'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loginContainer: { paddingHorizontal: 20, paddingVertical: 40, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#1F2937' },
  input: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#374151' },
  textInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { backgroundColor: '#1F2937', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  headerSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  content: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  courseCard: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#0369A1' },
  courseFrom: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  courseTo: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  courseFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  coursePrice: { fontSize: 14, fontWeight: 'bold', color: '#0369A1' },
  acceptButton: { backgroundColor: '#0369A1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  acceptButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },

  earningsCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 20, marginBottom: 16 },
  earningsLabel: { fontSize: 12, color: '#D1D5DB' },
  earningsAmount: { fontSize: 32, fontWeight: 'bold', color: '#10B981', marginTop: 8 },
  earningsPending: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  payoutCard: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 8 },
  payoutLabel: { fontSize: 12, color: '#6B7280' },
  payoutAmount: { fontSize: 16, fontWeight: 'bold', color: '#1F2937', marginTop: 4 },
  payoutStatus: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

  profileCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16 },
  profileName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  profileStat: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  profileLabel: { fontSize: 13, color: '#6B7280' },
  profileValue: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  logoutButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#fff' },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderTopWidth: 3, borderTopColor: '#1F2937' },
  tabLabel: { fontSize: 20 },
  tabLabelActive: { fontSize: 22 },
});

// Simple logger
const logger = {
  warn: (msg: string, e?: any) => console.warn(msg, e),
  info: (msg: string, data?: any) => console.log(msg, data),
};
