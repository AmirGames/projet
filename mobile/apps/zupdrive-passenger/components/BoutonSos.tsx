import React, { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import { messageErreur } from '../lib/auth';
import { confirmer } from '../lib/confirmer';
import { declencherSos, type AlerteSos } from '../lib/sos';
import { Card, COLORS } from './ui';

/** La position du téléphone, si le passager l'autorise et vite : l'alerte part dans tous les cas. */
async function positionDuTelephone(): Promise<{ latitude: number; longitude: number } | undefined> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return undefined;
    const lue = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    return lue ? { latitude: lue.coords.latitude, longitude: lue.coords.longitude } : undefined;
  } catch {
    return undefined;
  }
}

const appeler = (numero: string) => void Linking.openURL(`tel:${numero}`).catch(() => undefined);

/**
 * Besoin d'aide pendant un trajet : les numéros d'urgence d'abord (ils ne
 * dépendent pas du réseau de l'application), puis l'alerte à l'équipe ZupDrive
 * et à la personne de confiance. ZupDrive ne promet aucune intervention sur place.
 */
export default function BoutonSos({ token, courseId }: { token: string; courseId: string }) {
  const [envoi, setEnvoi] = useState(false);
  const [alerte, setAlerte] = useState<AlerteSos | null>(null);
  const [erreur, setErreur] = useState('');

  const envoyer = () =>
    confirmer(
      'Envoyer une alerte ?',
      "L'équipe ZupDrive et votre personne de confiance (si vous en avez une) seront prévenues avec le détail de votre trajet. En danger immédiat, appelez le 17 ou le 112.",
      "Envoyer l'alerte",
      async () => {
        setEnvoi(true);
        setErreur('');
        try {
          setAlerte(await declencherSos(token, courseId, await positionDuTelephone()));
        } catch (e) {
          setErreur(`${messageErreur(e)} Appelez le 17 ou le 112 si vous êtes en danger.`);
        } finally {
          setEnvoi(false);
        }
      }
    );

  return (
    <Card title="Besoin d'aide ?">
      <View style={styles.urgences}>
        <TouchableOpacity style={styles.urgence} onPress={() => appeler('17')} accessibilityLabel="Appeler le 17, police">
          <Text style={styles.urgenceTexte}>📞 Police : 17</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.urgence} onPress={() => appeler('112')} accessibilityLabel="Appeler le 112, urgences">
          <Text style={styles.urgenceTexte}>📞 Urgences : 112</Text>
        </TouchableOpacity>
      </View>

      {alerte ? (
        <View>
          <Text style={styles.ok}>
            {alerte.equipePrevenueLe ? "Alerte envoyée à l'équipe ZupDrive." : "L'alerte est enregistrée ; l'équipe n'a pas encore pu être prévenue."}
            {alerte.contactPrevenuLe ? ' Votre personne de confiance a été prévenue.' : ''}
          </Text>
          <Text style={styles.aide}>ZupDrive ne peut pas intervenir sur place : en cas de danger, appelez le 17 ou le 112.</Text>
          {!alerte.equipePrevenueLe ? (
            <TouchableOpacity style={styles.retenter} onPress={envoyer} disabled={envoi}>
              <Text style={styles.retenterTexte}>Réessayer d'alerter l'équipe</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <TouchableOpacity style={[styles.sos, envoi && styles.off]} onPress={envoyer} disabled={envoi}>
          {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.sosTexte}>🆘 Alerter ZupDrive</Text>}
        </TouchableOpacity>
      )}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  urgences: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  urgence: { flex: 1, borderWidth: 1, borderColor: COLORS.danger, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  urgenceTexte: { color: COLORS.danger, fontWeight: '700' },
  sos: { backgroundColor: COLORS.danger, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  sosTexte: { color: '#fff', fontSize: 16, fontWeight: '700' },
  off: { opacity: 0.5 },
  ok: { color: '#15803D', fontSize: 14, fontWeight: '600' },
  aide: { color: '#6B7280', fontSize: 13, marginTop: 6 },
  retenter: { marginTop: 8 },
  retenterTexte: { color: COLORS.primary, textDecorationLine: 'underline' },
  erreur: { color: COLORS.danger, fontSize: 13, marginTop: 8 },
});
