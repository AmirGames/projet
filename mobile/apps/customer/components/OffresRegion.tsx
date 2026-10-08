import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiFetch, formatEuros } from '../lib/api';
import { COLORS } from './ui';

interface PromotionRegion {
  code: string;
  description?: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string | number;
  minOrderAmount?: string | number | null;
  store: { id: string; name: string; slug: string; city?: string | null };
}

interface Tendance {
  cuisineType: string;
  libelle: string;
  commandes: number;
}

interface Suggestion {
  id: string;
  name: string;
  city?: string | null;
  cuisineLibelle?: string | null;
  rating: number;
  dejaCommande: boolean;
}

const remise = (p: PromotionRegion) =>
  p.type === 'PERCENTAGE' ? `-${Number(p.discountValue)} %` : `-${formatEuros(p.discountValue)}`;

/**
 * Promotions en cours, cuisines les plus commandées et suggestions pour le
 * compte connecté. Rien ne suit l'appareil : le serveur agrège les tendances
 * (seuil d'acheteurs) et ne calcule les suggestions que pour ce compte, qui
 * peut les couper depuis « Mon compte ». Une section sans contenu disparaît.
 */
export default function OffresRegion({
  token,
  ville,
  onOpenStore,
}: {
  token: string;
  ville?: string;
  onOpenStore: (storeId: string) => void;
}) {
  const [promotions, setPromotions] = useState<PromotionRegion[]>([]);
  const [tendances, setTendances] = useState<Tendance[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    let actif = true;
    const filtre = ville ? `?ville=${encodeURIComponent(ville)}` : '';
    apiFetch<{ data: PromotionRegion[] }>(`/api/client/promotions-region${filtre}`, null)
      .then((res) => actif && setPromotions(res.data || []))
      .catch(() => undefined);
    apiFetch<{ data: Tendance[] }>(`/api/client/tendances${filtre}`, null)
      .then((res) => actif && setTendances(res.data || []))
      .catch(() => undefined);
    if (token) {
      apiFetch<{ data: { boutiques: Suggestion[] } }>('/api/client/me/recommandations', token)
        .then((res) => actif && setSuggestions(res.data?.boutiques || []))
        .catch(() => undefined);
    }
    return () => {
      actif = false;
    };
  }, [token, ville]);

  if (promotions.length === 0 && tendances.length === 0 && suggestions.length === 0) return null;

  return (
    <View style={styles.bloc}>
      {suggestions.length > 0 && (
        <View>
          <Text style={styles.titre}>✨ Pour vous</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangee}>
            {suggestions.map((s) => (
              <TouchableOpacity key={s.id} style={styles.carte} onPress={() => onOpenStore(s.id)} activeOpacity={0.85}>
                <Text style={styles.nom} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[s.cuisineLibelle, s.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.meta}>
                  ⭐ {s.rating.toFixed(1)}
                  {s.dejaCommande ? ' · Déjà commandé' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {promotions.length > 0 && (
        <View>
          <Text style={styles.titre}>🏷️ Promotions près de chez vous</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangee}>
            {promotions.map((p) => (
              <TouchableOpacity
                key={`${p.store.id}-${p.code}`}
                style={styles.carte}
                onPress={() => onOpenStore(p.store.id)}
                activeOpacity={0.85}
              >
                <View style={styles.ligne}>
                  <Text style={[styles.nom, { flex: 1 }]} numberOfLines={1}>
                    {p.store.name}
                  </Text>
                  <Text style={styles.remise}>{remise(p)}</Text>
                </View>
                {p.description ? (
                  <Text style={styles.meta} numberOfLines={2}>
                    {p.description}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  Code <Text style={styles.code}>{p.code}</Text>
                </Text>
                {p.minOrderAmount && Number(p.minOrderAmount) > 0 ? (
                  <Text style={styles.meta}>Dès {formatEuros(p.minOrderAmount)} d'achat</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {tendances.length > 0 && (
        <View>
          <Text style={styles.titre}>🔥 Ce que commande votre région</Text>
          <View style={[styles.rangee, styles.pastilles]}>
            {tendances.map((t) => (
              <View key={t.cuisineType} style={styles.pastille}>
                <Text style={styles.pastilleText}>
                  {t.libelle} · {t.commandes} commande{t.commandes > 1 ? 's' : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: 14, marginBottom: 14 },
  titre: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  rangee: { gap: 10 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap' },
  carte: {
    width: 220,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    gap: 4,
  },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nom: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 13, color: COLORS.muted },
  remise: {
    backgroundColor: COLORS.primary,
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  code: { fontWeight: '700', color: COLORS.text },
  pastille: {
    backgroundColor: COLORS.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pastilleText: { fontSize: 13, color: COLORS.text },
});
