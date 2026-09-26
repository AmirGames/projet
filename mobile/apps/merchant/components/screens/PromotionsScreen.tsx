import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
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
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface Promotion {
  id: string;
  code: string;
  description?: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: number | string;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  maxUses?: number | null;
  currentUses?: number;
  timesUsed?: number;
  activeFromTime?: string | null;
  activeToTime?: string | null;
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

const discountLabel = (p: Promotion) =>
  p.type === 'PERCENTAGE'
    ? `-${parseFloat(String(p.discountValue))} %`
    : `-${formatEuros(p.discountValue)}`;

function state(p: Promotion) {
  if (p.endDate && new Date(p.endDate).getTime() < Date.now()) return { label: 'Expirée', color: '#999', on: false };
  if (p.maxUses && (p.currentUses ?? p.timesUsed ?? 0) >= p.maxUses) return { label: 'Épuisée', color: '#999', on: false };
  if (p.status !== 'ACTIVE') return { label: 'Désactivée', color: '#999', on: false };
  if (p.startDate && new Date(p.startDate).getTime() > Date.now()) return { label: `Dès le ${fmtDate(p.startDate)}`, color: '#2196F3', on: true };
  return { label: 'Active', color: COLORS.success, on: true };
}

const DURATIONS = [
  { label: 'Sans fin', days: 0 },
  { label: '1 jour', days: 1 },
  { label: '7 jours', days: 7 },
  { label: '30 jours', days: 30 },
];

function NewPromotion({
  token,
  storeId,
  onClose,
  onCreated,
}: {
  token: string;
  storeId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [days, setDays] = useState(0);
  const [maxUses, setMaxUses] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const v = parseFloat(value.replace(',', '.'));
    const cleanCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,20}$/.test(cleanCode)) {
      return Alert.alert('Code invalide', 'De 2 à 20 lettres ou chiffres, sans espace (ex. : BIENVENUE10).');
    }
    if (!(v > 0) || (type === 'PERCENTAGE' && v > 100)) {
      return Alert.alert('Réduction invalide', type === 'PERCENTAGE' ? 'Entre 1 et 100 %.' : 'Un montant supérieur à 0 €.');
    }
    const uses = maxUses.trim() ? parseInt(maxUses, 10) : undefined;
    if (uses !== undefined && !(uses > 0)) return Alert.alert('Utilisations', 'Un nombre supérieur à 0, ou laissez vide.');

    setSaving(true);
    try {
      const end = days ? new Date(Date.now() + days * 86_400_000) : undefined;
      if (end) end.setHours(23, 59, 59, 0);
      await apiFetch('/api/promotions', token, {
        method: 'POST',
        body: {
          storeId,
          code: cleanCode,
          type,
          discountValue: v,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(end ? { endDate: end.toISOString() } : {}),
          ...(uses ? { maxUses: uses } : {}),
        },
      });
      onCreated();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Création impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Nouveau code promo</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Code</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/\s/g, ''))}
              placeholder="BIENVENUE10"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="characters"
              maxLength={20}
            />

            <Text style={styles.label}>Réduction</Text>
            <View style={styles.valueRow}>
              <View style={styles.segment}>
                {(['PERCENTAGE', 'FIXED_AMOUNT'] as const).map((t) => (
                  <TouchableOpacity key={t} style={[styles.segBtn, type === t && styles.segOn]} onPress={() => setType(t)}>
                    <Text style={[styles.segText, type === t && styles.segTextOn]}>{t === 'PERCENTAGE' ? '%' : '€'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, styles.valueInput]}
                value={value}
                onChangeText={setValue}
                keyboardType="decimal-pad"
                placeholder={type === 'PERCENTAGE' ? '10' : '5,00'}
                placeholderTextColor={COLORS.muted}
                maxLength={7}
              />
            </View>

            <Text style={styles.label}>Durée</Text>
            <View style={styles.chips}>
              {DURATIONS.map((d) => (
                <TouchableOpacity key={d.days} style={[styles.chip, days === d.days && styles.chipOn]} onPress={() => setDays(d.days)}>
                  <Text style={[styles.chipText, days === d.days && styles.chipTextOn]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Nombre d'utilisations max (facultatif)</Text>
            <TextInput
              style={[styles.input, { width: 140 }]}
              value={maxUses}
              onChangeText={(t) => setMaxUses(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Illimité"
              placeholderTextColor={COLORS.muted}
            />

            <Text style={styles.label}>Description (facultatif)</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Ex. : -10 % sur la première commande"
              placeholderTextColor={COLORS.muted}
              maxLength={120}
            />
          </ScrollView>

          <TouchableOpacity style={styles.primary} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Créer le code</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function PromotionsScreen({ token, storeId, onBack }: { token: string; storeId: string; onBack: () => void }) {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ promotions: Promotion[] }>(`/api/promotions?storeId=${storeId}`, token);
      setPromos(res.promotions || []);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger les promotions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvent('donnees-modifiees', (e: { ressource: string; storeId?: string }) => {
    if (e.ressource === 'promotions' && (!e.storeId || e.storeId === storeId)) load();
  });
  useRealtimeEvent('reconnecte', load);

  const toggle = async (p: Promotion) => {
    setPending((x) => ({ ...x, [p.id]: true }));
    try {
      const res = await apiFetch<{ promotion: Promotion }>(`/api/promotions/${p.id}/toggle`, token, { method: 'PATCH' });
      setPromos((list) => list.map((x) => (x.id === p.id ? { ...x, ...res.promotion } : x)));
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Modification impossible');
    } finally {
      setPending((x) => ({ ...x, [p.id]: false }));
    }
  };

  const remove = (p: Promotion) =>
    Alert.alert('Supprimer ce code ?', `Le code ${p.code} ne pourra plus être utilisé.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch(`/api/promotions/${p.id}`, token, { method: 'DELETE' });
            setPromos((list) => list.filter((x) => x.id !== p.id));
          } catch (e: any) {
            Alert.alert('Erreur', e.message || 'Suppression impossible');
          }
        },
      },
    ]);

  const activeCount = promos.filter((p) => state(p).on).length;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Promotions 🏷️"
        subtitle={promos.length ? `${activeCount} active${activeCount > 1 ? 's' : ''} sur ${promos.length}` : undefined}
        onBack={onBack}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={promos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <TouchableOpacity style={[styles.primary, { marginTop: 0, marginBottom: 12 }]} onPress={() => setCreating(true)}>
              <Text style={styles.primaryText}>＋ Nouveau code promo</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucun code promo pour l’instant</Text>}
          renderItem={({ item }) => {
            const st = state(item);
            const used = item.currentUses ?? item.timesUsed ?? 0;
            // Un code expiré ou épuisé ne se réactive pas d'un geste : l'interrupteur reste éteint.
            const finished = st.label === 'Expirée' || st.label === 'Épuisée';
            return (
              <View style={[styles.card, !st.on && { opacity: 0.7 }]}>
                <View style={styles.cardTop}>
                  <View style={styles.codeTag}>
                    <Text style={styles.codeText}>{item.code}</Text>
                  </View>
                  <Text style={styles.discount}>{discountLabel(item)}</Text>
                  <Switch
                    value={item.status === 'ACTIVE' && !finished}
                    onValueChange={() => toggle(item)}
                    disabled={!!pending[item.id] || finished}
                    trackColor={{ true: COLORS.success, false: '#ccc' }}
                  />
                </View>
                {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
                <View style={styles.metaRow}>
                  <View style={[styles.dot, { backgroundColor: st.color }]} />
                  <Text style={styles.meta}>
                    {st.label}
                    {item.endDate ? ` · jusqu’au ${fmtDate(item.endDate)}` : ''}
                    {` · ${used}${item.maxUses ? `/${item.maxUses}` : ''} utilisation${used > 1 ? 's' : ''}`}
                    {item.activeFromTime && item.activeToTime ? ` · ${item.activeFromTime}–${item.activeToTime}` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => remove(item)} hitSlop={8}>
                    <Text style={styles.delete}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {creating && (
        <NewPromotion
          token={token}
          storeId={storeId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 24 },
  empty: { textAlign: 'center', color: COLORS.muted, marginTop: 30 },
  primary: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeTag: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  codeText: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: 1 },
  discount: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 13, color: '#555', marginTop: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flex: 1, fontSize: 12, color: '#666' },
  delete: { fontSize: 12, color: COLORS.danger, fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 28, maxHeight: '92%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  close: { fontSize: 20, color: '#666' },
  label: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: COLORS.text },
  codeInput: { fontSize: 18, fontWeight: '700', letterSpacing: 1 },
  valueRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 18, paddingVertical: 10 },
  segOn: { backgroundColor: COLORS.primary },
  segText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  segTextOn: { color: '#fff' },
  valueInput: { width: 110, fontSize: 18, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
});
