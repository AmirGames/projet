import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

interface Me {
  user: { id: string; email: string; name?: string | null; emailVerified?: boolean };
  organizations: { id: string; name: string; role: string; status?: string }[];
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MANAGER: 'Gérant',
  STAFF: 'Employé',
};

const ORG_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Actif',
  PENDING: 'En cours de validation',
  SUSPENDED: 'Suspendu',
  CLOSED: 'Fermé',
};

export default function AccountScreen({ token, onLogout, onBack }: { token: string; onLogout: () => void; onBack: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMe(await apiFetch<Me>('/api/auth/me', token));
    } catch (e: any) {
      setError(e.message || 'Impossible de charger le compte');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = me?.user.name || me?.user.email.split('@')[0] || '';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Mon Compte 👤" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={ui.content}>
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{me?.user.email}</Text>
          </View>

          <Card title="Informations personnelles">
            <Row label="Nom" value={me?.user.name || '—'} />
            <Row label="Email" value={me?.user.email || '—'} />
            <Row
              label="Email vérifié"
              value={me?.user.emailVerified ? '✓ Oui' : 'Non'}
              last
            />
          </Card>

          {me?.organizations.map((org) => (
            <Card key={org.id} title="Entreprise">
              <Row label="Nom" value={org.name} />
              <Row label="Rôle" value={ROLE_LABELS[org.role] || org.role} />
              <Row label="Statut" value={ORG_STATUS_LABELS[org.status || ''] || org.status || '—'} last />
            </Card>
          ))}

          <TouchableOpacity style={styles.logout} onPress={onLogout}>
            <Text style={styles.logoutText}>🚪 Déconnexion</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  profile: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
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
  logout: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
});
