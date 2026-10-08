import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { messageErreur } from '../lib/auth';
import { envoyerMessage, lireMessages } from '../lib/chat';
import { cleAleatoire, RELECTURE_MS } from '../lib/courses';
import { depuisDe, fusionnerMessages, TEXTE_MAX, texteEnvoyable, type MessageChat } from '../lib/messages';
import { Card, COLORS } from './ui';

/**
 * Le chat avec le chauffeur pendant le trajet. Les messages se relisent toutes
 * les 4 s tant que l'écran est affiché et l'application au premier plan ; le
 * serveur reste la source de vérité (rien n'est affiché avant son accord).
 */
export default function ChatCourse({ token, courseId, prenom }: { token: string; courseId: string; prenom: string | null }) {
  const [messages, setMessages] = useState<MessageChat[]>([]);
  const [saisie, setSaisie] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const enVol = useRef(false);
  const vivant = useRef(true);
  const dernier = useRef<string | undefined>(undefined);
  // Une clé par message en cours d'envoi : réessayer après une coupure rend le même message.
  const cle = useRef(cleAleatoire());

  const relire = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const recus = await lireMessages(token, courseId, dernier.current);
      if (!vivant.current) return;
      setMessages((anciens) => {
        const suite = fusionnerMessages(anciens, recus);
        dernier.current = depuisDe(suite);
        return suite;
      });
    } catch {
      // Une relecture manquée sera refaite 4 s plus tard ; on n'efface rien.
    } finally {
      enVol.current = false;
    }
  }, [token, courseId]);

  useFocusEffect(
    useCallback(() => {
      vivant.current = true;
      void relire();
      const minuteur = setInterval(() => {
        if (AppState.currentState === 'active') void relire();
      }, RELECTURE_MS);
      return () => {
        vivant.current = false;
        clearInterval(minuteur);
      };
    }, [relire])
  );

  const envoyer = async () => {
    if (envoi || !texteEnvoyable(saisie)) return;
    setEnvoi(true);
    setErreur('');
    try {
      const envoye = await envoyerMessage(token, courseId, saisie, cle.current);
      if (!vivant.current) return;
      setMessages((anciens) => {
        const suite = fusionnerMessages(anciens, [envoye]);
        dernier.current = depuisDe(suite);
        return suite;
      });
      setSaisie('');
      cle.current = cleAleatoire();
    } catch (e) {
      if (vivant.current) setErreur(messageErreur(e));
    } finally {
      if (vivant.current) setEnvoi(false);
    }
  };

  return (
    <Card title={`Message à ${prenom ?? 'votre chauffeur'}`}>
      {messages.length === 0 ? <Text style={styles.vide}>Aucun message pour l'instant.</Text> : null}
      {messages.map((m) => (
        <View key={m.id} style={[styles.bulle, m.auteur === 'PASSAGER' ? styles.moi : styles.lui]}>
          <Text style={m.auteur === 'PASSAGER' ? styles.texteMoi : styles.texteLui}>{m.texte}</Text>
        </View>
      ))}
      <TextInput
        value={saisie}
        onChangeText={setSaisie}
        placeholder="Votre message"
        maxLength={TEXTE_MAX}
        multiline
        editable={!envoi}
        style={styles.champ}
        accessibilityLabel="Votre message"
      />
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      <TouchableOpacity style={[styles.bouton, (!texteEnvoyable(saisie) || envoi) && styles.off]} onPress={envoyer} disabled={!texteEnvoyable(saisie) || envoi}>
        {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Envoyer</Text>}
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  vide: { color: '#6B7280', fontSize: 13, marginBottom: 8 },
  bulle: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  moi: { alignSelf: 'flex-end', backgroundColor: COLORS.primary },
  lui: { alignSelf: 'flex-start', backgroundColor: '#E5E7EB' },
  texteMoi: { color: '#fff', fontSize: 14 },
  texteLui: { color: '#111827', fontSize: 14 },
  champ: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, marginTop: 8, minHeight: 44 },
  erreur: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  off: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
