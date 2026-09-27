import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL, ApiError, apiFetch, SITE_URL } from '../../lib/api';
import { isNetworkError } from '../../lib/network';
import type { Prefs } from '../../lib/session';
import type { BackgroundState, GpsState } from '../../lib/useDriverLocation';
import { Card, COLORS, isDarkTheme, Row, ScreenHeader, themedStyles, ui } from '../ui';

const NAVIGATION_APPS: { key: Prefs['navigationApp']; label: string }[] = [
  { key: 'zupeat', label: 'Carte ZupEat' },
  { key: 'google', label: 'Google Maps' },
  { key: 'waze', label: 'Waze' },
  ...(Platform.OS === 'ios' ? [{ key: 'apple' as const, label: 'Plans' }] : []),
];

const THEMES: { key: Prefs['theme']; label: string }[] = [
  { key: 'dark', label: '🌙 Sombre' },
  { key: 'light', label: '☀️ Clair' },
  { key: 'system', label: '📱 Comme le téléphone' },
];

// Des fonctions : les couleurs suivent le thème en cours.
const GPS_LABELS: Record<GpsState, { text: string; color: () => string }> = {
  off: { text: 'Inactif (hors ligne)', color: () => COLORS.muted },
  searching: { text: 'Recherche…', color: () => COLORS.warning },
  ok: { text: '✓ Position transmise', color: () => COLORS.successText },
  denied: { text: '✗ Autorisation refusée', color: () => COLORS.danger },
  error: { text: '✗ Signal indisponible', color: () => COLORS.danger },
};

const BACKGROUND_LABELS: Record<BackgroundState, { text: string; color: () => string }> = {
  off: { text: 'Inactif (hors ligne)', color: () => COLORS.muted },
  on: { text: '✓ Oui', color: () => COLORS.successText },
  denied: { text: '✗ Application ouverte seulement', color: () => COLORS.danger },
  unavailable: { text: 'Indisponible ici', color: () => COLORS.muted },
};

/**
 * Supprimer son compte depuis l'application : les stores l'exigent dès que
 * l'on peut y créer un compte. Le serveur désactive le compte sur-le-champ et
 * transmet la demande à la plateforme, qui efface les données.
 */
interface DeletionPreview {
  coursesEnCours: number;
  montantDu: number;
  versementLe: string | null;
  ibanValide: boolean;
  ibanFin: string | null;
  /** Ce qui reste du compte ZupOne : le client ZupEat toujours, le commerçant s'il en a un. */
  restent?: { client: boolean; commercant: boolean };
}

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const jour = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function useAccountDeletion(token: string, onDeleted: () => void, onOpenAccount: () => void) {
  const [deleting, setDeleting] = useState(false);
  const fail = (e: unknown) =>
    Alert.alert(
      'Suppression impossible',
      isNetworkError(e) ? 'Pas de réseau : réessayez dès que vous captez.' : (e as ApiError).message || 'Réessayez plus tard.'
    );

  const run = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/drivers/me/suppression', token, { method: 'POST', body: {} });
      Alert.alert(
        'Compte livreur supprimé',
        res.message || 'Votre compte livreur est supprimé. Votre compte client ZupEat reste actif.'
      );
      onDeleted();
    } catch (e) {
      fail(e);
    } finally {
      setDeleting(false);
    }
  };

  // Avant de confirmer : ce que la suppression implique, à commencer par le
  // dernier versement, qui n'est pas perdu.
  const ask = async () => {
    setDeleting(true);
    let preview: DeletionPreview;
    try {
      preview = (await apiFetch<{ data: DeletionPreview }>('/api/drivers/me/suppression', token)).data;
    } catch (e) {
      fail(e);
      return;
    } finally {
      setDeleting(false);
    }
    if (preview.coursesEnCours > 0) {
      Alert.alert('Course en cours', 'Terminez ou annulez d’abord votre course, puis refaites la demande.');
      return;
    }
    if (preview.montantDu > 0 && !preview.ibanValide) {
      Alert.alert(
        'Ajoutez d’abord votre IBAN',
        `Il vous reste ${euros(preview.montantDu)} à recevoir. Sans IBAN, nous ne pouvons pas vous les verser.`,
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Ajouter mon IBAN', onPress: onOpenAccount },
        ]
      );
      return;
    }
    const versement =
      preview.montantDu > 0 && preview.versementLe
        ? `Vos ${euros(preview.montantDu)} de courses vous seront versés avec les paiements du ${jour(preview.versementLe)}, sur votre compte •••${preview.ibanFin}. `
        : '';
    // Seul le compte livreur disparaît : le compte ZupOne reste, et avec lui
    // l'espace client ZupEat (même e-mail, même mot de passe).
    const restent = preview.restent?.commercant
      ? 'Votre compte client ZupEat et votre espace commerçant restent actifs.'
      : 'Votre compte client ZupEat reste actif : vous pourrez toujours commander avec la même adresse e-mail.';
    Alert.alert(
      'Supprimer votre compte livreur ?',
      `Vous supprimez votre compte livreur : il sera désactivé tout de suite et vous ne recevrez plus de courses. ${versement}Vos données de livreur (pièces, véhicule, IBAN) seront ensuite supprimées sous 30 jours, sauf celles que la loi nous oblige à garder (courses payées, pièces comptables).\n\n${restent}`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer mon compte livreur', style: 'destructive', onPress: run },
      ]
    );
  };
  return { deleting, ask };
}

export default function SettingsScreen({
  prefs,
  onChangePrefs,
  onTestSound,
  pushEnabled,
  pushInfo,
  gps,
  background,
  token,
  onAccountDeleted,
  onOpenAccount,
  onBack,
}: {
  prefs: Prefs;
  onChangePrefs: (patch: Partial<Prefs>) => void;
  onTestSound: () => void;
  pushEnabled: boolean;
  pushInfo?: string;
  gps: GpsState;
  background: BackgroundState;
  token: string;
  /** Compte supprimé : la session se ferme et le téléphone est vidé. */
  onAccountDeleted: () => void;
  /** Mon compte : pour ajouter l'IBAN qui manque au dernier versement. */
  onOpenAccount: () => void;
  onBack: () => void;
}) {
  const deletion = useAccountDeletion(token, onAccountDeleted, onOpenAccount);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Paramètres ⚙️" onBack={onBack} />
      <ScrollView contentContainerStyle={ui.content}>
        <Card title="Apparence">
          <Text style={styles.help}>
            Le thème sombre fatigue moins les yeux la nuit et économise la batterie.
            {prefs.theme === 'system' ? ` Le téléphone est en mode ${isDarkTheme() ? 'sombre' : 'clair'}.` : ''}
          </Text>
          <View style={styles.chips}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.chip, prefs.theme === t.key && styles.chipActive]}
                onPress={() => onChangePrefs({ theme: t.key })}
              >
                <Text style={[styles.chipText, prefs.theme === t.key && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <Card title="Courses proposées">
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.switchLabel}>Sonnerie et vibration</Text>
              <Text style={styles.help}>Sonne à chaque course proposée, puis toutes les 5 s tant qu'elle attend votre réponse.</Text>
            </View>
            <Switch
              value={prefs.soundEnabled}
              onValueChange={(soundEnabled) => onChangePrefs({ soundEnabled })}
              trackColor={{ true: COLORS.success, false: COLORS.raised }}
            />
          </View>
          <TouchableOpacity style={styles.test} onPress={onTestSound} disabled={!prefs.soundEnabled}>
            <Text style={[styles.testText, !prefs.soundEnabled && { color: COLORS.muted }]}>🔔 Tester la sonnerie</Text>
          </TouchableOpacity>
          <View style={styles.statusRow}>
            <Text style={styles.switchLabel}>Notifications app fermée</Text>
            <Text style={[styles.status, { color: pushEnabled ? COLORS.successText : COLORS.danger }]}>
              {pushEnabled ? '✓ Activées' : '✗ Inactives'}
            </Text>
          </View>
          {!pushEnabled && pushInfo ? <Text style={styles.help}>{pushInfo}</Text> : null}
        </Card>

        <Card title="Navigation">
          <Text style={styles.help}>
            « Itinéraire » ouvre la carte de l’application, qui vous suit en direct. Choisissez une autre application
            pour être guidé par elle à la place.
          </Text>
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
            <Text style={[styles.status, { color: GPS_LABELS[gps].color() }]}>{GPS_LABELS[gps].text}</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.switchLabel}>Écran verrouillé</Text>
            <Text style={[styles.status, { color: BACKGROUND_LABELS[background].color() }]}>
              {BACKGROUND_LABELS[background].text}
            </Text>
          </View>
          <Text style={styles.help}>
            Votre position n'est transmise que lorsque vous êtes en ligne ou sur une course.{' '}
            {background === 'unavailable'
              ? 'Cette version de l’application ne la transmet qu’à l’écran : gardez-la ouverte pendant vos courses.'
              : `Avec la localisation « Toujours autoriser », elle continue téléphone rangé${
                  Platform.OS === 'android' ? ' (une notification ZupEat le signale)' : ''
                }.`}
          </Text>
          {(gps === 'denied' || background === 'denied') && (
            <TouchableOpacity style={styles.test} onPress={() => Linking.openSettings()}>
              <Text style={styles.testText}>Ouvrir les réglages du téléphone</Text>
            </TouchableOpacity>
          )}
        </Card>

        <Card title="À propos">
          <Row label="Application" value="ZupEat Livreur" />
          <Row label="Version" value={Constants.expoConfig?.version || '1.0.0'} />
          <Row label="Serveur" value={API_URL} last />
        </Card>

        {/* Les stores exigent la politique de confidentialité dans
            l'application, et une voie pour supprimer son compte. */}
        <Card title="Vos données">
          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(`${SITE_URL}/confidentialite`)}>
            <Text style={styles.linkText}>Politique de confidentialité</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(`${SITE_URL}/conditions-livreurs`)}>
            <Text style={styles.linkText}>Conditions des livreurs</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.linkRow, { borderBottomWidth: 0 }]} onPress={deletion.ask} disabled={deletion.deleting}>
            {deletion.deleting ? (
              <ActivityIndicator color={COLORS.danger} />
            ) : (
              <>
                <Text style={[styles.linkText, { color: COLORS.danger }]}>Supprimer mon compte livreur</Text>
                <Text style={styles.linkHint}>Votre compte client ZupEat reste actif.</Text>
              </>
            )}
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  help: { fontSize: 13, color: COLORS.secondary, marginBottom: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 },
  status: { fontSize: 14, fontWeight: '700' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  test: { paddingVertical: 10, alignItems: 'center', backgroundColor: COLORS.raised, borderRadius: 8 },
  testText: { fontSize: 15, fontWeight: '600', color: COLORS.link },
  linkRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  linkText: { fontSize: 15, fontWeight: '600', color: COLORS.link },
  linkHint: { fontSize: 13, color: COLORS.secondary, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.raised,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
}));
