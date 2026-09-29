import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiFetch } from '../lib/api';
import { COLORS } from './ui';

interface Choice {
  id?: string;
  label: string;
  /** Texte saisi, converti à l'envoi. */
  price: string;
  isAvailable: boolean;
}

interface Group {
  name: string;
  isRequired: boolean;
  /** Vide : sans limite. */
  maxChoices: string;
  choices: Choice[];
}

const emptyGroup = (name: string): Group => ({
  name,
  isRequired: false,
  maxChoices: '',
  choices: [{ label: '', price: '', isAvailable: true }],
});

const fromServer = (data: any[]): Group[] =>
  (data || []).map((g) => ({
    name: g.name,
    isRequired: Boolean(g.isRequired),
    maxChoices: g.maxChoices == null ? '' : String(g.maxChoices),
    choices: (g.choices || []).map((c: any) => ({
      id: c.id,
      label: c.label,
      price: String(c.price ?? 0).replace('.', ','),
      isAvailable: c.isAvailable !== false,
    })),
  }));

/**
 * Les suppléments payants d'un plat (bacon +1,50 €, sauce offerte), comme
 * `SupplementsProduit` du site : des groupes, chacun avec ses choix à prix
 * fixe, obligatoire ou non, plafonné ou non. Le prix se saisit comme celui
 * du plat (hors taxe si la boutique travaille hors taxe).
 */
export default function SupplementsEditor({ productId, token }: { productId: string; token: string }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [saved, setSaved] = useState('[]');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: any[] }>(`/api/products/${productId}/supplements`, token);
      const read = fromServer(res.data);
      setGroups(read);
      setSaved(JSON.stringify(read));
    } catch {
      // Le compteur restera à zéro : ce n'est pas bloquant.
    }
  }, [productId, token]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(groups) !== saved;

  const changeGroup = (gi: number, patch: Partial<Group>) =>
    setGroups((all) => all.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  const changeChoice = (gi: number, ci: number, patch: Partial<Choice>) =>
    setGroups((all) =>
      all.map((g, i) => (i === gi ? { ...g, choices: g.choices.map((c, j) => (j === ci ? { ...c, ...patch } : c)) } : g))
    );

  const save = async () => {
    setError('');
    // Les lignes laissées vides ne partent pas : un groupe ajouté par erreur
    // ne bloque pas l'enregistrement du reste.
    const body = groups
      .map((g) => ({
        name: g.name.trim(),
        isRequired: g.isRequired,
        maxChoices: g.maxChoices.trim() === '' ? null : Number(g.maxChoices),
        choices: g.choices
          .filter((c) => c.label.trim() !== '')
          .map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            label: c.label.trim(),
            price: c.price.trim() === '' ? 0 : Number(c.price.replace(',', '.')),
            isAvailable: c.isAvailable,
          })),
      }))
      .filter((g) => g.name !== '' || g.choices.length > 0);

    if (body.some((g) => g.choices.some((c) => !Number.isFinite(c.price) || c.price < 0))) {
      return setError('Un prix de supplément doit être un nombre positif, par exemple 1,50.');
    }
    if (body.some((g) => g.maxChoices != null && !(Number.isInteger(g.maxChoices) && g.maxChoices >= 1))) {
      return setError('Le nombre de choix maximum doit être un entier d’au moins 1.');
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ data: any[] }>(`/api/products/${productId}/supplements`, token, {
        method: 'PUT',
        body: { groupes: body },
      });
      const read = fromServer(res.data);
      setGroups(read);
      setSaved(JSON.stringify(read));
      Alert.alert('Suppléments', 'Suppléments enregistrés.');
    } catch (e: any) {
      setError(e.message || 'Impossible d’enregistrer les suppléments');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.label}>Suppléments</Text>
      <Text style={styles.help}>Bacon +1,50 €, sauce au choix… Le client les coche avant d’ajouter le plat.</Text>

      {groups.map((g, gi) => (
        <View key={gi} style={styles.group}>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Nom du groupe (Suppléments, Sauce…)"
              placeholderTextColor={COLORS.muted}
              value={g.name}
              onChangeText={(name) => changeGroup(gi, { name })}
              maxLength={60}
            />
            <TouchableOpacity onPress={() => setGroups((all) => all.filter((_, i) => i !== gi))} hitSlop={8}>
              <Text style={styles.remove}>🗑</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.row, { marginTop: 8 }]}>
            <Text style={styles.small}>Choix max.</Text>
            <TextInput
              style={[styles.input, { width: 64, textAlign: 'center' }]}
              placeholder="∞"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
              value={g.maxChoices}
              onChangeText={(maxChoices) => changeGroup(gi, { maxChoices: maxChoices.replace(/\D/g, '') })}
              maxLength={2}
            />
            <View style={{ flex: 1 }} />
            <Text style={styles.small}>Obligatoire</Text>
            <Switch value={g.isRequired} onValueChange={(isRequired) => changeGroup(gi, { isRequired })} trackColor={{ true: COLORS.success, false: '#ccc' }} />
          </View>

          {g.choices.map((c, ci) => (
            <View key={ci} style={[styles.row, { marginTop: 8 }]}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Choix (bacon…)"
                placeholderTextColor={COLORS.muted}
                value={c.label}
                onChangeText={(label) => changeChoice(gi, ci, { label })}
                maxLength={60}
              />
              <TextInput
                style={[styles.input, { width: 72, textAlign: 'right' }]}
                placeholder="0,00"
                placeholderTextColor={COLORS.muted}
                keyboardType="decimal-pad"
                value={c.price}
                onChangeText={(price) => changeChoice(gi, ci, { price })}
                maxLength={7}
              />
              <Text style={styles.small}>€</Text>
              <Switch
                value={c.isAvailable}
                onValueChange={(isAvailable) => changeChoice(gi, ci, { isAvailable })}
                trackColor={{ true: COLORS.success, false: '#ccc' }}
              />
              <TouchableOpacity
                onPress={() => changeGroup(gi, { choices: g.choices.filter((_, j) => j !== ci) })}
                hitSlop={8}
              >
                <Text style={styles.remove}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {g.choices.length < 50 && (
            <TouchableOpacity onPress={() => changeGroup(gi, { choices: [...g.choices, { label: '', price: '', isAvailable: true }] })}>
              <Text style={styles.link}>+ Ajouter un choix</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {groups.length < 10 && (
        <TouchableOpacity onPress={() => setGroups((all) => [...all, emptyGroup(all.length === 0 ? 'Suppléments' : '')])}>
          <Text style={styles.link}>+ Ajouter un groupe</Text>
        </TouchableOpacity>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {dirty && (
        <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Enregistrer les suppléments</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase', marginTop: 20, marginBottom: 4 },
  help: { fontSize: 12, color: '#666', marginBottom: 8 },
  group: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 10, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    color: COLORS.text,
  },
  small: { fontSize: 13, color: COLORS.text },
  remove: { fontSize: 18, color: COLORS.danger, paddingHorizontal: 4 },
  link: { color: COLORS.primary, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
  save: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
