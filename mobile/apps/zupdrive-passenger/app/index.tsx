import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, FlatList } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL, apiFetch, setUnauthorizedHandler } from '../lib/api';
import { clearSession, loadSession, saveSession, Session } from '../lib/session';
import { registerForPush } from '../lib/push';
import { COLORS } from '../components/ui';

interface Course {
  id: string;
  chauffeurId?: string;
  departAdresse: string;
  arriveeAdresse: string;
  prixCentimes: number;
  statut: string;
  chauffeur?: { nomComplet: string; rating: number };
}

interface PassengerProfile {
  id: string;
  name: string;
  email: string;
}

export default function ZupDrivePassengerApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<string>('search');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<PassengerProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  // Boot: restore session
  useEffect(() => {
    (async () => {
      try {
        const savedSession = await loadSession();
        if (savedSession) {
          setSession(savedSession);
          await fetchProfile(savedSession.accessToken);
        }
      } catch (e) {
        console.warn('Boot failed', e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSession();
      setSession(null);
    });
  }, []);

  const fetchProfile = useCallback(async (token: string) => {
    try {
      const res = await apiFetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(res.data);
    } catch (e) {
      console.warn('Failed to fetch profile', e);
    }
  }, []);

  const searchCourses = async () => {
    if (!fromAddress || !toAddress) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse de départ et d\'arrivée');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/zupdrive/courses/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
        body: JSON.stringify({ fromAddress, toAddress }),
      });
      setCourses(res.data || []);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Recherche échouée');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Erreur', 'Veuillez entrer vos identifiants');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const newSession: Session = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        expiresAt: res.data.expiresAt,
        userId: res.data.userId,
      };
      await saveSession(newSession);
      setSession(newSession);
      await fetchProfile(newSession.accessToken);
      await registerForPush(newSession.accessToken);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Connexion échouée');
    } finally {
      setLoading(false);
    }
  };

  const acceptCourse = async (courseId: string) => {
    try {
      const res = await apiFetch(`${API_URL}/api/zupdrive/courses/${courseId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      setSelectedCourse(res.data);
      Alert.alert('Succès', 'Course confirmée! Votre chauffeur arrive.');
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de confirmer');
    }
  };

  const handleLogout = async () => {
    Alert.alert('Déconnexion', 'Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Oui',
        onPress: async () => {
          await clearSession();
          setSession(null);
          setProfile(null);
        },
      },
    ]);
  };


  if (booting) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <Text style={styles.title}>ZupDrive Passager</Text>

          <View style={styles.input}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              placeholder="votre@email.com"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
              style={styles.textInput}
            />
          </View>

          <View style={styles.input}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {tab === 'search' && '🚗 Rechercher'}
          {tab === 'tracking' && '📍 Suivi'}
          {tab === 'history' && '📋 Historique'}
          {tab === 'profile' && '👤 Profil'}
        </Text>
      </View>

      {tab === 'search' && (
        <ScrollView style={styles.content}>
          <View style={styles.searchCard}>
            <Text style={styles.label}>Départ</Text>
            <TextInput
              placeholder="Votre adresse"
              value={fromAddress}
              onChangeText={setFromAddress}
              editable={!loading}
              style={styles.textInput}
            />

            <Text style={[styles.label, { marginTop: 12 }]}>Destination</Text>
            <TextInput
              placeholder="Destination"
              value={toAddress}
              onChangeText={setToAddress}
              editable={!loading}
              style={styles.textInput}
            />

            <TouchableOpacity style={styles.button} onPress={searchCourses} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Rechercher</Text>
              )}
            </TouchableOpacity>
          </View>

          <FlatList
            data={courses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.quoteCard}>
                <Text style={styles.quotePrice}>€{(item.prixCentimes / 100).toFixed(2)}</Text>
                {item.chauffeur ? (
                  <View style={styles.driverInfo}>
                    <Text style={styles.driverName}>{item.chauffeur.nomComplet}</Text>
                    <Text style={styles.driverRating}>⭐ {item.chauffeur.rating.toFixed(1)}</Text>
                  </View>
                ) : (
                  <Text style={styles.noDriver}>Chauffeur en cours d'assignation...</Text>
                )}
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => acceptCourse(item.id)}
                  disabled={item.statut === 'ACCEPTEE'}
                >
                  <Text style={styles.acceptButtonText}>
                    {item.statut === 'ACCEPTEE' ? '✓ Acceptée' : 'Accepter'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            scrollEnabled={false}
          />
        </ScrollView>
      )}

      {tab === 'tracking' && selectedCourse && (
        <ScrollView style={styles.content}>
          <View style={styles.trackingCard}>
            <Text style={styles.trackingTitle}>Trajet en cours</Text>
            <View style={styles.addressLine}>
              <Text style={styles.label}>Départ</Text>
              <Text style={styles.address}>{selectedCourse.departAdresse}</Text>
            </View>
            <View style={styles.addressLine}>
              <Text style={styles.label}>Destination</Text>
              <Text style={styles.address}>{selectedCourse.arriveeAdresse}</Text>
            </View>
            {selectedCourse.chauffeur && (
              <View style={styles.driverCard}>
                <Text style={styles.driverName}>{selectedCourse.chauffeur.nomComplet}</Text>
                <Text style={styles.eta}>ETA: 5 minutes</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {tab === 'history' && (
        <ScrollView style={styles.content}>
          <Text style={styles.emptyText}>Pas de courses complétées</Text>
        </ScrollView>
      )}

      {tab === 'profile' && profile && (
        <ScrollView style={styles.content}>
          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{profile.name}</Text>
            <Text style={styles.profileEmail}>{profile.email}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>Se déconnecter</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <View style={styles.tabBar}>
        {['search', 'tracking', 'history', 'profile'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'search' && '🚗'}
              {t === 'tracking' && '📍'}
              {t === 'history' && '📋'}
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
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 30, textAlign: 'center', color: '#0369A1' },
  input: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#374151' },
  textInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { backgroundColor: '#0369A1', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0369A1' },

  content: { flex: 1, paddingHorizontal: 16, paddingVertical: 12 },
  searchCard: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 16, marginBottom: 16 },
  quoteCard: { backgroundColor: '#F9FAFB', borderRadius: 8, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#0369A1' },
  quotePrice: { fontSize: 18, fontWeight: 'bold', color: '#0369A1' },
  driverInfo: { marginTop: 8 },
  driverName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  driverRating: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  noDriver: { fontSize: 12, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' },
  acceptButton: { backgroundColor: '#0369A1', borderRadius: 6, paddingVertical: 8, alignItems: 'center', marginTop: 10 },
  acceptButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },

  trackingCard: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 16, marginBottom: 16 },
  trackingTitle: { fontSize: 16, fontWeight: 'bold', color: '#0369A1', marginBottom: 12 },
  addressLine: { marginBottom: 12 },
  address: { fontSize: 14, color: '#1F2937', marginTop: 4 },
  driverCard: { backgroundColor: '#DBEAFE', borderRadius: 8, padding: 12, marginTop: 12 },
  eta: { fontSize: 12, color: '#0369A1', marginTop: 4 },

  profileCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16 },
  profileName: { fontSize: 18, fontWeight: 'bold', color: '#1F2937' },
  profileEmail: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  logoutButton: { backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#fff' },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderTopWidth: 3, borderTopColor: '#0369A1' },
  tabLabel: { fontSize: 20 },
  tabLabelActive: { fontSize: 22 },
});
