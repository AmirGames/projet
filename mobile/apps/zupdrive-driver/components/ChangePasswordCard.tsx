import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../lib/api';
import { CRITERES_MOT_DE_PASSE, MESSAGE_MOT_DE_PASSE, motDePasseValide } from '../lib/motDePasse';
import { Card, COLORS } from './ui';

/** Les jetons neufs que le serveur remet : les autres sessions du compte sont fermées, celle-ci reste ouverte. */
export interface NewTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Changer son mot de passe depuis le profil (POST /api/auth/change-password) :
 * il faut l'actuel, le nouveau suit la règle de la création de compte, et les
 * autres appareils sont déconnectés.
 */
export default function ChangePasswordCard({ token, onChanged }: { token: string; onChanged: (tokens: NewTokens | null) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!current) return setError('Saisissez votre mot de passe actuel.');
    if (!motDePasseValide(next)) return setError(MESSAGE_MOT_DE_PASSE);
    if (next !== confirmation) return setError('La confirmation ne correspond pas au nouveau mot de passe.');
    setSaving(true);
    try {
      const res = await apiFetch<{ message?: string; accessToken?: string; refreshToken?: string }>('/api/auth/change-password', token, {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      });
      setCurrent('');
      setNext('');
      setConfirmation('');
      Alert.alert('Mot de passe', res.message || 'Mot de passe modifié. Reconnectez-vous.');
      // Le serveur ferme toutes les sessions : sans jetons neufs, retour à la connexion.
      onChanged(res.accessToken && res.refreshToken ? { accessToken: res.accessToken, refreshToken: res.refreshToken } : null);
    } catch (e: any) {
      setError(e.message || 'Le mot de passe n’a pas pu être changé.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Mot de passe">
      <TextInput
        style={styles.input}
        placeholder="Mot de passe actuel"
        placeholderTextColor="#999"
        secureTextEntry
        autoCapitalize="none"
        value={current}
        onChangeText={setCurrent}
      />
      <TextInput
        style={styles.input}
        placeholder="Nouveau mot de passe"
        placeholderTextColor="#999"
        secureTextEntry
        autoCapitalize="none"
        value={next}
        onChangeText={setNext}
      />
      {next ? (
        <View style={{ marginBottom: 8 }}>
          {CRITERES_MOT_DE_PASSE.map((c) => (
            <Text key={c.libelle} style={[styles.help, c.respecte(next) && styles.ok]}>
              {c.respecte(next) ? '✓' : '○'} {c.libelle}
            </Text>
          ))}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Confirmer le nouveau mot de passe"
        placeholderTextColor="#999"
        secureTextEntry
        autoCapitalize="none"
        value={confirmation}
        onChangeText={setConfirmation}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.help}>Vos autres appareils seront déconnectés.</Text>
      <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Changer le mot de passe</Text>}
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 8,
  },
  help: { fontSize: 12, color: COLORS.muted, marginVertical: 2 },
  ok: { color: COLORS.success },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 6 },
  button: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
