import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';
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

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_PLAGES = 3;

function plagesOf(day?: DayHours) {
  if (!day) return [{ open: '11:30', close: '14:30' }];
  if (day.plages?.length) return day.plages;
  if (day.open && day.close) return [{ open: day.open, close: day.close }];
  return [{ open: '11:30', close: '14:30' }];
}

/** Accepte « 9h », « 930 », « 9:30 » et rend « 09:30 ». */
function normalizeTime(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length <= 2) return digits ? `${digits.padStart(2, '0')}:00` : value;
  const h = digits.slice(0, digits.length - 2).padStart(2, '0');
  return `${h}:${digits.slice(-2)}`;
}

function DayEditor({
  label,
  day,
  saving,
  onCancel,
  onSave,
}: {
  label: string;
  day?: DayHours;
  saving: boolean;
  onCancel: () => void;
  onSave: (value: { closed: boolean; plages: { open: string; close: string }[] }) => void;
}) {
  const [open, setOpen] = useState(!day?.closed);
  const [plages, setPlages] = useState(plagesOf(day));

  const update = (i: number, key: 'open' | 'close', value: string) =>
    setPlages((list) => list.map((p, j) => (j === i ? { ...p, [key]: value } : p)));

  const save = () => {
    if (!open) return onSave({ closed: true, plages: [] });
    const clean = plages.map((p) => ({ open: normalizeTime(p.open.trim()), close: normalizeTime(p.close.trim()) }));
    const invalid = clean.find((p) => !TIME.test(p.open) || !TIME.test(p.close));
    if (invalid) {
      Alert.alert('Heure invalide', 'Utilisez le format HH:MM, par exemple 11:30.');
      return;
    }
    onSave({ closed: false, plages: clean });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <View style={styles.openSwitch}>
              <Text style={styles.openLabel}>{open ? 'Ouvert' : 'Fermé'}</Text>
              <Switch value={open} onValueChange={setOpen} trackColor={{ true: COLORS.success, false: '#ccc' }} />
            </View>
          </View>

          {open ? (
            <>
              {plages.map((p, i) => (
                <View key={i} style={styles.plage}>
                  <TextInput style={styles.time} value={p.open} onChangeText={(v) => update(i, 'open', v)} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="11:30" />
                  <Text style={styles.dash}>→</Text>
                  <TextInput style={styles.time} value={p.close} onChangeText={(v) => update(i, 'close', v)} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="14:30" />
                  {plages.length > 1 ? (
                    <TouchableOpacity onPress={() => setPlages((l) => l.filter((_, j) => j !== i))} hitSlop={8}>
                      <Text style={styles.remove}>✕</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 18 }} />
                  )}
                </View>
              ))}
              {plages.length < MAX_PLAGES && (
                <TouchableOpacity onPress={() => setPlages((l) => [...l, { open: '19:00', close: '22:30' }])}>
                  <Text style={styles.add}>＋ Ajouter une plage (ex. service du soir)</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <Text style={styles.closedText}>La boutique ne prend pas de commande ce jour-là.</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.bg }]} onPress={onCancel}>
              <Text style={[styles.btnText, { color: COLORS.text }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.primary }]} onPress={save} disabled={saving}>
              <Text style={styles.btnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

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
  const [editing, setEditing] = useState<[string, string] | null>(null);
  const [savingDay, setSavingDay] = useState(false);

  const saveDay = async (code: string, value: { closed: boolean; plages: { open: string; close: string }[] }) => {
    if (!hours) return;
    setSavingDay(true);
    try {
      const res = await apiFetch<{ operatingHours: Record<string, DayHours> }>(
        `/api/store-hours/${storeId}/day/${code}`,
        token,
        { method: 'PUT', body: value }
      );
      setHours({ ...hours, operatingHours: res.operatingHours });
      setEditing(null);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible d'enregistrer les horaires");
    } finally {
      setSavingDay(false);
    }
  };

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

  useRealtimeEvent('boutique-statut', (e: { storeId: string; isOpen: boolean }) => {
    if (e.storeId === storeId) setHours((h) => (h ? { ...h, isOpen: e.isOpen } : h));
  });
  useRealtimeEvent('boutique-horaires', (e: { storeId: string; operatingHours: Record<string, DayHours> }) => {
    if (e.storeId === storeId) setHours((h) => (h ? { ...h, operatingHours: e.operatingHours } : h));
  });

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

          <Card title="Horaires d'ouverture · touchez un jour pour le modifier">
            {DAYS.map(([code, label], i) => (
              <TouchableOpacity key={code} onPress={() => setEditing([code, label])}>
                <Row
                  label={code === todayCode ? `${label} (aujourd'hui)` : label}
                  value={`${formatDay(hours?.operatingHours?.[code])}  ›`}
                  last={i === DAYS.length - 1}
                />
              </TouchableOpacity>
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

          <Text style={styles.hint}>Pour modifier les informations de la boutique, utilisez l'espace commerçant sur le web.</Text>
        </ScrollView>
      )}

      {editing && (
        <DayEditor
          label={editing[1]}
          day={hours?.operatingHours?.[editing[0]]}
          saving={savingDay}
          onCancel={() => setEditing(null)}
          onSave={(value) => saveDay(editing[0], value)}
        />
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  openSwitch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  openLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  plage: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  time: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    color: COLORS.text,
  },
  dash: { fontSize: 18, color: '#666' },
  remove: { fontSize: 18, color: COLORS.danger, width: 18, textAlign: 'center' },
  add: { color: COLORS.primary, fontWeight: '600', fontSize: 14, paddingVertical: 8 },
  closedText: { color: '#666', fontSize: 14, paddingVertical: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
