'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { euro } from '@/lib/format';

const cleStripe = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = cleStripe ? loadStripe(cleStripe) : null;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface StripePaymentProps {
  orderId: string;
  amount: number;
  customerEmail: string;
  customerName: string;
  onPaymentComplete: (success: boolean) => void;
}

function StripePaymentForm({ orderId, amount, customerEmail, customerName, onPaymentComplete }: StripePaymentProps) {
  const t = useTranslations('stripePayment');
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError(t('stripeNotLoaded'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Le serveur lit le montant sur la commande : seul son identifiant part.
      const intentResponse = await fetch(`${API_URL}/api/payments/intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });

      if (!intentResponse.ok) {
        throw new Error(t('intentFailed'));
      }

      const { clientSecret } = await intentResponse.json();

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
        await fetch(`${API_URL}/api/payments/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: result.paymentIntent.id }),
        }).catch(() => undefined);
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
    <form onSubmit={handlePayment} className="space-y-4">
      <div className="bg-gray-700 p-4 rounded-lg">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#fff',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#fa755a',
              },
            },
          }}
        />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition"
      >
        {loading ? t('loading') : t('payButton', { amount: euro(amount) })}
      </button>
    </form>
  );
}

export function StripePayment(props: StripePaymentProps) {
  if (!stripePromise) {
    return (
      <p className="text-red-400 text-sm">
        Le paiement par carte n&apos;est pas configuré (clé publique Stripe manquante).
      </p>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm {...props} />
    </Elements>
  );
}

