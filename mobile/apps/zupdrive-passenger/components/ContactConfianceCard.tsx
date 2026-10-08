import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { messageErreur, useToken } from '../lib/auth';
import {
  enregistrerContactConfiance,
  lireContactConfiance,
  supprimerContactConfiance,
  type ContactConfiance,
} from '../lib/sos';
import { Card, COLORS } from './ui';
import { useEffectChargement } from '../lib/useEffectChargement';

/** La personne prévenue par e-mail quand le passager déclenche une alerte SOS. */
export default function ContactConfianceCard() {
  const token = useToken();
  const [contact, setContact] = useState<ContactConfiance | null>(null);
  const [charge, setCharge] = useState(false);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [consentement, setConsentement] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const lire = useCallback(async () => {
    try {
      setContact(await lireContactConfiance(token));
      setErreur('');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setCharge(true);
    }
  }, [token]);

  useEffectChargement(() => {
    void lire();
  }, [lire]);

  const enregistrer = async () => {
    if (envoi) return;
    setEnvoi(true);
    setErreur('');
    try {
      setContact(await enregistrerContactConfiance(token, nom.trim(), email.trim()));
      setNom('');
      setEmail('');
      setConsentement(false);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await supprimerContactConfiance(token);
      setContact(null);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  const valide = nom.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && consentement;

  return (
    <Card title="Personne de confiance">
      {!charge ? (
        <ActivityIndicator color={COLORS.primary} />
      ) : contact ? (
        <View>
          <Text style={styles.nom}>{contact.nom}</Text>
          <Text style={styles.texte}>{contact.email}</Text>
          <Text style={styles.aide}>Elle sera prévenue par e-mail si vous déclenchez une alerte pendant un trajet.</Text>
          <TouchableOpacity onPress={retirer} disabled={envoi}>
            <Text style={styles.retirer}>Retirer cette personne</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={styles.aide}>Elle sera prévenue par e-mail, avec le détail de votre trajet, si vous déclenchez une alerte SOS.</Text>
          <TextInput value={nom} onChangeText={setNom} placeholder="Son prénom et nom" style={styles.champ} editable={!envoi} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Son e-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.champ}
            editable={!envoi}
          />
          <TouchableOpacity style={styles.consentement} onPress={() => setConsentement((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: consentement }}>
            <Text style={styles.case}>{consentement ? '☑' : '☐'}</Text>
            <Text style={styles.consentementTexte}>J'ai prévenu cette personne qu'elle peut recevoir une alerte de ma part.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.bouton, (!valide || envoi) && styles.off]} onPress={enregistrer} disabled={!valide || envoi}>
            {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      )}
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  nom: { fontSize: 16, fontWeight: '700', color: '#111827' },
  texte: { color: COLORS.text, fontSize: 14 },
  aide: { color: '#6B7280', fontSize: 13, marginVertical: 6 },
  retirer: { color: COLORS.danger, textDecorationLine: 'underline', marginTop: 4 },
  champ: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 8 },
  consentement: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  case: { fontSize: 20, color: COLORS.primary },
  consentementTexte: { flex: 1, color: COLORS.text, fontSize: 13 },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  off: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  erreur: { color: COLORS.danger, fontSize: 13, marginTop: 8 },
});
