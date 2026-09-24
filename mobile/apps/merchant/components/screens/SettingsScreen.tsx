import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../../lib/api';
import { Card, COLORS, Row, ScreenHeader, ui } from '../ui';

export const PREPARATION_CHOICES = [10, 15, 20, 30, 45, 60];

export default function SettingsScreen({
  preparationMinutes,
  onChangePreparation,
  onLogout,
  onBack,
}: {
  preparationMinutes: number;
  onChangePreparation: (minutes: number) => void;
  onLogout: () => void;
  onBack: () => void;
}) {
  const confirmLogout = () =>
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: onLogout },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Paramètres ⚙️" onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content}>
        <Card title="Temps de préparation par défaut">
          <Text style={styles.help}>Annoncé au client quand vous acceptez une commande.</Text>
          <View style={styles.chips}>
            {PREPARATION_CHOICES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.chip, preparationMinutes === m && styles.chipActive]}
                onPress={() => onChangePreparation(m)}
              >
                <Text style={[styles.chipText, preparationMinutes === m && styles.chipTextActive]}>{m} min</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card title="À propos">
          <Row label="Application" value="Zupone Commerçant" />
          <Row label="Version" value={Constants.expoConfig?.version || '1.0.0'} />
          <Row label="Serveur" value={API_URL} last />
        </Card>

        <TouchableOpacity style={styles.logout} onPress={confirmLogout}>
          <Text style={styles.logoutText}>🚪 Déconnexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 13, color: '#666', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  logout: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutText: { color: COLORS.danger, fontSize: 16, fontWeight: '600' },
});
