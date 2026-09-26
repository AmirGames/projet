import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../../lib/api';
import type { DeliveryAddress } from '../../lib/session';
import { Card, COLORS, Row, ScreenHeader, ui } from '../ui';

export default function SettingsScreen({
  address,
  pushEnabled,
  pushInfo,
  onChangeAddress,
  onBack,
}: {
  address: DeliveryAddress | null;
  pushEnabled: boolean;
  pushInfo?: string;
  onChangeAddress: () => void;
  onBack: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Paramètres ⚙️" onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content}>
        <Card title="Livraison">
          <Text style={styles.label}>Adresse de livraison</Text>
          <Text style={styles.value}>{address?.label || 'Aucune adresse retenue'}</Text>
          <TouchableOpacity style={styles.button} onPress={onChangeAddress}>
            <Text style={styles.buttonText}>📍 {address ? 'Changer d’adresse' : 'Choisir mon adresse'}</Text>
          </TouchableOpacity>
        </Card>

        <Card title="Notifications">
          <View style={styles.statusRow}>
            <Text style={styles.label}>Suivi de commande, app fermée</Text>
            <Text style={[styles.status, { color: pushEnabled ? COLORS.success : COLORS.danger }]}>
              {pushEnabled ? '✓ Activé' : '✗ Inactif'}
            </Text>
          </View>
          <Text style={styles.help}>
            Commande acceptée, en route, livreur à la porte : le téléphone vous prévient même application fermée.
          </Text>
          {!pushEnabled && pushInfo ? <Text style={styles.help}>{pushInfo}</Text> : null}
          {!pushEnabled && (
            <TouchableOpacity style={styles.button} onPress={() => Linking.openSettings()}>
              <Text style={styles.buttonText}>Ouvrir les réglages du téléphone</Text>
            </TouchableOpacity>
          )}
        </Card>

        <Card title="À propos">
          <Row label="Application" value="Zupone" />
          <Row label="Version" value={Constants.expoConfig?.version || '1.0.0'} />
          <Row label="Serveur" value={API_URL} last />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  value: { fontSize: 14, color: '#555', marginBottom: 10 },
  help: { fontSize: 13, color: '#666', marginBottom: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  status: { fontSize: 14, fontWeight: '700' },
  button: { paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 8 },
  buttonText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
