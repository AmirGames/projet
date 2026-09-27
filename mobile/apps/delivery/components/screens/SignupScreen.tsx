import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { API_URL, SITE_URL } from '../../lib/api';
import type { Session } from '../../lib/session';
import { COLORS, themedStyles } from '../ui';
import { CRITERES_MOT_DE_PASSE, MESSAGE_MOT_DE_PASSE, motDePasseValide } from '../../lib/motDePasse';

/** Les pays où ZupEat livre, comme sur le site. */
const PAYS = {
  FR: { libelle: '🇫🇷 France', indicatif: '+33' },
  BE: { libelle: '🇧🇪 Belgique', indicatif: '+32' },
} as const;
type Pays = keyof typeof PAYS;

const VEHICULES = [
  { valeur: 'bike', libelle: '🚲 Vélo' },
  { valeur: 'scooter', libelle: '🛵 Scooter' },
  { valeur: 'car', libelle: '🚗 Voiture' },
] as const;

/** Même règle que le site : « 06… » devient « +336… », un « +32… » reste tel quel. */
function telephoneInternational(numero: string, pays: Pays) {
  const chiffres = numero.replace(/[^\d+]/g, '');
  if (!chiffres) return numero.trim();
  if (chiffres.startsWith('+')) return chiffres;
  if (chiffres.startsWith('00')) return `+${chiffres.slice(2)}`;
  const { indicatif } = PAYS[pays];
  if (chiffres.startsWith(indicatif.slice(1)) && chiffres.length > 10) return `+${chiffres}`;
  return `${indicatif}${chiffres.replace(/^0/, '')}`;
}

/**
 * Devenir livreur, depuis l'application.
 *
 * Il fallait passer par le site. Le compte naît ici, en attente de
 * validation : le livreur envoie ensuite ses pièces depuis « Mon compte »,
 * et la plateforme le valide avant qu'il puisse passer en ligne.
 */
export default function SignupScreen({
  onSignedUp,
  onCancel,
}: {
  onSignedUp: (session: Session) => void;
  onCancel: () => void;
}) {
  const [pays, setPays] = useState<Pays>('FR');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState<(typeof VEHICULES)[number]['valeur']>('bike');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const motorise = vehicleType !== 'bike';

  const submit = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Indiquez votre nom complet.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Adresse e-mail invalide.');
    if (!motDePasseValide(password)) return setError(MESSAGE_MOT_DE_PASSE);
    if (phone.replace(/\D/g, '').length < 9) return setError('Numéro de téléphone invalide.');
    if (motorise && !vehiclePlate.trim()) return setError('Indiquez la plaque d’immatriculation.');
    if (!accepted) return setError('Acceptez les conditions pour continuer.');

    setSending(true);
    try {
      const response = await fetch(`${API_URL}/api/drivers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionsAcceptees: true,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: telephoneInternational(phone, pays),
          vehicleType,
          vehiclePlate: motorise ? vehiclePlate.trim().toUpperCase() : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Le serveur détaille le champ fautif (zod) ou le conflit d'adresse.
        const detail = Array.isArray(data?.details) ? data.details[0]?.message : null;
        setError(detail || data?.error || data?.message || 'L’inscription n’a pas abouti.');
        return;
      }
      onSignedUp({ accessToken: data.accessToken, refreshToken: data.refreshToken, email: email.trim().toLowerCase() });
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    } finally {
      setSending(false);
    }
  };

  const lien = (chemin: string, libelle: string) => (
    <Text style={styles.link} onPress={() => Linking.openURL(`${SITE_URL}${chemin}`).catch(() => undefined)}>
      {libelle}
    </Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Devenir livreur</Text>
        <Text style={styles.subtitle}>
          Créez votre compte, envoyez vos pièces : vous recevrez des courses dès que votre dossier sera validé.
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Pays où vous livrez</Text>
        <View style={styles.chips}>
          {(Object.keys(PAYS) as Pays[]).map((p) => (
            <TouchableOpacity key={p} style={[styles.chip, pays === p && styles.chipActive]} onPress={() => setPays(p)}>
              <Text style={[styles.chipText, pays === p && styles.chipTextActive]}>{PAYS[p].libelle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Nom complet</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          placeholder="Prénom Nom"
          placeholderTextColor={COLORS.muted}
          editable={!sending}
        />

        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="vous@exemple.fr"
          placeholderTextColor={COLORS.muted}
          editable={!sending}
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          placeholderTextColor={COLORS.muted}
          editable={!sending}
        />
        <View style={styles.criteres}>
          {CRITERES_MOT_DE_PASSE.map(({ libelle, respecte }) => {
            const ok = respecte(password);
            return (
              <Text key={libelle} style={[styles.critere, ok && styles.critereOk]}>
                {ok ? '✓' : '•'} {libelle}
              </Text>
            );
          })}
        </View>

        <Text style={styles.label}>Téléphone</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder={pays === 'FR' ? '06 12 34 56 78' : '0470 12 34 56'}
          placeholderTextColor={COLORS.muted}
          editable={!sending}
        />

        <Text style={styles.label}>Véhicule</Text>
        <View style={styles.chips}>
          {VEHICULES.map((v) => (
            <TouchableOpacity
              key={v.valeur}
              style={[styles.chip, vehicleType === v.valeur && styles.chipActive]}
              onPress={() => setVehicleType(v.valeur)}
            >
              <Text style={[styles.chipText, vehicleType === v.valeur && styles.chipTextActive]}>{v.libelle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {motorise && (
          <>
            <Text style={styles.label}>Plaque d’immatriculation</Text>
            <TextInput
              style={styles.input}
              value={vehiclePlate}
              onChangeText={setVehiclePlate}
              autoCapitalize="characters"
              placeholder="AB-123-CD"
              placeholderTextColor={COLORS.muted}
              editable={!sending}
            />
          </>
        )}

        <TouchableOpacity
          style={styles.acceptRow}
          onPress={() => setAccepted((a) => !a)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.box, accepted && styles.boxChecked]}>{accepted && <Text style={styles.tick}>✓</Text>}</View>
          <Text style={styles.acceptText}>
            J’accepte les {lien('/cgu', 'conditions d’utilisation')}, les{' '}
            {lien('/conditions-livreurs', 'conditions des livreurs')} et la{' '}
            {lien('/confidentialite', 'politique de confidentialité')}, dont le partage de ma position quand je suis en
            ligne.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, sending && { opacity: 0.7 }]} onPress={submit} disabled={sending}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Créer mon compte</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={onCancel} style={styles.back} disabled={sending}>
          <Text style={styles.backText}>J’ai déjà un compte : me connecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themedStyles(() => ({
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 15, color: COLORS.onHeader, opacity: 0.85, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  error: {
    backgroundColor: COLORS.dangerBg,
    color: COLORS.danger,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
  },
  label: { fontSize: 14, color: COLORS.onHeader, opacity: 0.9, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: COLORS.raised,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  criteres: { marginTop: -6, marginBottom: 14 },
  critere: { fontSize: 13, color: COLORS.onHeader, opacity: 0.75, marginBottom: 2 },
  critereOk: { opacity: 1, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.raised },
  chipActive: { backgroundColor: COLORS.primary },
  chipText: { fontSize: 15, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  acceptRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginTop: 4, marginBottom: 18 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.onHeader,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tick: { color: '#fff', fontWeight: '800', fontSize: 15 },
  acceptText: { flex: 1, fontSize: 14, color: COLORS.onHeader, lineHeight: 20 },
  link: { color: COLORS.link, textDecorationLine: 'underline', fontWeight: '600' },
  button: { backgroundColor: COLORS.loginButton, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: { alignItems: 'center', paddingVertical: 16 },
  backText: { color: COLORS.onHeader, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
}));
