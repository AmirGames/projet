import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, ErrorBox, Loading } from '../../components/ui';
import { messageErreur, useToken } from '../../lib/auth';
import { mesTrajets, prix, type ResumeTrajet } from '../../lib/courses';
import { statutCourt } from '../../lib/statuts';

const date = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Les trajets du passager, du plus récent au plus ancien. */
export default function Historique() {
  const router = useRouter();
  const token = useToken();
  const [trajets, setTrajets] = useState<ResumeTrajet[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [actualisation, setActualisation] = useState(false);

  const charger = useCallback(async () => {
    try {
      setTrajets(await mesTrajets(token));
      setErreur('');
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void charger();
    }, [charger])
  );

  if (!trajets) {
    if (erreur) return <ErrorBox message={erreur} onRetry={charger} />;
    return <Loading />;
  }

  return (
    <FlatList
      data={trajets}
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.liste}
      refreshControl={
        <RefreshControl
          refreshing={actualisation}
          onRefresh={async () => {
            setActualisation(true);
            await charger();
            setActualisation(false);
          }}
        />
      }
      ListHeaderComponent={erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      ListEmptyComponent={<Text style={styles.vide}>Vous n'avez pas encore commandé de trajet.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.carte}
          onPress={() => router.push({ pathname: '/trajet/[id]', params: { id: item.id } })}
        >
          <View style={styles.ligne}>
            <Text style={styles.statut}>{statutCourt(item.statut)}</Text>
            <Text style={styles.prix}>{prix(item.prixCentimes)}</Text>
          </View>
          <Text style={styles.adresse} numberOfLines={1}>{item.departAdresse}</Text>
          <Text style={styles.adresse} numberOfLines={1}>→ {item.arriveeAdresse}</Text>
          <Text style={styles.date}>{date(item.createdAt)}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  liste: { padding: 12, flexGrow: 1 },
  carte: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 10 },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  statut: { fontWeight: '700', color: COLORS.primary },
  prix: { fontWeight: '700', color: '#111827' },
  adresse: { color: COLORS.text, fontSize: 14 },
  date: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  vide: { textAlign: 'center', color: '#6B7280', marginTop: 40 },
  erreur: { color: COLORS.danger, marginBottom: 8 },
});
