import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CardField, StripeProvider, useConfirmPayment } from '@stripe/stripe-react-native';
import { messageErreur } from '../lib/auth';
import { creerIntentionPaiement, lireClePubliqueStripe, prix } from '../lib/courses';
import { COLORS } from './ui';

/**
 * Le formulaire de carte d'un trajet. La carte part directement chez Stripe ;
 * le serveur lit le prix sur la course (seul `courseId` lui est envoyé). Quand
 * Stripe accepte la carte, le trajet n'est pas « payé » pour autant : il ne le
 * devient que quand le serveur le dit, après le webhook Stripe.
 *
 * Stripe est natif uniquement : `PaiementCarte.web.tsx` remplace ce fichier sur le web.
 */
export default function PaiementCarte(props: { token: string; courseId: string; prixCentimes: number; onEnvoye: () => void }) {
  const [cle, setCle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let vivant = true;
    lireClePubliqueStripe()
      .then((k) => vivant && setCle(k))
      .catch(() => vivant && setCle(null));
    return () => {
      vivant = false;
    };
  }, []);

  if (cle === undefined) return <ActivityIndicator color={COLORS.primary} />;
  if (!cle) return <Text style={styles.texte}>Le paiement en ligne n'est pas disponible pour le moment. Réessayez plus tard.</Text>;

  return (
    <StripeProvider publishableKey={cle} merchantIdentifier="merchant.com.amir_games.zupdrive_passenger" urlScheme="zupdrive-passenger">
      <Formulaire {...props} />
    </StripeProvider>
  );
}

function Formulaire({ token, courseId, prixCentimes, onEnvoye }: { token: string; courseId: string; prixCentimes: number; onEnvoye: () => void }) {
  const { confirmPayment } = useConfirmPayment();
  const [complete, setComplete] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const payer = async () => {
    if (envoi || !complete) return;
    setEnvoi(true);
    setErreur('');
    try {
      const clientSecret = await creerIntentionPaiement(token, courseId);
      const { error } = await confirmPayment(clientSecret, { paymentMethodType: 'Card' });
      if (error) {
        setErreur(error.message || 'Paiement refusé. Vérifiez votre carte.');
        setEnvoi(false);
        return;
      }
      // Carte acceptée par Stripe : la confirmation vient du serveur (relecture du suivi).
      onEnvoye();
    } catch (e) {
      setErreur(messageErreur(e));
      setEnvoi(false);
    }
  };

  return (
    <View>
      <CardField
        postalCodeEnabled={false}
        placeholders={{ number: '4242 4242 4242 4242' }}
        style={styles.carte}
        onCardChange={(d) => setComplete(d.complete)}
      />
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
      <TouchableOpacity style={[styles.bouton, (!complete || envoi) && styles.boutonOff]} onPress={payer} disabled={!complete || envoi}>
        {envoi ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Payer {prix(prixCentimes)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  texte: { color: COLORS.text, fontSize: 14 },
  carte: { height: 50, marginVertical: 8 },
  erreur: { color: COLORS.danger, fontSize: 13, marginBottom: 4 },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  boutonOff: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
