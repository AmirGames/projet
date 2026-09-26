import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { apiFetch } from '../../lib/api';
import type { DeliveryAddress } from '../../lib/session';
import { COLORS, ScreenHeader } from '../ui';

interface Suggestion {
  label: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode?: string;
  latitude: number | null;
  longitude: number | null;
}

const toAddress = (s: Suggestion): DeliveryAddress => ({
  label: s.label,
  street: s.street,
  city: s.city,
  postalCode: s.postalCode,
  latitude: s.latitude,
  longitude: s.longitude,
});

/**
 * L'adresse de livraison : suggestions du serveur (BAN, Photon…), ou la
 * position du téléphone. Retenir une suggestion donne les coordonnées exactes,
 * qui décident des commerces proposés et des frais de livraison.
 */
export default function AddressScreen({
  current,
  onBack,
  onSave,
}: {
  current: DeliveryAddress | null;
  onBack: () => void;
  onSave: (address: DeliveryAddress) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState<{ lat: number; lon: number } | null>(
    current?.latitude != null && current?.longitude != null ? { lat: current.latitude, lon: current.longitude } : null
  );

  // Sans temporisation, chaque frappe interrogerait le service d'adresses.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const near = hint ? `&lat=${hint.lat}&lon=${hint.lon}` : '';
        const res = await apiFetch<{ suggestions: Suggestion[] }>(
          `/api/addresses/search?q=${encodeURIComponent(q)}&limit=6${near}`,
          null
        );
        if (!cancelled) setSuggestions(res.suggestions || []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, hint]);

  const useMyPosition = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Localisation', 'Autorisez la localisation dans les réglages du téléphone, ou saisissez votre adresse.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      setHint({ lat: latitude, lon: longitude });
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const street = [place?.streetNumber, place?.street].filter(Boolean).join(' ') || place?.name || '';
      const city = place?.city || place?.subregion || '';
      const postalCode = place?.postalCode || '';
      if (!street || !city) {
        Alert.alert('Adresse introuvable', 'Votre position est retenue pour les suggestions : saisissez le début de votre adresse.');
        return;
      }
      onSave({
        label: [street, [postalCode, city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        street,
        city,
        postalCode,
        latitude,
        longitude,
      });
    } catch {
      Alert.alert('Localisation', 'Votre position n’a pas pu être trouvée. Saisissez votre adresse.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Adresse de livraison 📍" onBack={onBack} />
      <View style={styles.content}>
        {current ? (
          <View style={styles.current}>
            <Text style={styles.currentLabel}>Adresse actuelle</Text>
            <Text style={styles.currentText}>{current.label}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.locate} onPress={useMyPosition} disabled={locating}>
          {locating ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.locateText}>🎯 Utiliser ma position</Text>}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Numéro, rue, ville…"
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoFocus={!current}
          autoCorrect={false}
        />
        {searching && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 8 }} />}

        <FlatList
          data={suggestions}
          keyExtractor={(s, i) => `${s.label}-${i}`}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            query.trim().length >= 3 && !searching ? (
              <Text style={styles.empty}>Aucune adresse trouvée. Essayez avec le code postal ou la ville.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.suggestion} onPress={() => onSave(toAddress(item))}>
              <Text style={styles.suggestionText}>📍 {item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: 12 },
  current: { backgroundColor: COLORS.card, borderRadius: 10, padding: 12, marginBottom: 10 },
  currentLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600', textTransform: 'uppercase' },
  currentText: { fontSize: 15, color: COLORS.text, fontWeight: '600', marginTop: 2 },
  locate: { backgroundColor: COLORS.card, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  locateText: { color: COLORS.primary, fontWeight: '700', fontSize: 15 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  suggestion: { backgroundColor: COLORS.card, borderRadius: 8, padding: 12, marginTop: 8 },
  suggestionText: { fontSize: 15, color: COLORS.text },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 20 },
});
