import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { Card, COLORS, Row, ScreenHeader, ui } from '../ui';
import { PREPARATION_CHOICES } from './SettingsScreen';
import { Order, statusColor, statusLabel } from '../../lib/orders';

const REJECT_REASONS: { code: string; label: string }[] = [
  { code: 'TOO_BUSY', label: 'Trop de commandes en cours' },
  { code: 'PRODUCT_UNAVAILABLE', label: 'Produit indisponible' },
  { code: 'EXCEPTIONAL_CLOSURE', label: 'Fermeture exceptionnelle' },
  { code: 'OTHER', label: 'Autre raison' },
];

const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

export default function OrderDetailScreen({
  initialOrder,
  token,
  storeId,
  defaultPreparation,
  onBack,
  onChanged,
}: {
  initialOrder: Order;
  token: string;
  storeId: string;
  defaultPreparation: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [busy, setBusy] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [prep, setPrep] = useState(defaultPreparation);
  const [reason, setReason] = useState('TOO_BUSY');
  const [rejectNote, setRejectNote] = useState('');
  const [notes, setNotes] = useState(initialOrder.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const status = (order.status || '').toUpperCase();
  const base = `/api/order-management/${storeId}/${order.id}`;

  const run = async (request: () => Promise<{ order?: Partial<Order> }>, success: string) => {
    setBusy(true);
    try {
      const res = await request();
      if (res?.order) setOrder((o) => ({ ...o, ...res.order, items: o.items }));
      onChanged();
      Alert.alert('✓', success);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible d'effectuer l'action");
    } finally {
      setBusy(false);
    }
  };

  const accept = () => {
    setAcceptOpen(false);
    run(
      () => apiFetch(`${base}/accept`, token, { method: 'POST', body: { preparationMinutes: prep } }),
      `Commande acceptée — prête dans ${prep} min`
    );
  };

  const reject = () => {
    if (reason === 'OTHER' && !rejectNote.trim()) {
      Alert.alert('Précisez la raison', 'Indiquez au client pourquoi la commande est refusée.');
      return;
    }
    setRejectOpen(false);
    run(
      () =>
        apiFetch(`${base}/reject`, token, {
          method: 'POST',
          body: { motif: reason, ...(rejectNote.trim() ? { note: rejectNote.trim() } : {}) },
        }),
      'Commande refusée'
    );
  };

  const setStatus = (next: string, success: string) =>
    run(() => apiFetch(`${base}/status`, token, { method: 'PATCH', body: { status: next } }), success);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await apiFetch(`${base}/notes`, token, { method: 'POST', body: { notes } });
      setOrder((o) => ({ ...o, notes }));
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible d'enregistrer la note");
    } finally {
      setSavingNotes(false);
    }
  };

  const isPickup = order.deliveryType !== 'DELIVERY';

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScreenHeader title={`Commande #${order.id.slice(-6).toUpperCase()}`} subtitle={formatTime(order.createdAt)} onBack={onBack} />

      <ScrollView contentContainerStyle={ui.content}>
        <View style={styles.statusRow}>
          <View style={[styles.badge, { backgroundColor: statusColor(order.status) }]}>
            <Text style={styles.badgeText}>{statusLabel(order.status)}</Text>
          </View>
          <Text style={styles.type}>{isPickup ? '🛍️ Retrait' : '🛵 Livraison'}</Text>
        </View>

        {order.estimatedReadyAt && ['ACCEPTED', 'PREPARING'].includes(status) ? (
          <Text style={styles.eta}>
            Prête prévue à {formatTime(order.estimatedReadyAt)}
            {order.preparationMinutes ? ` (${order.preparationMinutes} min)` : ''}
          </Text>
        ) : null}

        <Card title="Client">
          <Row label="Nom" value={order.customerName || 'Anonyme'} />
          <Row label="Téléphone" value={order.customerPhone || '—'} />
          <Row label="Email" value={order.customerEmail || '—'} last />
        </Card>

        <Card title="Articles">
          {(order.items || []).map((item, i, all) => (
            <Row
              key={item.id}
              label={`${item.quantity} × ${item.product?.name || 'Produit'}`}
              value={formatEuros(item.total)}
              last={i === all.length - 1}
            />
          ))}
        </Card>

        {!isPickup && (
          <Card title="Livraison">
            <Row label="Adresse" value={order.deliveryAddress || '—'} />
            <Row label="Ville" value={[order.deliveryPostal, order.deliveryCity].filter(Boolean).join(' ') || '—'} last />
          </Card>
        )}

        <Card title="Total">
          <Row label="TVA" value={formatEuros(order.taxAmount)} />
          <Row label="Total" value={formatEuros(order.totalAmount)} last />
        </Card>

        <Card title="Note interne">
          <TextInput
            style={styles.notes}
            placeholder="Ex. : client habitué, sans oignons confirmé par téléphone…"
            placeholderTextColor={COLORS.muted}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
          />
          {notes !== (order.notes || '') && (
            <TouchableOpacity style={styles.saveNotes} onPress={saveNotes} disabled={savingNotes}>
              {savingNotes ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Enregistrer la note</Text>}
            </TouchableOpacity>
          )}
        </Card>
      </ScrollView>

      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: 12 }} />
        ) : status === 'PENDING' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.danger }]} onPress={() => setRejectOpen(true)}>
              <Text style={styles.btnText}>✗ Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnWide, { backgroundColor: COLORS.success }]} onPress={() => setAcceptOpen(true)}>
              <Text style={styles.btnText}>✓ Accepter</Text>
            </TouchableOpacity>
          </View>
        ) : status === 'ACCEPTED' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#2196F3' }]} onPress={() => setStatus('PREPARING', 'Préparation commencée')}>
              <Text style={styles.btnText}>👨‍🍳 En préparation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#9C27B0' }]} onPress={() => setStatus('READY', 'Commande prête')}>
              <Text style={styles.btnText}>📦 Prête</Text>
            </TouchableOpacity>
          </View>
        ) : status === 'PREPARING' ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: '#9C27B0' }]} onPress={() => setStatus('READY', 'Commande prête')}>
            <Text style={styles.btnText}>📦 Marquer prête</Text>
          </TouchableOpacity>
        ) : status === 'READY' && isPickup ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: COLORS.success }]} onPress={() => setStatus('COMPLETED', 'Commande remise au client')}>
            <Text style={styles.btnText}>🤝 Remise au client</Text>
          </TouchableOpacity>
        ) : status === 'READY' ? (
          <Text style={styles.waiting}>En attente du livreur</Text>
        ) : null}
      </View>

      <Modal visible={acceptOpen} transparent animationType="slide" onRequestClose={() => setAcceptOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Temps de préparation</Text>
            <Text style={styles.sheetHelp}>Le client sera prévenu de l'heure à laquelle sa commande sera prête.</Text>
            <View style={styles.chips}>
              {PREPARATION_CHOICES.map((m) => (
                <TouchableOpacity key={m} style={[styles.chip, prep === m && styles.chipActive]} onPress={() => setPrep(m)}>
                  <Text style={[styles.chipText, prep === m && styles.chipTextActive]}>{m} min</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setAcceptOpen(false)}>
                <Text style={styles.btnGhostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnWide, { backgroundColor: COLORS.success }]} onPress={accept}>
                <Text style={styles.btnText}>Accepter ({prep} min)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={rejectOpen} transparent animationType="slide" onRequestClose={() => setRejectOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Refuser la commande</Text>
            <Text style={styles.sheetHelp}>Le motif est transmis au client.</Text>
            {REJECT_REASONS.map((r) => (
              <TouchableOpacity key={r.code} style={styles.reason} onPress={() => setReason(r.code)}>
                <View style={[styles.radio, reason === r.code && styles.radioOn]} />
                <Text style={styles.reasonText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.rejectNote}
              placeholder={reason === 'OTHER' ? 'Précisez la raison (obligatoire)' : 'Message au client (facultatif)'}
              placeholderTextColor={COLORS.muted}
              value={rejectNote}
              onChangeText={setRejectNote}
              maxLength={300}
            />
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setRejectOpen(false)}>
                <Text style={styles.btnGhostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnWide, { backgroundColor: COLORS.danger }]} onPress={reject}>
                <Text style={styles.btnText}>Refuser la commande</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  type: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  eta: { fontSize: 14, color: COLORS.primary, fontWeight: '600', marginBottom: 12 },
  notes: {
    minHeight: 70,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    textAlignVertical: 'top',
  },
  saveNotes: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  actions: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  actionRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnWide: { flex: 1.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnGhost: { backgroundColor: COLORS.bg },
  btnGhostText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  waiting: { textAlign: 'center', color: '#666', paddingVertical: 12, fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 19, fontWeight: 'bold', color: COLORS.text },
  sheetHelp: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  chip: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  chipActive: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  chipText: { fontSize: 16, color: COLORS.text, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  reason: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#bbb', marginRight: 12 },
  radioOn: { borderColor: COLORS.danger, backgroundColor: COLORS.danger },
  reasonText: { fontSize: 15, color: COLORS.text },
  rejectNote: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 16,
  },
});
