import React, { useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import Chips from '../Chips';
import { COLORS, ErrorBox, Loading, ScreenHeader } from '../ui';
import { Bouton, s as carte } from './MerchantsScreen';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  organization: string;
  userEmail: string;
  createdAt: string;
  messageCount: number;
}

interface Message {
  id: string;
  body: string;
  authorRole: string;
  createdAt: string;
}

type Filtre = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'archives';

const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'OPEN', label: 'Ouverts' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'RESOLVED', label: 'Résolus' },
  { value: 'archives', label: 'Archivés' },
];

const LIBELLES: Record<string, string> = { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu', CLOSED: 'Clos' };

export default function SupportScreen({ token, modifiable }: { token: string; modifiable: boolean }) {
  const [filtre, setFiltre] = useState<Filtre>('OPEN');
  const [ouvert, setOuvert] = useState<Ticket | null>(null);
  const { data, erreur, enCours, recharger } = useChargement(
    () =>
      apiFetch<{ tickets: Ticket[] }>(
        `/api/superowner/support-tickets?limit=100${filtre === 'archives' ? '&archived=true' : `&status=${filtre}`}`,
        token
      ),
    [token, filtre]
  );

  if (ouvert) {
    return (
      <TicketScreen
        token={token}
        ticket={ouvert}
        modifiable={modifiable}
        onBack={() => {
          setOuvert(null);
          recharger();
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Chips options={FILTRES} value={filtre} onChange={setFiltre} />
      {enCours && !data ? (
        <Loading />
      ) : erreur && !data ? (
        <ErrorBox message={erreur} onRetry={recharger} />
      ) : (
        <FlatList
          data={data?.tickets ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
          ListEmptyComponent={<Text style={carte.vide}>Aucun ticket.</Text>}
          renderItem={({ item: t }) => (
            <TouchableOpacity style={carte.card} onPress={() => setOuvert(t)}>
              <Text style={carte.nom}>
                {t.priority === 'URGENT' ? '🔴 ' : ''}
                {t.title}
              </Text>
              <Text style={carte.meta}>{t.organization} · {t.userEmail}</Text>
              <Text style={carte.meta}>
                {LIBELLES[t.status] || t.status} · {t.priority} · {t.messageCount} message(s)
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function TicketScreen({ token, ticket, modifiable, onBack }: { token: string; ticket: Ticket; modifiable: boolean; onBack: () => void }) {
  const [reponse, setReponse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [statut, setStatut] = useState(ticket.status);
  const { data, erreur, enCours, recharger } = useChargement(
    () => apiFetch<{ data: Message[] }>(`/api/superowner/support-tickets/${ticket.id}/messages`, token),
    [token, ticket.id]
  );

  const envoyer = async () => {
    const body = reponse.trim();
    if (!body || envoi) return;
    setEnvoi(true);
    try {
      await apiFetch(`/api/superowner/support-tickets/${ticket.id}/messages`, token, { method: 'POST', body: { body } });
      setReponse('');
      await recharger();
    } catch (e) {
      Alert.alert('Envoi impossible', e instanceof Error ? e.message : 'Erreur');
    } finally {
      setEnvoi(false);
    }
  };

  const changerStatut = async (status: string) => {
    try {
      await apiFetch(`/api/superowner/support-tickets/${ticket.id}/status`, token, { method: 'PATCH', body: { status } });
      setStatut(status);
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : 'Erreur');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={ticket.title} subtitle={`${ticket.organization} · ${LIBELLES[statut] || statut}`} onBack={onBack} />
      {modifiable && (
        <View style={[carte.actions, { paddingHorizontal: 12 }]}>
          {statut !== 'IN_PROGRESS' && <Bouton label="En cours" couleur={COLORS.primary} onPress={() => changerStatut('IN_PROGRESS')} />}
          {statut !== 'RESOLVED' && <Bouton label="Résolu" couleur={COLORS.success} onPress={() => changerStatut('RESOLVED')} />}
          {statut !== 'CLOSED' && <Bouton label="Clore" couleur={COLORS.muted} onPress={() => changerStatut('CLOSED')} />}
        </View>
      )}
      {enCours && !data ? (
        <Loading />
      ) : erreur && !data ? (
        <ErrorBox message={erreur} onRetry={recharger} />
      ) : (
        <FlatList
          data={data?.data ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12 }}
          ListHeaderComponent={<Text style={[s.bulle, s.eux]}>{ticket.description}</Text>}
          renderItem={({ item: m }) => (
            <View style={[s.bulle, m.authorRole === 'ADMIN' ? s.nous : s.eux]}>
              <Text style={m.authorRole === 'ADMIN' ? { color: '#fff' } : undefined}>{m.body}</Text>
              <Text style={[s.date, m.authorRole === 'ADMIN' && { color: '#ddd' }]}>
                {new Date(m.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
              </Text>
            </View>
          )}
        />
      )}
      {modifiable && (
        <View style={s.saisie}>
          <TextInput style={s.input} placeholder="Répondre au commerçant…" value={reponse} onChangeText={setReponse} multiline />
          <TouchableOpacity onPress={envoyer} disabled={envoi || !reponse.trim()} style={[s.envoyer, (envoi || !reponse.trim()) && { opacity: 0.5 }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Envoyer</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bulle: { borderRadius: 10, padding: 10, marginBottom: 8, maxWidth: '85%' },
  eux: { backgroundColor: '#fff', alignSelf: 'flex-start' },
  nous: { backgroundColor: COLORS.primary, alignSelf: 'flex-end' },
  date: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
  saisie: { flexDirection: 'row', padding: 8, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxHeight: 120 },
  envoyer: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', marginLeft: 8 },
});
