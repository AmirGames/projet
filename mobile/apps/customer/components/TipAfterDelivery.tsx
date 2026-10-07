import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { apiFetch, formatEuros } from '../lib/api';
import { COLORS } from './ui';

interface Situation {
  possible: boolean;
  livreur: string | null;
  montantArticles: number;
  minimum: number;
  maximum: number;
  donne: { montant: number; quand: 'COMMANDE' | 'APRES_LIVRAISON' } | null;
}

/** Les montants proposés d'un clic, dans les bornes du serveur. */
const PRESETS = [1, 2, 3, 5];

/**
 * « Votre commande est arrivée. Laisser un pourboire à Karim ? »
 *
 * Proposé une fois la commande livrée par un livreur de la plateforme, si le
 * client n'a rien laissé en commandant (`PourboireApresLivraison` du site).
 * C'est un paiement à part, par carte ; il revient en entier au livreur.
 * Rien ne s'affiche quand il n'y a rien à proposer, ni à remercier.
 */
export default function TipAfterDelivery({ orderId, token, refreshKey }: { orderId: string; token: string; refreshKey?: string }) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ data: { enLigne: boolean; publishableKey: string | null } }>('/api/payments/config', null)
      .then((res) => setPublishableKey(res.data.enLigne ? res.data.publishableKey : null))
      .catch(() => setPublishableKey(null));
  }, []);

  if (!publishableKey) return null;
  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier="merchant.com.amir_games.zupeatcustomer"
      urlScheme="zupeat-customer"
    >
      <TipCard orderId={orderId} token={token} refreshKey={refreshKey} />
    </StripeProvider>
  );
}

function TipCard({ orderId, token, refreshKey }: { orderId: string; token: string; refreshKey?: string }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [situation, setSituation] = useState<Situation | null>(null);
  const [amount, setAmount] = useState(0);
  const [paying, setPaying] = useState(false);
  const [thanks, setThanks] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch<{ data: Situation }>(`/api/orders/${orderId}/pourboire`, token)
      .then((res) => {
        setSituation(res.data);
        setAmount((a) => a || Math.min(res.data.maximum, Math.max(res.data.minimum, Math.round(res.data.montantArticles * 0.1))));
      })
      .catch(() => setSituation(null));
  }, [orderId, token]);

  useEffect(load, [load, refreshKey]);

  if (!situation) return null;
  const name = situation.livreur || 'votre livreur';

  // Déjà donné après la livraison : on remercie. Donné en commandant, le total le montre déjà.
  const given = thanks ?? (situation.donne?.quand === 'APRES_LIVRAISON' ? situation.donne.montant : null);
  if (given != null) {
    return (
      <View style={[styles.card, styles.thanks]}>
        <Text style={styles.thanksText}>
          ❤️ Merci ! {formatEuros(given)} de pourboire pour {name}. Il le recevra avec son prochain versement.
        </Text>
      </View>
    );
  }
  if (!situation.possible) return null;

  const valid = amount >= situation.minimum && amount <= situation.maximum;

  const pay = async () => {
    setError('');
    setPaying(true);
    try {
      const intent = await apiFetch<{ clientSecret: string }>(`/api/orders/${orderId}/pourboire`, token, {
        method: 'POST',
        body: { montant: amount },
      });
      const init = await initPaymentSheet({
        paymentIntentClientSecret: intent.clientSecret,
        merchantDisplayName: 'ZupEat',
        returnURL: 'zupeat-customer://stripe-redirect',
      });
      if (init.error) {
        setError(init.error.message);
        return;
      }
      const result = await presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== 'Canceled') setError(result.error.message);
        return;
      }
      setThanks(amount);
    } catch (e: any) {
      setError(e.message || 'Le pourboire ne peut pas être payé pour le moment.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>❤️ Votre commande est arrivée. Laisser un pourboire à {name} ?</Text>
      <Text style={styles.help}>Il revient en entier à {name}.</Text>
      <View style={styles.chips}>
        {PRESETS.filter((p) => p >= situation.minimum && p <= situation.maximum).map((p) => (
          <TouchableOpacity key={p} style={[styles.chip, amount === p && styles.chipActive]} onPress={() => setAmount(p)}>
            <Text style={[styles.chipText, amount === p && styles.chipTextActive]}>{formatEuros(p)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.button, (!valid || paying) && { opacity: 0.5 }]} disabled={!valid || paying} onPress={pay}>
        {paying ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {valid ? `Laisser ${formatEuros(amount)}` : `Entre ${formatEuros(situation.minimum)} et ${formatEuros(situation.maximum)}`}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 10, padding: 14, marginBottom: 12 },
  thanks: { backgroundColor: '#E8F5E9' },
  thanksText: { color: '#1B5E20', fontSize: 14, lineHeight: 20 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  help: { fontSize: 13, color: '#666', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 14, color: COLORS.text },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: COLORS.danger, fontSize: 13, marginBottom: 8 },
  button: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
