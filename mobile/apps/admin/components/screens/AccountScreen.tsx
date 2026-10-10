import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { API_URL } from '../../lib/api';
import { MesPermissions } from '../../lib/permissions';
import { Card, COLORS, Row, ui } from '../ui';

export default function AccountScreen({ email, permissions, onLogout, onMfa }: { email: string; permissions: MesPermissions; onLogout: () => void; onMfa: () => void }) {
  const sections = Object.entries(permissions.permissions);
  return (
    <ScrollView contentContainerStyle={ui.content}>
      <Card title="Compte">
        <TouchableOpacity onPress={onMfa} style={ui.retry}><Text style={ui.retryText}>Gérer la seconde authentification</Text></TouchableOpacity>
        <Row label="Adresse" value={email} />
        <Row label="Rôle" value={permissions.isSuperOwner ? 'Superowner' : permissions.roleLabel || permissions.role} />
        <Row label="Serveur" value={API_URL} last />
      </Card>
      {!permissions.isSuperOwner && (
        <Card title="Sections ouvertes (ZupEat)">
          {sections.map(([id, niveau], i) => (
            <Row key={id} label={id} value={niveau === 'write' ? 'Modification' : 'Lecture'} last={i === sections.length - 1} />
          ))}
        </Card>
      )}
      <TouchableOpacity onPress={onLogout} style={[ui.retry, { backgroundColor: COLORS.danger, alignItems: 'center' }]}>
        <Text style={ui.retryText}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
