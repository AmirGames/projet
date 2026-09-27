import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL, ApiError, apiFetch } from '../../lib/api';
import type { DeliveryAddress } from '../../lib/session';
import { Card, COLORS, Row, ScreenHeader, ui } from '../ui';

/** Le site public : conditions, confidentialité (fixé par eas.json en production). */
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://zupone.com').replace(/\/+$/, '');

interface DeletionPreview {
  commandesEnCours: number;
  restent: { livreur: boolean; livreurEnSuppression: boolean; commercant: boolean };
  compteEntierSupprime: boolean;
}

/**
 * Supprimer son compte ZupEat depuis l'application (exigé par les stores).
 * Avant de confirmer, on dit ce qui part et ce qui reste : un compte
 * livreur ou un espace commerçant sur la même adresse reste actif.
 */
function useAccountDeletion(token: string | null, onDeleted: () => void) {
  const [deleting, setDeleting] = useState(false);
  const fail = (e: unknown) =>
    Alert.alert('Suppression impossible', (e as ApiError)?.message || 'Vérifiez votre connexion et réessayez.');

  const run = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/client/me/suppression', token, { method: 'POST', body: {} });
      Alert.alert('Compte ZupEat supprimé', res.message || 'Votre compte ZupEat est supprimé.');
      onDeleted();
    } catch (e) {
      fail(e);
    } finally {
      setDeleting(false);
    }
  };

  const ask = async () => {
    if (!token) return;
    setDeleting(true);
    let preview: DeletionPreview;
    try {
      preview = (await apiFetch<{ data: DeletionPreview }>('/api/client/me/suppression', token)).data;
    } catch (e) {
      fail(e);
      return;
    } finally {
      setDeleting(false);
    }
    if (preview.commandesEnCours > 0) {
      Alert.alert(
        'Commande en cours',
        'Attendez que votre commande soit livrée (ou annulée), puis refaites la demande.'
      );
      return;
    }
    const restent = [
      preview.restent.livreur &&
        (preview.restent.livreurEnSuppression
          ? 'Votre compte livreur (en cours de suppression) reste accessible jusqu’au dernier versement de vos courses.'
          : 'Votre compte livreur reste actif.'),
      preview.restent.commercant && 'Votre espace commerçant reste actif.',
    ].filter(Boolean);
    Alert.alert(
      'Supprimer votre compte ZupEat ?',
      `Vous supprimez votre compte ZupEat : votre profil, vos adresses, vos favoris et vos paniers seront effacés. Vos commandes passées sont conservées sans lien avec vous, le temps que la loi l’exige.\n\n${
        preview.compteEntierSupprime
          ? 'Votre compte Zupone sera supprimé : vous ne pourrez plus vous connecter.'
          : `${restent.join(' ')} Vous vous y connectez avec la même adresse e-mail et le même mot de passe.`
      }`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer mon compte ZupEat', style: 'destructive', onPress: run },
      ]
    );
  };
  return { deleting, ask };
}

export default function SettingsScreen({
  address,
  pushEnabled,
  pushInfo,
  token,
  onChangeAddress,
  onAccountDeleted,
  onBack,
}: {
  address: DeliveryAddress | null;
  pushEnabled: boolean;
  pushInfo?: string;
  /** Sans session, pas de compte à supprimer. */
  token: string | null;
  onChangeAddress: () => void;
  /** Compte supprimé : la session se ferme et le téléphone est vidé. */
  onAccountDeleted: () => void;
  onBack: () => void;
}) {
  const deletion = useAccountDeletion(token, onAccountDeleted);
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

        {/* Les stores exigent la politique de confidentialité dans
            l'application, et la suppression du compte qu'on y crée. */}
        <Card title="Vos données">
          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(`${SITE_URL}/confidentialite`)}>
            <Text style={styles.linkText}>Politique de confidentialité</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.linkRow} onPress={() => Linking.openURL(`${SITE_URL}/cgu`)}>
            <Text style={styles.linkText}>Conditions d’utilisation</Text>
          </TouchableOpacity>
          {token && (
            <TouchableOpacity
              style={[styles.linkRow, { borderBottomWidth: 0 }]}
              onPress={deletion.ask}
              disabled={deletion.deleting}
            >
              {deletion.deleting ? (
                <ActivityIndicator color={COLORS.danger} />
              ) : (
                <Text style={[styles.linkText, { color: COLORS.danger }]}>Supprimer mon compte ZupEat</Text>
              )}
            </TouchableOpacity>
          )}
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
  linkRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  linkText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
});
