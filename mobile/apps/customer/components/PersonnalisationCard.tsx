import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { apiFetch } from '../lib/api';
import { Card, COLORS } from './ui';

/**
 * Le droit d'opposition à la personnalisation : coupée, les suggestions de
 * commerces ne se fondent plus sur les commandes passées. Le serveur est seul
 * juge : l'interrupteur affiche ce qu'il a enregistré.
 */
export default function PersonnalisationCard({ token }: { token: string }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    apiFetch<{ data: { personnalisationActive: boolean } }>('/api/client/me/personnalisation', token)
      .then((res) => setActive(!!res.data?.personnalisationActive))
      .catch(() => undefined);
  }, [token]);

  if (active === null) return null;

  const changer = async (voulue: boolean) => {
    setEnCours(true);
    setErreur(false);
    try {
      const res = await apiFetch<{ data: { personnalisationActive: boolean } }>(
        '/api/client/me/personnalisation',
        token,
        { method: 'PUT', body: { desactivee: !voulue } },
      );
      setActive(!!res.data?.personnalisationActive);
    } catch {
      setErreur(true);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Card title="Suggestions personnalisées">
      <View style={styles.ligne}>
        <Text style={styles.texte}>
          Nous vous suggérons des commerces proches de ce que vous commandez le plus, d'après vos commandes passées.
          Désactivez-les à tout moment.
        </Text>
        <Switch
          value={active}
          onValueChange={changer}
          disabled={enCours}
          trackColor={{ true: COLORS.primary }}
          accessibilityLabel="Suggestions personnalisées"
        />
      </View>
      {erreur ? <Text style={styles.erreur}>Le réglage n'a pas pu être enregistré. Réessayez.</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  texte: { flex: 1, fontSize: 13, color: COLORS.muted },
  erreur: { marginTop: 8, fontSize: 13, color: COLORS.danger },
});
