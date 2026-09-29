import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native';
import { apiFetch } from '../../lib/api';
import { useChargement } from '../../lib/useChargement';
import Chips from '../Chips';
import ReasonModal from '../ReasonModal';
import { COLORS, ErrorBox, Loading } from '../ui';
import { Bouton, s } from './MerchantsScreen';

interface Livreur {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  vehicleType: string;
  status: string;
  statusReason: string | null;
  piecesValidees: number;
  piecesAttendues: number;
  dossierComplet: boolean;
  totalDeliveries: number;
  rating: number | null;
}

type Filtre = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ALL';

const FILTRES: { value: Filtre; label: string }[] = [
  { value: 'PENDING', label: 'À examiner' },
  { value: 'ACTIVE', label: 'Actifs' },
  { value: 'SUSPENDED', label: 'Suspendus' },
  { value: 'ALL', label: 'Tous' },
];

type Ecart = { livreur: Livreur; etat: 'REJECTED' | 'SUSPENDED' };

export default function DriversScreen({ token, modifiable }: { token: string; modifiable: boolean }) {
  const [filtre, setFiltre] = useState<Filtre>('PENDING');
  const [ecart, setEcart] = useState<Ecart | null>(null);
  const { data, erreur, enCours, recharger } = useChargement(
    () => apiFetch<{ drivers: Livreur[] }>(`/api/superowner/drivers?status=${filtre}&limit=100`, token),
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

  const confirmer = (titre: string, chemin: string) =>
    Alert.alert(titre, undefined, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => agir(chemin) },
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
          data={data?.drivers ?? []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
          ListEmptyComponent={<Text style={s.vide}>Aucun livreur.</Text>}
          renderItem={({ item: l }) => (
            <View style={s.card}>
              <Text style={s.nom}>{l.name}</Text>
              <Text style={s.meta}>{l.email}{l.phone ? ` · ${l.phone}` : ''}</Text>
              <Text style={s.meta}>
                {l.status} · {l.vehicleType} · pièces {l.piecesValidees}/{l.piecesAttendues}
                {l.rating !== null ? ` · ★ ${l.rating.toFixed(1)}` : ''} · {l.totalDeliveries} courses
              </Text>
              {l.statusReason ? <Text style={s.meta}>Motif : {l.statusReason}</Text> : null}
              {modifiable && (
                <View style={s.actions}>
                  {l.status === 'PENDING' && (
                    <>
                      <Bouton
                        label="Valider"
                        couleur={l.dossierComplet ? COLORS.success : COLORS.muted}
                        onPress={() => confirmer(`Valider ${l.name} ?`, `/api/superowner/drivers/${l.id}/approve`)}
                      />
                      <Bouton label="Refuser" couleur={COLORS.danger} onPress={() => setEcart({ livreur: l, etat: 'REJECTED' })} />
                    </>
                  )}
                  {l.status === 'ACTIVE' && (
                    <Bouton label="Suspendre" couleur={COLORS.danger} onPress={() => setEcart({ livreur: l, etat: 'SUSPENDED' })} />
                  )}
                  {(l.status === 'SUSPENDED' || l.status === 'INACTIVE') && (
                    <Bouton
                      label="Réactiver"
                      couleur={COLORS.primary}
                      onPress={() => confirmer(`Réactiver ${l.name} ?`, `/api/superowner/drivers/${l.id}/reactivate`)}
                    />
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
      <ReasonModal
        visible={!!ecart}
        title={ecart?.etat === 'REJECTED' ? `Refuser ${ecart.livreur.name}` : `Suspendre ${ecart?.livreur.name ?? ''}`}
        confirmLabel={ecart?.etat === 'REJECTED' ? 'Refuser' : 'Suspendre'}
        onCancel={() => setEcart(null)}
        onConfirm={(raison) => {
          const e = ecart!;
          setEcart(null);
          agir(`/api/superowner/drivers/${e.livreur.id}/reject`, { etat: e.etat, raison });
        }}
      />
    </View>
  );
}
