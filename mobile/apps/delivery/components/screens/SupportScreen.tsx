import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';

interface SupportMessage {
  id: string;
  sender: 'DRIVER' | 'SUPPORT';
  body: string;
  readAt?: string | null;
  createdAt: string;
}

const QUICK_TOPICS = [
  'Le client ne répond pas',
  "Le commerce n'a pas préparé la commande",
  "Je n'arrive pas à trouver l'adresse",
  'Problème avec mon véhicule',
];

const MAX_LENGTH = 2000;

/** Discussion en direct avec le support de la plateforme. */
export default function SupportScreen({
  token,
  onBack,
  onRead,
}: {
  token: string;
  onBack: () => void;
  onRead: () => void;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const list = useRef<FlatList<SupportMessage>>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      // Ouvrir le fil vaut lecture des réponses du support.
      const res = await apiFetch<{ data: SupportMessage[] }>('/api/drivers/support/messages', token);
      setMessages(res.data || []);
      onRead();
    } catch (e: any) {
      setError(e.message || "Le fil n'a pas pu être chargé");
    } finally {
      setLoading(false);
    }
  }, [token, onRead]);

  useEffect(() => {
    load();
  }, [load]);

  // Les réponses du support arrivent en direct.
  useRealtimeEvent('support-message', (m: SupportMessage) => {
    setMessages((current) => (current.some((x) => x.id === m.id) ? current : [...current, m]));
    if (m.sender === 'SUPPORT') {
      apiFetch('/api/drivers/support/read', token, { method: 'POST' }).catch(() => undefined);
      onRead();
    }
  });
  useRealtimeEvent('reconnecte', load);

  const send = async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await apiFetch<{ data: SupportMessage }>('/api/drivers/support/messages', token, {
        method: 'POST',
        body: { body: trimmed },
      });
      setMessages((current) => (current.some((x) => x.id === res.data.id) ? current : [...current, res.data]));
      setText('');
    } catch (e: any) {
      setError(e.message || "Le message n'est pas parti");
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Support 💬" subtitle="Une équipe vous répond pendant vos courses" onBack={onBack} />
      {loading ? (
        <Loading />
      ) : error && messages.length === 0 ? (
        <ErrorBox message={error} onRetry={load} />
      ) : (
        <>
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>Un souci pendant une course ?</Text>
                <Text style={styles.emptyText}>Écrivez-nous, ou choisissez un sujet :</Text>
                {QUICK_TOPICS.map((t) => (
                  <TouchableOpacity key={t} style={styles.topic} onPress={() => send(t)} disabled={sending}>
                    <Text style={styles.topicText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender === 'DRIVER';
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  {!mine && <Text style={styles.author}>Support</Text>}
                  <Text style={[styles.body, mine && { color: '#fff' }]}>{item.body}</Text>
                  <Text style={[styles.time, mine && { color: '#fff', opacity: 0.8 }]}>
                    {new Date(item.createdAt).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Votre message…"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_LENGTH}
            />
            <TouchableOpacity
              style={[styles.send, (!text.trim() || sending) && { opacity: 0.5 }]}
              onPress={() => send(text)}
              disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Envoyer</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, paddingBottom: 16, flexGrow: 1 },
  emptyBox: { backgroundColor: COLORS.card, borderRadius: 12, padding: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  emptyText: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 10 },
  topic: { backgroundColor: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 8 },
  topicText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  bubble: { maxWidth: '82%', borderRadius: 14, padding: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: COLORS.card, borderBottomLeftRadius: 4 },
  author: { fontSize: 11, fontWeight: '700', color: COLORS.primary, marginBottom: 2 },
  body: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  time: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: 'flex-end' },
  error: { color: COLORS.danger, fontSize: 13, paddingHorizontal: 12, paddingBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 8,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: COLORS.bg,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
  },
  send: { backgroundColor: COLORS.primary, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11 },
  sendText: { color: '#fff', fontWeight: '700' },
});
