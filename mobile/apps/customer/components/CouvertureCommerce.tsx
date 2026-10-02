import React from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { storeBanner, storeLogo } from '../lib/stores';
import { COLORS } from './ui';

/**
 * La grande image d'un commerce, comme sur le site : la photo de couverture
 * déposée par le commerçant, avec son logo en pastille dans un coin.
 *
 * Sans photo, un aplat orange pâle met le logo au centre (ou l'initiale du
 * commerce, à défaut de logo) : la carte garde sa taille et la liste son
 * rythme.
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
  store: { name: string; settings?: { logo?: string | null; banner?: string | null } | null };
  hauteur: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const banniere = storeBanner(store);
  const logo = storeLogo(store);
  const initiale = store.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View style={[styles.cadre, { height: hauteur }, style]}>
      {banniere ? (
        <>
          <Image source={{ uri: banniere }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          <View style={[styles.pastille, styles.pastilleCoin]}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.logoPetit} resizeMode="contain" />
            ) : (
              <Text style={styles.initialePetite}>{initiale}</Text>
            )}
          </View>
        </>
      ) : (
        <View style={styles.centre}>
          <View style={[styles.pastille, styles.pastilleGrande]}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.logoGrand} resizeMode="contain" />
            ) : (
              <Text style={styles.initialeGrande}>{initiale}</Text>
            )}
          </View>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.primarySoft },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pastille: {
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
  pastilleCoin: { position: 'absolute', left: 10, bottom: 10, width: 44, height: 44, borderRadius: 12 },
  pastilleGrande: { width: 72, height: 72, borderRadius: 18 },
  logoPetit: { width: 38, height: 38 },
  logoGrand: { width: 62, height: 62 },
  initialePetite: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  initialeGrande: { fontSize: 32, fontWeight: '800', color: COLORS.primary },
});
