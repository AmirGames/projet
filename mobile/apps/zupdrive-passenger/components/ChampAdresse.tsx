import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adresseTrajet, rechercherAdresses, type SuggestionAdresse } from '../lib/adresses';
import type { AdresseFavorite, AdresseTrajet, TypeAdresseFavorite } from '../lib/courses';
import { COLORS } from './ui';

/**
 * Une adresse de trajet : on tape, le serveur suggère, on choisit. Seule une
 * suggestion située (coordonnées et code postal) est retenue ; modifier le
 * texte après l'avoir choisie annule le choix.
 */
export default function ChampAdresse({
  libelle,
  placeholder,
  choisie,
  onChoisir,
  desactive,
  favorites = [],
  onEnregistrer,
}: {
  libelle: string;
  placeholder: string;
  choisie: AdresseTrajet | null;
  onChoisir: (adresse: AdresseTrajet | null) => void;
  desactive?: boolean;
  /** Les adresses « Domicile » et « Travail » déjà enregistrées : un geste pour les choisir. */
  favorites?: AdresseFavorite[];
  /** Retient l'adresse choisie comme Domicile ou Travail. */
  onEnregistrer?: (type: TypeAdresseFavorite, adresse: AdresseTrajet) => void;
}) {
  const [saisie, setSaisie] = useState('');
  const [suggestionsBrutes, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [refus, setRefus] = useState(false);

  // Sans temporisation, chaque frappe interrogerait le service d'adresses.
  useEffect(() => {
    const q = saisie.trim();
    if (choisie || q.length < 3) return;
    let annule = false;
    const minuteur = setTimeout(async () => {
      setRecherche(true);
      try {
        const trouvees = await rechercherAdresses(q);
        if (!annule) setSuggestions(trouvees);
      } catch {
        if (!annule) setSuggestions([]);
      } finally {
        if (!annule) setRecherche(false);
      }
    }, 350);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [saisie, choisie]);
  // Adresse choisie, ou moins de trois caractères : aucune suggestion (dérivé, sans effet).
  const suggestions = choisie || saisie.trim().length < 3 ? [] : suggestionsBrutes;

  // Une adresse choisie hors du champ (raccourci Domicile/Travail) s'affiche dans le champ
  // (ajustement d'état pendant le rendu).
  const [choisieVue, setChoisieVue] = useState(choisie);
  if (choisie !== choisieVue) {
    setChoisieVue(choisie);
    if (choisie) setSaisie(choisie.adresse);
  }

  const modifier = (texte: string) => {
    setRefus(false);
    setSaisie(texte);
    if (choisie) onChoisir(null);
  };

  const choisir = (s: SuggestionAdresse) => {
    const adresse = adresseTrajet(s);
    if (!adresse) {
      setRefus(true);
      return;
    }
    setRefus(false);
    setSuggestions([]);
    setSaisie(adresse.adresse);
    onChoisir(adresse);
  };

  return (
    <View style={styles.bloc}>
      <Text style={styles.libelle}>{libelle}</Text>
      <TextInput
        value={saisie}
        onChangeText={modifier}
        placeholder={placeholder}
        editable={!desactive}
        autoCorrect={false}
        style={[styles.champ, choisie && styles.champChoisi]}
        accessibilityLabel={libelle}
      />
      {!choisie && favorites.length > 0 ? (
        <View style={styles.raccourcis}>
          {favorites.map((f) => (
            <TouchableOpacity
              key={f.type}
              style={styles.raccourci}
              onPress={() => onChoisir({ adresse: f.adresse, latitude: f.latitude, longitude: f.longitude, codePostal: f.codePostal })}
              disabled={desactive}
            >
              <Text style={styles.raccourciTexte}>{f.type === 'DOMICILE' ? '🏠 Domicile' : '💼 Travail'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {choisie && onEnregistrer ? (
        <View style={styles.raccourcis}>
          {(['DOMICILE', 'TRAVAIL'] as const).map((type) => {
            const deja = favorites.find((f) => f.type === type);
            const identique = !!deja && deja.latitude === choisie.latitude && deja.longitude === choisie.longitude;
            if (identique) return null;
            return (
              <TouchableOpacity key={type} onPress={() => onEnregistrer(type, choisie)} disabled={desactive}>
                <Text style={styles.enregistrer}>Enregistrer comme {type === 'DOMICILE' ? 'domicile' : 'travail'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {recherche ? <ActivityIndicator color={COLORS.primary} style={styles.attente} /> : null}
      {refus ? (
        <Text style={styles.refus}>
          Cette adresse n'a pas de position précise ou de code postal : choisissez-en une autre.
        </Text>
      ) : null}
      {suggestions.map((s, i) => (
        <TouchableOpacity key={`${s.label}-${i}`} style={styles.suggestion} onPress={() => choisir(s)}>
          <Text style={styles.suggestionTexte}>{s.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginBottom: 12 },
  libelle: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  champ: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  champChoisi: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  raccourcis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  raccourci: { backgroundColor: COLORS.primarySoft, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  raccourciTexte: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  enregistrer: { color: COLORS.primary, fontSize: 12, textDecorationLine: 'underline' },
  attente: { marginTop: 6 },
  refus: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
  suggestion: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  suggestionTexte: { fontSize: 14, color: COLORS.text },
});
