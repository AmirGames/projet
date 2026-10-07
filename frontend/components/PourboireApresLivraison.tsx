'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';

import { ChoixPourboire, montantDuPourcentage } from '@/components/ChoixPourboire';
import { StripePayment } from '@/components/stripe-payment';
import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { cheminCommande, jetonDeSuivi } from '@/lib/suivi-commande';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** La session du client, quand il est connecté : avec le jeton de suivi, elle ouvre la commande. */
function entetesSession(): Record<string, string> {
  try {
    const session = localStorage.getItem('accessToken');
    return session ? { Authorization: `Bearer ${session}` } : {};
  } catch {
    return {};
  }
}

interface Situation {
  possible: boolean;
  raison?: string;
  livreur: string | null;
  montantArticles: number;
  minimum: number;
  maximum: number;
  donne: { montant: number; quand: 'COMMANDE' | 'APRES_LIVRAISON' } | null;
}

/**
 * « Votre commande est arrivée. Laisser un pourboire à Karim ? »
 *
 * Proposé sur le suivi une fois la commande livrée par un livreur de la
 * plateforme, si le client n'a rien laissé en commandant. C'est un paiement à
 * part, par carte ; le pourboire revient en entier au livreur, avec son
 * prochain relevé. Rien ne s'affiche quand il n'y a rien à proposer, ni à
 * remercier.
 */
export function PourboireApresLivraison({
  orderId,
  customerEmail,
  customerName,
  /** Change quand la commande est relue : la carte se relit avec elle. */
  cle,
}: {
  orderId: string;
  customerEmail?: string;
  customerName?: string;
  cle?: string;
}) {
  const t = useTranslations('pourboireApresLivraison');
  const [situation, setSituation] = useState<Situation | null>(null);
  const [montant, setMontant] = useState(0);
  const [aPayer, setAPayer] = useState(false);
  const [merci, setMerci] = useState<number | null>(null);

  useEffectChargement(() => {
    if (!orderId) return;
    fetch(`${API_URL}${cheminCommande(orderId, jetonDeSuivi(orderId), '/pourboire')}`, { headers: entetesSession() })
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        const lue: Situation | null = donnees?.data || null;
        setSituation(lue);
        if (lue) setMontant(montantDuPourcentage(lue.montantArticles, 10));
      })
      .catch(() => undefined);
  }, [orderId, cle]);

  if (!situation) return null;

  const nom = situation.livreur || t('votreLivreur');

  // Déjà donné après la livraison : on remercie. Donné en commandant, le
  // récapitulatif du total le montre déjà.
  const donneApres = merci ?? (situation.donne?.quand === 'APRES_LIVRAISON' ? situation.donne.montant : null);
  if (donneApres != null) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
        <Heart className="text-green-600 fill-green-400 shrink-0" size={20} />
        <p className="text-green-800 text-sm">
          {t('merci', { montant: euro(donneApres), nom })}
        </p>
      </div>
    );
  }

  if (!situation.possible) return null;

  const montantValide = montant >= situation.minimum && montant <= situation.maximum;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Heart className="text-red-600" size={20} />
          {t('question', { nom })}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{t('enEntier', { nom })}</p>
      </div>

      {!aPayer ? (
        <>
          <ChoixPourboire base={situation.montantArticles} onChange={setMontant} sansAucun />
          <button
            type="button"
            disabled={!montantValide}
            onClick={() => setAPayer(true)}
            className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-white transition"
          >
            {montantValide
              ? t('laisser', { montant: euro(montant) })
              : t('entre', { minimum: euro(situation.minimum), maximum: euro(situation.maximum) })}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>{t('pourboirePour', { nom })}</span>
            <button type="button" onClick={() => setAPayer(false)} className="text-red-600 hover:text-red-700 underline">
              {t('modifier', { montant: euro(montant) })}
            </button>
          </div>
          <StripePayment
            orderId={orderId}
            amount={montant}
            customerEmail={customerEmail || ''}
            customerName={customerName || ''}
            creerIntention={async () => {
              const reponse = await fetch(`${API_URL}${cheminCommande(orderId, jetonDeSuivi(orderId), '/pourboire')}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...entetesSession() },
                body: JSON.stringify({ montant }),
              });
              const corps = await reponse.json().catch(() => null);
              if (!reponse.ok || !corps?.clientSecret) {
                throw new Error(corps?.error || t('impossible'));
              }
              return corps.clientSecret as string;
            }}
            onPaymentComplete={(reussi) => {
              if (reussi) setMerci(montant);
            }}
          />
        </div>
      )}
    </div>
  );
}
