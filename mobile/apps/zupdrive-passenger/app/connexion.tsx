import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { messageErreur, useAuth } from '../lib/auth';
import { COLORS } from '../components/ui';

export default function Connexion() {
  const { connecter } = useAuth();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const valider = async () => {
    if (envoi) return;
    if (!email.trim() || !motDePasse) {
      setErreur('Entrez votre e-mail et votre mot de passe.');
      return;
    }
    setEnvoi(true);
    setErreur('');
    try {
      await connecter(email, motDePasse);
    } catch (e) {
      setErreur(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
          <Text style={styles.titre}>ZupDrive</Text>
          <Text style={styles.sousTitre}>Connectez-vous avec votre compte ZupOne pour commander un trajet.</Text>

          <Text style={styles.libelle}>E-mail</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="vous@exemple.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!envoi}
            style={styles.champ}
          />

          <Text style={styles.libelle}>Mot de passe</Text>
          <TextInput
            value={motDePasse}
            onChangeText={setMotDePasse}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="current-password"
            editable={!envoi}
            onSubmitEditing={valider}
            style={styles.champ}
          />

          {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

          <TouchableOpacity style={[styles.bouton, envoi && styles.boutonOff]} onPress={valider} disabled={envoi}>
            {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Se connecter</Text>}
          </TouchableOpacity>
          <View>
            <Text style={styles.aide}>Pas encore de compte ? Créez-le gratuitement sur le site ZupDrive.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },
  contenu: { padding: 24, justifyContent: 'center', flexGrow: 1 },
  titre: { fontSize: 32, fontWeight: 'bold', color: COLORS.primary, textAlign: 'center' },
  sousTitre: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, marginBottom: 28 },
  libelle: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 4 },
  champ: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 14 },
  erreur: { color: COLORS.danger, fontSize: 14, marginBottom: 8 },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  boutonOff: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  aide: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
