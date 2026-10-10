import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { apiFetch } from '../lib/api';
import { Card, ui } from './ui';

/** Les secrets ne quittent jamais l'état mémoire de cet écran. */
export default function MfaScreen({ token, onDone, onLogout }: { token: string; onDone: () => void; onLogout: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { apiFetch<{ enabled: boolean }>('/api/auth/mfa', token).then((s) => setEnabled(s.enabled)).catch(() => undefined); }, [token]);
  async function act(action: string, body: unknown) {
    setBusy(true);
    try {
      const data = await apiFetch<{ secret?: string; recoveryCodes?: string[] }>(`/api/auth/mfa/${action}`, token, { method: 'POST', body });
      setCode(''); setPassword('');
      if (data.secret) setSecret(data.secret);
      if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(''); setEnabled(true); }
      if (action === 'verify') onDone();
      if (action === 'recover') Alert.alert('Récupération', 'Remplacez maintenant le facteur. Les accès administratifs restent bloqués.');
      if (action === 'revoke') onLogout();
    } catch (e) { Alert.alert('Seconde authentification', e instanceof Error ? e.message : 'Échec'); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
    <Card title="Seconde authentification">
      <Text>Utilisez une application d’authentification indépendante. Après confirmation, recommencez l’action interrompue.</Text>
      {codes.length ? <>
        <Text>Conservez ces dix codes de récupération hors du téléphone. Ils ne seront plus affichés.</Text>
        {codes.map((c) => <Text key={c} selectable>{c}</Text>)}
        <TouchableOpacity style={ui.retry} onPress={() => { setCodes([]); onDone(); }}><Text style={ui.retryText}>Codes conservés</Text></TouchableOpacity>
      </> : <>
        {!!secret && <><Text>Ajoutez manuellement cette clé dans votre application : ZupOne, TOTP, SHA1, 6 chiffres, 30 secondes.</Text><Text selectable>{secret}</Text></>}
        <TextInput accessibilityLabel="Code MFA" placeholder="Code TOTP ou récupération" autoCapitalize="none" autoCorrect={false} value={code} onChangeText={setCode} />
        <TouchableOpacity disabled={busy} style={ui.retry} onPress={() => act(secret ? 'confirm' : 'verify', { code })}><Text style={ui.retryText}>Confirmer le code TOTP</Text></TouchableOpacity>
        {enabled && !secret && <TouchableOpacity disabled={busy} style={ui.retry} onPress={() => act('recover', { code })}><Text style={ui.retryText}>Utiliser un code de récupération</Text></TouchableOpacity>}
        <TextInput accessibilityLabel="Mot de passe MFA" placeholder="Mot de passe actuel" secureTextEntry value={password} onChangeText={setPassword} />
        <TouchableOpacity disabled={busy} style={ui.retry} onPress={() => act('begin', { password })}><Text style={ui.retryText}>{enabled ? 'Remplacer le facteur' : 'Inscrire le facteur'}</Text></TouchableOpacity>
        {enabled && <TouchableOpacity disabled={busy} style={ui.retry} onPress={() => Alert.alert('Révoquer le facteur', 'Toutes les sessions seront fermées. Un nouvel enrôlement sera nécessaire.', [{ text: 'Annuler' }, { text: 'Révoquer', onPress: () => act('revoke', {}) }])}><Text style={ui.retryText}>Révoquer</Text></TouchableOpacity>}
      </>}
      <TouchableOpacity style={ui.retry} onPress={onLogout}><Text style={ui.retryText}>Se déconnecter</Text></TouchableOpacity>
    </Card>
  </ScrollView>;
}
