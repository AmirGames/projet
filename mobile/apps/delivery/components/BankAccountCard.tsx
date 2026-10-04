import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../lib/api';
import { Card, COLORS, Row, themedStyles } from './ui';

export interface CompteBancaire {
  ibanFin: string;
  titulaire?: string | null;
  valide: boolean;
}

/**
 * Le compte où le livreur reçoit ses versements du lundi.
 *
 * Sans IBAN, ses courses sont bien comptées, mais il est écarté du virement
 * groupé : la plateforme ne peut pas le payer.
 */
export default function BankAccountCard({
  token,
  compte,
  onSaved,
}: {
  token: string;
  compte?: CompteBancaire | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!compte);
  const [iban, setIban] = useState('');
  const [titulaire, setTitulaire] = useState(compte?.titulaire || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/drivers/me/bank-account', token, {
        method: 'PUT',
        body: { iban, accountHolder: titulaire },
      });
      setEditing(false);
      setIban('');
      onSaved();
    } catch (e: any) {
      setError(e.message || "Impossible d'enregistrer le compte");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Mes versements">
      <Text style={styles.help}>Vos gains de la semaine sont virés chaque lundi sur ce compte.</Text>
      {!editing && compte ? (
        <>
          <Row label="Compte" value={`…${compte.ibanFin}`} />
          <Row label="Titulaire" value={compte.titulaire || '—'} last={compte.valide} />
          {!compte.valide && <Text style={styles.error}>Cet IBAN n&apos;est pas valide : corrigez-le pour être payé.</Text>}
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={styles.link}>Modifier</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View>
          <TextInput
            style={styles.input}
            placeholder="IBAN (BE68 5390 0754 7034)"
            placeholderTextColor={COLORS.muted}
            autoCapitalize="characters"
            value={iban}
            onChangeText={setIban}
          />
          <TextInput
            style={styles.input}
            placeholder="Titulaire du compte"
            placeholderTextColor={COLORS.muted}
            value={titulaire}
            onChangeText={setTitulaire}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.button, (!iban || !titulaire) && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving || !iban || !titulaire}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      )}
    </Card>
  );
}

const styles = themedStyles(() => ({
  help: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
  link: { color: COLORS.header, fontWeight: '700' as const, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    color: COLORS.text,
  },
  button: { backgroundColor: COLORS.header, borderRadius: 8, padding: 12, alignItems: 'center' as const, marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' as const },
}));
