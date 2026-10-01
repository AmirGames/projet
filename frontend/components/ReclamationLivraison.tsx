'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PackageX } from 'lucide-react';

import { cheminCommande, jetonDeSuivi } from '@/lib/suivi-commande';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Même forme que `reclamation` dans le suivi renvoyé par l'API. */
export interface EtatReclamation {
  possible: boolean;
  deposee: boolean;
}

/**
 * « Je n'ai pas reçu ma commande », après un dépôt en photo.
 *
 * Le client n'avait aucun moyen simple de contester un dépôt : la photo et la
 * course « livrée » faisaient foi. La réclamation suspend le paiement du
 * livreur, et la plateforme tranche. Le client connecté passe par sa session,
 * le visiteur par son jeton de suivi.
 */
export function ReclamationLivraison({
  orderId,
  etat,
  onDeposee,
}: {
  orderId: string;
  etat: EtatReclamation;
  onDeposee?: () => void;
}) {
  const t = useTranslations('reclamationLivraison');
  const [ouvert, setOuvert] = useState(false);
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [deposee, setDeposee] = useState(etat.deposee);

  if (deposee) {
    return (
      <div role="status" className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-sm text-gray-200">
        {t('deposee')}
      </div>
    );
  }
  if (!etat.possible) return null;

  const envoyer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}${cheminCommande(orderId, jetonDeSuivi(orderId), '/reclamation-livraison')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const donnees = await reponse.json().catch(() => null);
      if (!reponse.ok && donnees?.code !== 'CLAIM_ALREADY_FILED') throw new Error(donnees?.error || t('erreur'));
      setDeposee(true);
      onDeposee?.();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="flex items-center gap-2 text-sm text-red-300 hover:text-red-200 underline underline-offset-2"
      >
        <PackageX size={16} />
        {t('bouton')}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3 space-y-2">
      <p className="font-semibold text-red-200">{t('titre')}</p>
      <p className="text-sm text-red-200/80">{t('explication')}</p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder={t('placeholder')}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-red-500"
      />
      {erreur && <p className="text-sm text-red-400">{erreur}</p>}
      <div className="flex gap-2 flex-wrap">
        <button
          disabled={envoi}
          onClick={envoyer}
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold"
        >
          {t('envoyer')}
        </button>
        <button onClick={() => setOuvert(false)} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm">
          {t('annuler')}
        </button>
      </div>
    </div>
  );
}
