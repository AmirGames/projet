import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { API_URL, apiFetch, formatEuros } from '../../lib/api';
import { Driver, DRIVER_STATUS_LABELS, VEHICLE_LABELS } from '../../lib/deliveries';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

interface Documents {
  status: string;
  statusReason?: string | null;
  dossierComplet: boolean;
  piecesAttendues: { type: string; libelle: string }[];
  piecesManquantes: string[];
  documents: {
    id: string;
    type: string;
    libelle: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | string;
    reviewNote?: string | null;
    expiryDate?: string | null;
  }[];
}

const DOC_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: '⏳ En examen', color: COLORS.warning },
  APPROVED: { label: '✓ Validée', color: COLORS.successText },
  REJECTED: { label: '✗ Refusée', color: COLORS.danger },
  EXPIRED: { label: '⚠ Expirée', color: COLORS.danger },
};

export default function AccountScreen({
  token,
  onBack,
  onDriverLoaded,
}: {
  token: string;
  onBack: () => void;
  onDriverLoaded: (driver: Driver) => void;
}) {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [docs, setDocs] = useState<Documents | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const [me, documents] = await Promise.all([
        apiFetch<{ data: Driver }>('/api/drivers/me', token),
        apiFetch<{ data: Documents }>('/api/drivers/documents', token),
      ]);
      setDriver(me.data);
      setDocs(documents.data);
      onDriverLoaded(me.data);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger le compte');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onDriverLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (type: string, source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Autorisation', "Autorisez l'accès dans les réglages du téléphone.");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(type);
    try {
      const form = new FormData();
      form.append('type', type);
      form.append('file', {
        uri: asset.uri,
        name: asset.fileName || `${type.toLowerCase()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      } as any);
      const response = await fetch(`${API_URL}/api/drivers/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || data?.message || 'Envoi impossible');
      Alert.alert('Pièce envoyée', data?.message || 'En attente de validation');
      await load();
    } catch (e: any) {
      Alert.alert('Envoi impossible', e.message || 'Réessayez');
    } finally {
      setUploading(null);
    }
  };

  const chooseSource = (type: string, libelle: string) =>
    Alert.alert(libelle, 'Comment ajouter la pièce ?', [
      { text: 'Prendre une photo', onPress: () => upload(type, 'camera') },
      { text: 'Choisir dans la galerie', onPress: () => upload(type, 'library') },
      { text: 'Annuler', style: 'cancel' },
    ]);

  const displayName = driver?.name || driver?.email?.split('@')[0] || '';
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
        <ScrollView
          contentContainerStyle={ui.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <View style={styles.profile}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.email}>{driver?.email}</Text>
            <Text style={[styles.status, { color: driver?.status === 'ACTIVE' ? COLORS.successText : COLORS.warning }]}>
              {DRIVER_STATUS_LABELS[driver?.status || ''] || driver?.status}
            </Text>
          </View>

          <Card title="Livreur">
            <Row label="Véhicule" value={VEHICLE_LABELS[driver?.vehicleType || ''] || driver?.vehicleType || '—'} />
            <Row label="Immatriculation" value={driver?.licensePlate || '—'} />
            <Row label="Courses livrées" value={driver?.completedDeliveries ?? 0} />
            <Row label="Gains cumulés" value={formatEuros(driver?.totalEarnings)} />
            <Row
              label="Note"
              value={driver?.rating != null ? `${Number(driver.rating).toFixed(1).replace('.', ',')} ★ (${driver.avis})` : 'Pas encore noté'}
              last
            />
          </Card>

          {docs && (
            <Card title="Mon dossier">
              {docs.statusReason ? <Text style={styles.reason}>{docs.statusReason}</Text> : null}
              <Text style={styles.help}>
                {docs.dossierComplet
                  ? docs.status === 'ACTIVE'
                    ? 'Votre dossier est validé.'
                    : 'Dossier complet : la plateforme examine vos pièces.'
                  : 'Ajoutez les pièces manquantes pour que votre dossier soit examiné.'}
              </Text>
              {docs.piecesAttendues.map((piece, i) => {
                const doc = docs.documents.find((d) => d.type === piece.type);
                const st = doc ? DOC_STATUS[doc.status] || { label: doc.status, color: COLORS.muted } : null;
                const canUpload = !doc || doc.status === 'REJECTED' || doc.status === 'EXPIRED';
                return (
                  <View key={piece.type} style={[styles.doc, i === docs.piecesAttendues.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docName}>{piece.libelle}</Text>
                      <Text style={[styles.docStatus, { color: st?.color || COLORS.danger }]}>{st?.label || '✗ Manquante'}</Text>
                      {doc?.reviewNote ? <Text style={styles.docNote}>{doc.reviewNote}</Text> : null}
                      {doc?.expiryDate ? (
                        <Text style={styles.docNote}>Expire le {new Date(doc.expiryDate).toLocaleDateString('fr-FR')}</Text>
                      ) : null}
                    </View>
                    {canUpload &&
                      (uploading === piece.type ? (
                        <ActivityIndicator color={COLORS.link} />
                      ) : (
                        <TouchableOpacity
                          style={styles.docButton}
                          disabled={uploading !== null}
                          onPress={() => chooseSource(piece.type, piece.libelle)}
                        >
                          <Text style={styles.docButtonText}>{doc ? 'Remplacer' : 'Ajouter'}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                );
              })}
            </Card>
          )}
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
  status: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  help: { fontSize: 13, color: COLORS.secondary, marginBottom: 6 },
  reason: { fontSize: 13, color: COLORS.danger, marginBottom: 6 },
  doc: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  docName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  docStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  docNote: { fontSize: 12, color: COLORS.secondary, marginTop: 2 },
  docButton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  docButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
