import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { storeBanner, storeLogo } from '../lib/stores';
import { visuelDeFamille } from '../lib/visuels';

/**
 * L'image par défaut d'un commerce sans photo : la couleur de sa famille, un
 * disque plus sombre pour le relief, et son emoji en grand et en écho (une
 * pizza pour une pizzeria). Elle remplit son parent, comme une photo.
 */
export function IllustrationFamille({ famille, grande = false }: { famille?: string | null; grande?: boolean }) {
  const { emoji, de, a } = visuelDeFamille(famille);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: a, overflow: 'hidden' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.disque, { backgroundColor: de }]} />
      <View style={styles.disqueClair} />
      <View style={styles.emojis}>
        <Text style={[styles.echo, { fontSize: grande ? 52 : 36, transform: [{ rotate: '-12deg' }] }]}>{emoji}</Text>
        <Text style={{ fontSize: grande ? 76 : 56 }}>{emoji}</Text>
        <Text style={[styles.echo, { fontSize: grande ? 52 : 36, transform: [{ rotate: '12deg' }] }]}>{emoji}</Text>
      </View>
    </View>
  );
}

/**
 * La grande image d'un commerce, comme sur le site : la photo de couverture
 * déposée par le commerçant, ou à défaut l'illustration de sa catégorie.
 *
 * Le logo se pose en pastille dans un coin ; sans logo, l'emoji de la
 * catégorie le remplace sur une photo, et l'illustration se suffit à
 * elle-même.
 *
 * Les enfants se posent par-dessus (étiquette « Livraison offerte », voile
 * « Fermé », cœur des favoris).
 */
export function CouvertureCommerce({
  store,
  hauteur,
  style,
  children,
}: {
  store: { name: string; famille?: string | null; settings?: { logo?: string | null; banner?: string | null } | null };
  hauteur: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const banniere = storeBanner(store);
  const logo = storeLogo(store);

  return (
    <View style={[styles.cadre, { height: hauteur }, style]}>
      {banniere ? (
        <Image source={{ uri: banniere }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : (
        <IllustrationFamille famille={store.famille} />
      )}
      {(logo || banniere) && (
        <View style={styles.pastille}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Text style={styles.emojiPastille}>{visuelDeFamille(store.famille).emoji}</Text>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#EEEEEE' },
  disque: { position: 'absolute', width: 220, height: 220, borderRadius: 110, left: -60, bottom: -110, opacity: 0.55 },
  disqueClair: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    right: -40,
    top: -60,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  emojis: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  echo: { opacity: 0.6 },
  pastille: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  logo: { width: 38, height: 38 },
  emojiPastille: { fontSize: 22 },
});
