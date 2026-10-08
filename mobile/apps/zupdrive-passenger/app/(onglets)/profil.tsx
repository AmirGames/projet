import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Card, COLORS, Row } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { confirmer } from '../../lib/confirmer';

export default function Profil() {
  const { session, deconnecter } = useAuth();

  const quitter = () =>
    confirmer('Déconnexion', 'Voulez-vous vous déconnecter ?', 'Se déconnecter', () => void deconnecter());

  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <Card title="Mon compte">
        <Row label="E-mail" value={session?.email ?? ''} last />
      </Card>
      <TouchableOpacity style={styles.bouton} onPress={quitter}>
        <Text style={styles.texte}>Se déconnecter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bouton: { backgroundColor: COLORS.danger, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  texte: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
