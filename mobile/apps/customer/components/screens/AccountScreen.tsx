import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  memberSince?: string;
  totalOrders?: number;
  totalSpent?: number;
}

const FIELDS: { key: 'name' | 'phone' | 'address' | 'postalCode' | 'city'; label: string; keyboard?: 'phone-pad' }[] = [
  { key: 'name', label: 'Nom' },
  { key: 'phone', label: 'Téléphone', keyboard: 'phone-pad' },
  { key: 'address', label: 'Adresse' },
  { key: 'postalCode', label: 'Code postal' },
  { key: 'city', label: 'Ville' },
];

export default function AccountScreen({
  token,
  onBack,
  onProfileLoaded,
}: {
  token: string;
  onBack: () => void;
  onProfileLoaded: (profile: CustomerProfile) => void;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: CustomerProfile }>('/api/client/me', token);
      setProfile(res.data);
      setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(res.data[f.key] ?? '')])));
      onProfileLoaded(res.data);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger le compte');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onProfileLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    // Un champ vidé n'est pas envoyé : le serveur refuserait un nom ou un téléphone vides.
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    setSaving(true);
    try {
      await apiFetch('/api/client/me', token, { method: 'PUT', body });
      Alert.alert('Profil', 'Vos informations sont enregistrées.');
      await load();
    } catch (e: any) {
      Alert.alert('Enregistrement impossible', e.message || 'Réessayez');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.name || profile?.email?.split('@')[0] || '';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Mon Compte 👤" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <ScrollView
          contentContainerStyle={ui.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{profile?.email}</Text>
          </View>

          <Card title="Mes commandes">
            <Row label="Commandes passées" value={profile?.totalOrders ?? 0} />
            <Row label="Total dépensé" value={formatEuros(profile?.totalSpent)} />
            <Row
              label="Client depuis"
              value={profile?.memberSince ? new Date(profile.memberSince).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—'}
              last
            />
          </Card>

          <Card title="Mes informations">
            {FIELDS.map((f) => (
              <View key={f.key} style={{ marginBottom: 8 }}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={form[f.key] || ''}
                  onChangeText={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
                  keyboardType={f.keyboard}
                  placeholderTextColor="#999"
                />
              </View>
            ))}
            <Text style={styles.help}>L’e-mail relie vos commandes à votre compte : il ne se modifie pas ici.</Text>
            <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Enregistrer</Text>}
            </TouchableOpacity>
          </Card>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  profile: { backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 24, alignItems: 'center', marginBottom: 12 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 30, color: '#fff', fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  email: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  label: { fontSize: 12, color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  help: { fontSize: 12, color: COLORS.muted, marginVertical: 6 },
  save: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
