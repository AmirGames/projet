import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';
import { COLORS, ErrorBox, Loading, ScreenHeader, ui } from '../ui';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  category: string;
  priority: string;
  createdAt: string;
  _count?: { messages: number };
}

interface TicketMessage {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: 'Ouvert', color: '#FFA500' },
  IN_PROGRESS: { label: 'En cours', color: '#2196F3' },
  RESOLVED: { label: 'Résolu', color: COLORS.success },
  CLOSED: { label: 'Fermé', color: '#999' },
};

const CATEGORIES = [
  { code: 'TECHNICAL', label: 'Technique' },
  { code: 'BILLING', label: 'Facturation' },
  { code: 'ACCOUNT', label: 'Compte' },
  { code: 'OTHER', label: 'Autre' },
];

const PRIORITIES = [
  { code: 'LOW', label: 'Basse' },
  { code: 'MEDIUM', label: 'Normale' },
  { code: 'HIGH', label: 'Urgente' },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Chips({ options, value, onChange }: { options: { code: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <TouchableOpacity key={o.code} style={[styles.chip, value === o.code && styles.chipOn]} onPress={() => onChange(o.code)}>
          <Text style={[styles.chipText, value === o.code && styles.chipTextOn]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function NewTicket({ token, orgId, onDone, onCancel }: { token: string; orgId: string; onDone: () => void; onCancel: () => void }) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('TECHNICAL');
  const [priority, setPriority] = useState('MEDIUM');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (subject.trim().length < 2 || description.trim().length < 5) {
      Alert.alert('Incomplet', 'Donnez un sujet et décrivez votre demande (5 caractères minimum).');
      return;
    }
    setSending(true);
    try {
      await apiFetch('/api/support/tickets', token, {
        method: 'POST',
        body: { orgId, subject: subject.trim(), description: description.trim(), category, priority },
      });
      Alert.alert('Demande envoyée', 'L’équipe Zupone vous répondra ici.');
      onDone();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Envoi impossible');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Nouvelle demande" onBack={onCancel} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Sujet</Text>
          <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Ex. : l’imprimante n’imprime plus" placeholderTextColor={COLORS.muted} maxLength={120} />
          <Text style={styles.label}>Catégorie</Text>
          <Chips options={CATEGORIES} value={category} onChange={setCategory} />
          <Text style={styles.label}>Priorité</Text>
          <Chips options={PRIORITIES} value={priority} onChange={setPriority} />
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez le problème, ce que vous avez déjà essayé…"
            placeholderTextColor={COLORS.muted}
            multiline
          />
          <TouchableOpacity style={styles.primary} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Envoyer la demande</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Conversation({ token, ticket, onBack }: { token: string; ticket: Ticket; onBack: () => void }) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<TicketMessage>>(null);
  const [status, setStatus] = useState(ticket.status);
  const closed = status === 'CLOSED';

  const addMessage = (message: TicketMessage) => {
    setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
  };

  // Les réponses du support arrivent sans rafraîchir.
  useRealtimeEvent('ticket-message', (e: { ticketId: string; message: TicketMessage; status?: string }) => {
    if (e.ticketId !== ticket.id) return;
    addMessage(e.message);
    if (e.status) setStatus(e.status);
  });
  useRealtimeEvent('ticket-maj', (e: { ticketId: string; status: string }) => {
    if (e.ticketId === ticket.id) setStatus(e.status);
  });

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: TicketMessage[] }>(`/api/support/tickets/${ticket.id}/messages`, token);
      setMessages(res.data || []);
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de charger la conversation');
    } finally {
      setLoading(false);
    }
  }, [ticket.id, token]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtimeEvent('reconnecte', load);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await apiFetch<{ data: TicketMessage }>(`/api/support/tickets/${ticket.id}/messages`, token, {
        method: 'POST',
        body: { body: text.trim() },
      });
      addMessage(res.data);
      setText('');
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Envoi impossible');
    } finally {
      setSending(false);
    }
  };

  const statusInfo = STATUS[status] || { label: status, color: '#999' };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={ticket.title} subtitle={statusInfo.label} onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListHeaderComponent={
              <View style={styles.original}>
                <Text style={styles.originalLabel}>Votre demande · {fmt(ticket.createdAt)}</Text>
                <Text style={styles.bubbleText}>{ticket.description}</Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.authorRole === 'MERCHANT';
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {!mine && <Text style={styles.author}>{item.authorName} · Zupone</Text>}
                  <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>{item.body}</Text>
                  <Text style={[styles.bubbleTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>{fmt(item.createdAt)}</Text>
                </View>
              );
            }}
          />
        )}
        {closed ? (
          <Text style={styles.closed}>Ce ticket est fermé. Ouvrez une nouvelle demande si besoin.</Text>
        ) : (
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={text}
              onChangeText={setText}
              placeholder="Votre message…"
              placeholderTextColor={COLORS.muted}
              multiline
            />
            <TouchableOpacity style={styles.send} onPress={send} disabled={sending || !text.trim()}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>➤</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

export default function SupportScreen({ token, orgId, onBack }: { token: string; orgId: string; onBack: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'new' | Ticket>('list');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch<{ data: Ticket[] }>(`/api/support/tickets?orgId=${orgId}`, token);
      setTickets(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Impossible de charger vos demandes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Nouveaux tickets, réponses et changements de statut : la liste suit.
  useRealtimeEvent('ticket-maj', load);
  useRealtimeEvent('ticket-message', load);
  useRealtimeEvent('reconnecte', load);

  if (view === 'new') {
    return <NewTicket token={token} orgId={orgId} onCancel={() => setView('list')} onDone={() => { setView('list'); load(); }} />;
  }
  if (typeof view === 'object') {
    return <Conversation token={token} ticket={view} onBack={() => { setView('list'); load(); }} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Support 💬" subtitle="Échangez avec l’équipe Zupone" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListHeaderComponent={
            <TouchableOpacity style={[styles.primary, { marginTop: 0, marginBottom: 12 }]} onPress={() => setView('new')}>
              <Text style={styles.primaryText}>＋ Nouvelle demande</Text>
            </TouchableOpacity>
          }
          ListEmptyComponent={<Text style={styles.empty}>Aucune demande en cours</Text>}
          renderItem={({ item }) => {
            const s = STATUS[item.status] || { label: item.status, color: '#999' };
            return (
              <TouchableOpacity style={styles.ticket} onPress={() => setView(item)}>
                <View style={styles.ticketTop}>
                  <Text style={styles.ticketTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={[styles.badge, { backgroundColor: s.color }]}>
                    <Text style={styles.badgeText}>{s.label}</Text>
                  </View>
                </View>
                <Text style={styles.ticketDesc} numberOfLines={2}>{item.description}</Text>
                <Text style={styles.ticketMeta}>
                  {fmt(item.createdAt)} · {item._count?.messages ?? 0} message{(item._count?.messages ?? 0) > 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            );
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
  ticket: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 8 },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ticketTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.text },
  ticketDesc: { fontSize: 13, color: '#666', marginTop: 4 },
  ticketMeta: { fontSize: 12, color: COLORS.muted, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.text, fontSize: 14 },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  original: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 12, marginBottom: 12 },
  originalLabel: { fontSize: 12, color: '#8D6E00', fontWeight: '600', marginBottom: 4 },
  bubble: { maxWidth: '82%', borderRadius: 12, padding: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: COLORS.card },
  author: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  bubbleText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  bubbleTime: { fontSize: 11, color: COLORS.muted, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  composerInput: { flex: 1, maxHeight: 120, backgroundColor: COLORS.bg, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, color: COLORS.text },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 18 },
  closed: { textAlign: 'center', color: '#666', padding: 14, backgroundColor: '#fff' },
});
