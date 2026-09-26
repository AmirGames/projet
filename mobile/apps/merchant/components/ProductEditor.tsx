import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiFetch } from '../lib/api';
import { COLORS } from './ui';

export interface EditableProduct {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  isAvailable: boolean;
  status?: string;
  category?: { id: string; name: string; displayOrder?: number } | null;
}

export interface Category {
  id: string;
  name: string;
}

const toCents = (v: unknown) => (parseFloat(String(v ?? 0)) || 0).toFixed(2).replace('.', ',');

/** Accepte « 12,50 », « 12.5 » ou « 12 ». */
function parsePrice(text: string) {
  const n = parseFloat(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function ProductEditor({
  product,
  categories,
  token,
  onClose,
  onSaved,
}: {
  product: EditableProduct;
  categories: Category[];
  token: string;
  onClose: () => void;
  onSaved: (product: EditableProduct) => void;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description || '');
  const [price, setPrice] = useState(toCents(product.price));
  const [categoryId, setCategoryId] = useState(product.category?.id || '');
  const [published, setPublished] = useState(product.status !== 'DRAFT' && product.status !== 'ARCHIVED');
  const [available, setAvailable] = useState(product.isAvailable);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const value = parsePrice(price);
    if (name.trim().length < 2) return Alert.alert('Nom trop court', 'Le nom doit faire au moins 2 caractères.');
    if (!(value > 0)) return Alert.alert('Prix invalide', 'Indiquez un prix supérieur à 0, par exemple 12,50.');

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        price: value,
        isAvailable: available,
        status: published ? 'ACTIVE' : 'DRAFT',
      };
      // Le serveur ignore une description vide : on n'envoie que du texte.
      if (description.trim()) body.description = description.trim();
      if (categoryId) body.categoryId = categoryId;

      const res = await apiFetch<{ product: EditableProduct }>(`/api/products/${product.id}`, token, {
        method: 'PUT',
        body,
      });
      onSaved({ ...product, ...res.product });
    } catch (e: any) {
      Alert.alert('Erreur', e.message || "Impossible d'enregistrer le produit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Modifier le produit</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={styles.label}>Nom</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={80} />

            <Text style={styles.label}>Prix (€)</Text>
            <TextInput
              style={[styles.input, styles.price]}
              value={price}
              onChangeText={setPrice}
              keyboardType="decimal-pad"
              maxLength={9}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Ingrédients, allergènes…"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={500}
            />

            {categories.length > 0 && (
              <>
                <Text style={styles.label}>Catégorie</Text>
                <View style={styles.chips}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.chip, categoryId === c.id && styles.chipOn]}
                      onPress={() => setCategoryId(c.id)}
                    >
                      <Text style={[styles.chipText, categoryId === c.id && styles.chipTextOn]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Disponible</Text>
                <Text style={styles.help}>Éteint : affiché « épuisé », impossible à commander.</Text>
              </View>
              <Switch value={available} onValueChange={setAvailable} trackColor={{ true: COLORS.success, false: '#ccc' }} />
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Visible sur la carte</Text>
                <Text style={styles.help}>Éteint : brouillon, invisible pour les clients.</Text>
              </View>
              <Switch value={published} onValueChange={setPublished} trackColor={{ true: COLORS.success, false: '#ccc' }} />
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.save} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Enregistrer</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.text },
  close: { fontSize: 20, color: '#666' },
  label: { fontSize: 12, fontWeight: '600', color: '#666', textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.text,
  },
  price: { fontSize: 20, fontWeight: '600', width: 140 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  help: { fontSize: 12, color: '#666', marginTop: 2 },
  save: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
