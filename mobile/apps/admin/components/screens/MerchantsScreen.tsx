import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import Chips from '../Chips';
import ReasonModal from '../ReasonModal';
import { COLORS, ErrorBox, Loading } from '../ui';

interface Organisation {
  id: string;
  name: string;
  email: string;
  status: string;
  tier: string;
  createdAt: string;
  approvedAt: string | null;
  revenue: number;
}

type Filtre = 'attente' | 'ACTIVE' | 'SUSPENDED' | 'tous';

const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'attente', label: 'À valider' },
  { value: 'ACTIVE', label: 'Actifs' },
  { value: 'SUSPENDED', label: 'Suspendus' },
  { value: 'tous', label: 'Tous' },
];

function requete(filtre: Filtre) {
  if (filtre === 'attente') return '?validation=attente&limit=100';
  if (filtre === 'tous') return '?limit=100';
  return `?status=${filtre}&limit=100`;
}

export default function MerchantsScreen({ token, modifiable }: { token: string; modifiable: boolean }) {
  const [filtre, setFiltre] = useState<Filtre>('attente');
  const [aSuspendre, setASuspendre] = useState<Organisation | null>(null);
  const { data, erreur, enCours, recharger } = useChargement(
    () => apiFetch<{ organizations: Organisation[] }>(`/api/superowner/organizations${requete(filtre)}`, token),
    [token, filtre]
  );

  const agir = async (chemin: string, body?: unknown) => {
    try {
      await apiFetch(chemin, token, { method: 'POST', body: body ?? {} });
      await recharger();
    } catch (e) {
      Alert.alert('Action impossible', e instanceof Error ? e.message : 'Erreur');
    }
  };

  const valider = (o: Organisation) =>
    Alert.alert('Valider ce commerce ?', `${o.name} pourra ouvrir sa boutique et recevoir des commandes.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Valider', onPress: () => agir(`/api/superowner/organizations/${o.id}/approve`) },
    ]);

  const reactiver = (o: Organisation) =>
    Alert.alert('Réactiver ce commerce ?', o.name, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Réactiver', onPress: () => agir(`/api/superowner/organizations/${o.id}/unsuspend`) },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Chips options={FILTRES} value={filtre} onChange={setFiltre} />
      {enCours && !data ? (
        <Loading />
      ) : erreur && !data ? (
        <ErrorBox message={erreur} onRetry={recharger} />
      ) : (
        <FlatList
          data={data?.organizations ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
          ListEmptyComponent={<Text style={s.vide}>Aucun commerce.</Text>}
          renderItem={({ item: o }) => (
            <View style={s.card}>
              <Text style={s.nom}>{o.name}</Text>
              <Text style={s.meta}>{o.email || '—'} · {o.tier}</Text>
              <Text style={s.meta}>
                {o.status}
                {o.approvedAt ? '' : ' · en attente de validation'} · CA {formatEuros(o.revenue)}
              </Text>
              {modifiable && (
                <View style={s.actions}>
                  {!o.approvedAt && <Bouton label="Valider" couleur={COLORS.success} onPress={() => valider(o)} />}
                  {o.status === 'ACTIVE' && <Bouton label="Suspendre" couleur={COLORS.danger} onPress={() => setASuspendre(o)} />}
                  {o.status === 'SUSPENDED' && <Bouton label="Réactiver" couleur={COLORS.primary} onPress={() => reactiver(o)} />}
                </View>
              )}
            </View>
          )}
        />
      )}
      <ReasonModal
        visible={!!aSuspendre}
        title={`Suspendre ${aSuspendre?.name ?? ''}`}
        confirmLabel="Suspendre"
        onCancel={() => setASuspendre(null)}
        onConfirm={(reason) => {
          const o = aSuspendre!;
          setASuspendre(null);
          agir(`/api/superowner/organizations/${o.id}/suspend`, { reason });
        }}
      />
    </View>
  );
}

export function Bouton({ label, couleur, onPress }: { label: string; couleur: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.bouton, { backgroundColor: couleur }]}>
      <Text style={s.boutonTexte}>{label}</Text>
    </TouchableOpacity>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10 },
  nom: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  bouton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginTop: 4 },
  boutonTexte: { color: '#fff', fontWeight: '600' },
  vide: { textAlign: 'center', color: COLORS.muted, marginTop: 40 },
});
