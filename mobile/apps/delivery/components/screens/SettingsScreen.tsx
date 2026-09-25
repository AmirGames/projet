import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../../lib/api';
import type { Prefs } from '../../lib/session';
import type { GpsState } from '../../lib/useDriverLocation';
import { Card, COLORS, Row, ScreenHeader, ui } from '../ui';

const NAVIGATION_APPS: { key: Prefs['navigationApp']; label: string }[] = [
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  ...(Platform.OS === 'ios' ? [{ key: 'apple' as const, label: 'Plans' }] : []),
];

const GPS_LABELS: Record<GpsState, { text: string; color: string }> = {
  off: { text: 'Inactif (hors ligne)', color: COLORS.muted },
  searching: { text: 'Recherche…', color: '#B26A00' },
  ok: { text: '✓ Position transmise', color: COLORS.success },
  denied: { text: '✗ Autorisation refusée', color: COLORS.danger },
  error: { text: '✗ Signal indisponible', color: COLORS.danger },
};

export default function SettingsScreen({
  prefs,
  onChangePrefs,
  onTestSound,
  pushEnabled,
  pushInfo,
  gps,
  onBack,
}: {
  prefs: Prefs;
  onChangePrefs: (patch: Partial<Prefs>) => void;
  onTestSound: () => void;
  pushEnabled: boolean;
  pushInfo?: string;
  gps: GpsState;
  onBack: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Paramètres ⚙️" onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content}>
        <Card title="Courses proposées">
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.switchLabel}>Sonnerie et vibration</Text>
              <Text style={styles.help}>Sonne à chaque course proposée, puis toutes les 5 s tant qu'elle attend votre réponse.</Text>
            </View>
            <Switch
              value={prefs.soundEnabled}
              onValueChange={(soundEnabled) => onChangePrefs({ soundEnabled })}
              trackColor={{ true: COLORS.success, false: '#ccc' }}
            />
          </View>
          <TouchableOpacity style={styles.test} onPress={onTestSound} disabled={!prefs.soundEnabled}>
            <Text style={[styles.testText, !prefs.soundEnabled && { color: COLORS.muted }]}>🔔 Tester la sonnerie</Text>
          </TouchableOpacity>
          <View style={styles.statusRow}>
            <Text style={styles.switchLabel}>Notifications app fermée</Text>
            <Text style={[styles.status, { color: pushEnabled ? COLORS.success : COLORS.danger }]}>
              {pushEnabled ? '✓ Activées' : '✗ Inactives'}
            </Text>
          </View>
          {!pushEnabled && pushInfo ? <Text style={styles.help}>{pushInfo}</Text> : null}
        </Card>

        <Card title="Navigation">
          <Text style={styles.help}>Application ouverte par « Lancer le GPS ».</Text>
          <View style={styles.chips}>
            {NAVIGATION_APPS.map((app) => (
              <TouchableOpacity
                key={app.key}
                style={[styles.chip, prefs.navigationApp === app.key && styles.chipActive]}
                onPress={() => onChangePrefs({ navigationApp: app.key })}
              >
                <Text style={[styles.chipText, prefs.navigationApp === app.key && styles.chipTextActive]}>{app.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card title="Localisation">
          <View style={styles.statusRow}>
            <Text style={styles.switchLabel}>GPS</Text>
            <Text style={[styles.status, { color: GPS_LABELS[gps].color }]}>{GPS_LABELS[gps].text}</Text>
          </View>
          <Text style={styles.help}>
            Votre position n'est transmise que lorsque vous êtes en ligne ou sur une course. Gardez l'application ouverte
            pendant vos courses.
          </Text>
          {gps === 'denied' && (
            <TouchableOpacity style={styles.test} onPress={() => Linking.openSettings()}>
              <Text style={styles.testText}>Ouvrir les réglages du téléphone</Text>
            </TouchableOpacity>
          )}
        </Card>

        <Card title="À propos">
          <Row label="Application" value="Zupone Livreur" />
          <Row label="Version" value={Constants.expoConfig?.version || '1.0.0'} />
          <Row label="Serveur" value={API_URL} last />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  help: { fontSize: 13, color: '#666', marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 },
  status: { fontSize: 14, fontWeight: '700' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  test: { paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: 8 },
  testText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
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
});
