'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { euro } from '@/lib/format';
import { jetonDeSuivi } from '@/lib/suivi-commande';

const cleStripe = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = cleStripe ? loadStripe(cleStripe) : null;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StripePaymentProps {
  orderId: string;
  amount: number;
  customerEmail: string;
  customerName: string;
  onPaymentComplete: (success: boolean) => void;
  /**
   * Appelé au clic sur « Payer », carte complète : le parent laisse au client
   * quelques secondes pour se raviser, puis appelle `payer`.
   */
  demanderConfirmation?: (payer: () => void) => void;
  /**
   * Crée l'intention à payer et rend son secret. Par défaut, celle de la
   * commande ; le pourboire après livraison passe sa propre route.
   */
  creerIntention?: () => Promise<string>;
  /**
   * Vrai par défaut : après le paiement, relève la commande ZupEat (`/api/payments/confirm`).
   * Faux pour un paiement qui n'est pas une commande (course ZupDrive) : seul le webhook confirme.
   */
  confirmerCommande?: boolean;
}

function StripePaymentForm({
  orderId,
  amount,
  customerEmail,
  customerName,
  onPaymentComplete,
  demanderConfirmation,
  creerIntention,
  confirmerCommande = true,
}: StripePaymentProps) {
  const t = useTranslations('stripePayment');
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Stripe dit ce qui manque (code postal, date…) : autant le montrer avant le
  // délai de repentir plutôt qu'après.
  const [carteErreur, setCarteErreur] = useState('');
  const [carteComplete, setCarteComplete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demanderConfirmation) {
      void handlePayment();
      return;
    }
    if (!carteComplete) {
      setError(carteErreur || t('carteIncomplete'));
      return;
    }
    setError('');
    demanderConfirmation(() => void handlePayment());
  };

  const handlePayment = async () => {
    if (!stripe || !elements) {
      setError(t('stripeNotLoaded'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      let clientSecret: string;
      if (creerIntention) {
        clientSecret = await creerIntention();
      } else {
        // Le serveur lit le montant sur la commande : seul son identifiant part.
        const intentResponse = await fetch(`${API_URL}/api/payments/intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Le jeton de suivi, gardé à la création, prouve que la commande est la nôtre.
          body: JSON.stringify({ orderId, trackingToken: jetonDeSuivi(orderId) || undefined }),
        });

        if (!intentResponse.ok) {
          throw new Error(t('intentFailed'));
        }

        clientSecret = (await intentResponse.json()).clientSecret;
      }

      // Confirm payment with Stripe
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error(t('cardNotFound'));

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: customerName,
            email: customerEmail,
          },
        },
      });

      if (result.error) {
        setError(result.error.message || t('paymentFailed'));
        onPaymentComplete(false);
      } else if (result.paymentIntent?.status === 'succeeded') {
        // Le webhook fait foi, mais il peut arriver après : ce relevé transmet
        // la commande au commerçant sans l'attendre. Son échec n'y change rien.
        if (confirmerCommande) {
          await fetch(`${API_URL}/api/payments/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              paymentIntentId: result.paymentIntent.id,
              trackingToken: jetonDeSuivi(orderId) || undefined,
            }),
          }).catch(() => undefined);
        }
        onPaymentComplete(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'));
      onPaymentComplete(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-gray-100 p-4 rounded-lg">
        <CardElement
          onChange={(ev) => {
            setCarteComplete(ev.complete);
            setCarteErreur(ev.error?.message || '');
          }}
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#111827',
                '::placeholder': {
                  color: '#6b7280',
                },
              },
              invalid: {
                color: '#b91c1c',
              },
            },
          }}
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition"
      >
        {loading ? t('loading') : t('payButton', { amount: euro(amount) })}
      </button>
    </form>
  );
}

export function StripePayment(props: StripePaymentProps) {
  const t = useTranslations('stripePayment');
  if (!stripePromise) {
    return (
      <p className="text-red-600 text-sm">
        {t('nonConfigure')}
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm {...props} />
    </Elements>
  );
}

