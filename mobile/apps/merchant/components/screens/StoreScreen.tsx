import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Card, COLORS, ErrorBox, Loading, Row, ScreenHeader, ui } from '../ui';

interface Store {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  acceptsDelivery?: boolean;
  acceptsPickup?: boolean;
  deliveryCost?: number | string;
  minDeliveryAmount?: number | string;
  rating?: number | string;
  totalRatings?: number;
}

interface DayHours {
  closed: boolean;
  plages?: { open: string; close: string }[];
  open?: string;
  close?: string;
}

interface Hours {
  operatingHours: Record<string, DayHours>;
  isOpen: boolean;
  ouvertMaintenant?: boolean;
}

const DAYS: [string, string][] = [
  ['MON', 'Lundi'],
  ['TUE', 'Mardi'],
  ['WED', 'Mercredi'],
  ['THU', 'Jeudi'],
  ['FRI', 'Vendredi'],
  ['SAT', 'Samedi'],
  ['SUN', 'Dimanche'],
];

function formatDay(day?: DayHours) {
  if (!day || day.closed) return 'Fermé';
  const plages = day.plages?.length ? day.plages : day.open && day.close ? [{ open: day.open, close: day.close }] : [];
  return plages.map((p) => `${p.open}–${p.close}`).join(', ') || 'Fermé';
}

export default function StoreScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [store, setStore] = useState<Store | null>(null);
  const [hours, setHours] = useState<Hours | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [storeData, hoursData] = await Promise.all([
        apiFetch<any>(`/api/stores/${storeId}`, token),
        apiFetch<Hours>(`/api/store-hours/${storeId}`, token),
      ]);
      setStore(storeData.store || storeData);
      setHours(hoursData);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger la boutique');
    } finally {
      setLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const setOpen = async (isOpen: boolean) => {
    if (!hours) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ isOpen: boolean }>(`/api/store-hours/${storeId}/status`, token, {
        method: 'PATCH',
        body: { isOpen },
      });
      setHours({ ...hours, isOpen: res.isOpen });
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible de changer l'état de la boutique");
    } finally {
      setSaving(false);
    }
  };

  const confirmToggle = (isOpen: boolean) => {
    if (isOpen) return setOpen(true);
    Alert.alert('Fermer la boutique ?', 'Les clients ne pourront plus passer commande.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Fermer', style: 'destructive', onPress: () => setOpen(false) },
    ]);
  };

  const todayCode = DAYS[(new Date().getDay() + 6) % 7][0];

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Boutique 🏪" subtitle={store?.name} onBack={onBack} />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <ScrollView contentContainerStyle={ui.content}>
          <View style={[styles.statusCard, { borderLeftColor: hours?.isOpen ? COLORS.success : COLORS.danger }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{hours?.isOpen ? 'Boutique ouverte' : 'Boutique fermée'}</Text>
              <Text style={styles.statusSub}>
                {hours?.isOpen ? 'Vous recevez les commandes' : 'Aucune nouvelle commande'}
                {hours?.isOpen && hours.ouvertMaintenant === false ? ' (hors horaires)' : ''}
              </Text>
            </View>
            <Switch
              value={!!hours?.isOpen}
              onValueChange={confirmToggle}
              disabled={saving}
              trackColor={{ true: COLORS.success, false: '#ccc' }}
            />
          </View>

          <Card title="Horaires d'ouverture">
            {DAYS.map(([code, label], i) => (
              <Row
                key={code}
                label={code === todayCode ? `${label} (aujourd'hui)` : label}
                value={formatDay(hours?.operatingHours?.[code])}
                last={i === DAYS.length - 1}
              />
            ))}
          </Card>

          <Card title="Informations">
            <Row label="Nom" value={store?.name || '—'} />
            <Row label="Adresse" value={[store?.address, [store?.postalCode, store?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'} />
            <Row label="Téléphone" value={store?.phone || '—'} />
            <Row label="Email" value={store?.email || '—'} />
            <Row
              label="Note"
              value={store?.rating ? `${parseFloat(String(store.rating)).toFixed(1)} ★ (${store.totalRatings ?? 0} avis)` : '—'}
              last
            />
          </Card>

          <Card title="Modes de commande">
            <Row label="Livraison" value={store?.acceptsDelivery ? 'Oui' : 'Non'} />
            {store?.acceptsDelivery ? (
              <>
                <Row label="Frais de livraison" value={formatEuros(store?.deliveryCost)} />
                <Row label="Minimum de commande" value={formatEuros(store?.minDeliveryAmount)} />
              </>
            ) : null}
            <Row label="Retrait sur place" value={store?.acceptsPickup ? 'Oui' : 'Non'} last />
          </Card>

          <Text style={styles.hint}>Pour modifier les horaires et les informations, utilisez l'espace commerçant sur le web.</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 5,
  },
  statusTitle: { fontSize: 17, fontWeight: 'bold', color: COLORS.text },
  statusSub: { fontSize: 13, color: '#666', marginTop: 2 },
  hint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 4 },
});
