import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { COLORS } from './ui';

/** Sur le web, le formulaire Stripe natif n'existe pas : le paiement se fait depuis le site ZupDrive. */
export default function PaiementCarte(_props: { token: string; courseId: string; prixCentimes: number; onEnvoye: () => void }) {
  return <Text style={styles.texte}>Le paiement par carte se fait depuis l'application mobile ou le site ZupDrive.</Text>;
}

const styles = StyleSheet.create({ texte: { color: COLORS.text, fontSize: 14 } });
