'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CreditCard, Clock, Store } from 'lucide-react';

import { euro } from '@/lib/format';

import { useTranslations } from 'next-intl';
/**
 * La formule du commerçant, et le moyen d'en changer.
 *
 * Il ne savait pas à quoi il avait souscrit : une pastille dans la barre
 * latérale, un quota sur la liste des boutiques, et rien qui dise ce que la
 * formule contient ni comment en sortir.
 */

interface Formule {
  code: 'FREE' | 'PREMIUM' | 'PRO';
  libelle: string;
  maxBoutiques: number;
  prixMensuel: number;
  avantages: string[];
  ordre: number;
}

interface Quota {
  tier: string;
  tierLabel: string;
  used: number;
  max: number;
  canCreate: boolean;
  upgradeAvailable: boolean;
  nextTier: string | null;
  nextTierLabel: string | null;
}

interface Demande {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function MaFormulePage() {
  const t = useTranslations('merchantSubscription');
  const [grille, setGrille] = useState<Formule[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [orgId, setOrgId] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [envoi, setEnvoi] = useState('');

  const charger = useCallback(async () => {
    const jeton = localStorage.getItem('accessToken');
    const org = localStorage.getItem('currentOrgId');

    if (!jeton || !org) {
      setErreur('Reconnectez-vous pour voir votre formule');
      setChargement(false);
      return;
    }

    setOrgId(org);

    try {
      const reponse = await fetch(`${API_URL}/api/plans/${org}`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });
      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Impossible de charger votre formule');
        return;
      }

      setGrille(donnees.data.grille || []);
      setQuota(donnees.data.quota || null);
      setDemande(donnees.data.demandeEnCours || null);
      setErreur('');
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const demander = async (code: string) => {
    setEnvoi(code);
    setMessage('');
    setErreur('');

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/plans/${orgId}/demande`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jeton}`,
        },
        body: JSON.stringify({ tier: code }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || 'Demande refusée');
        return;
      }

      setMessage(donnees.message || 'Demande envoyée');
      await charger();
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setEnvoi('');
    }
  };

  if (chargement) {
    return <div className="p-8 text-gray-400">Chargement de votre formule…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/merchant"
            aria-label={t('back')}
            title={t('back')}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Ma formule</h1>
            <p className="text-gray-400 text-sm">
              Ce à quoi vous avez souscrit, et ce que proposent les autres formules.
            </p>
          </div>
        </div>

        {erreur && (
          <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg px-4 py-3">
            {erreur}
          </div>
        )}
        {message && (
          <div className="bg-green-900/30 border border-green-700 text-green-200 rounded-lg px-4 py-3">
            {message}
          </div>
        )}

        {quota && (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-sm text-gray-400 mb-1">Formule en cours</p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-2xl font-bold">{quota.tierLabel}</h2>
              <span className="flex items-center gap-1 text-gray-400">
                <Store size={16} />
                {quota.used} boutique{quota.used > 1 ? 's' : ''} sur {quota.max}
              </span>
            </div>

            {!quota.canCreate && (
              <p className="mt-3 text-sm text-amber-300">
                Vous avez atteint la limite de votre formule.
                {quota.upgradeAvailable
                  ? ` La formule ${quota.nextTierLabel} en autorise davantage.`
                  : ' Pour aller au-delà, adressez une demande au support.'}
              </p>
            )}
          </section>
        )}

        {demande && (
          <section className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 flex items-start gap-3">
            <Clock size={20} className="text-blue-300 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-200">{demande.title}</p>
              <p className="text-sm text-blue-300/80">
                Demande déposée le{' '}
                {new Date(demande.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                })}
                , en attente du support.{' '}
                <Link href={`/merchant/${orgId}/support`} className="underline">
                  Suivre la discussion
                </Link>
              </p>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {grille.map((formule) => {
            const actuelle = quota?.tier === formule.code;

            return (
              <section
                key={formule.code}
                className={`rounded-lg p-6 border flex flex-col ${
                  actuelle
                    ? 'bg-gray-800 border-orange-500'
                    : 'bg-gray-800/60 border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold">{formule.libelle}</h3>
                  {actuelle && (
                    <span className="px-2 py-0.5 rounded border border-orange-500/50 bg-orange-500/15 text-orange-300 text-xs font-semibold uppercase tracking-wide">
                      En cours
                    </span>
                  )}
                </div>

                <p className="text-3xl font-bold mb-1">
                  {formule.prixMensuel === 0 ? 'Gratuit' : euro(formule.prixMensuel)}
                  {formule.prixMensuel > 0 && (
                    <span className="text-sm font-normal text-gray-400"> / mois</span>
                  )}
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  {formule.maxBoutiques} boutique{formule.maxBoutiques > 1 ? 's' : ''}
                </p>

                <ul className="space-y-2 mb-6 flex-1">
                  {formule.avantages.map((avantage) => (
                    <li key={avantage} className="flex items-start gap-2 text-sm text-gray-300">
                      <Check size={16} className="text-green-400 flex-shrink-0 mt-0.5" />
                      {avantage}
                    </li>
                  ))}
                </ul>

                {actuelle ? (
                  <p className="text-center text-sm text-gray-500 py-2">Votre formule</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => demander(formule.code)}
                    disabled={Boolean(demande) || envoi === formule.code}
                    title={
                      demande
                        ? 'Une demande est déjà en cours de traitement'
                        : `Demander la formule ${formule.libelle}`
                    }
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition ${
                      demande
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-orange-600 hover:bg-orange-700'
                    }`}
                  >
                    <CreditCard size={18} />
                    {envoi === formule.code ? 'Envoi…' : 'Demander cette formule'}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {/* Dire ce qui se passe vaut mieux qu'un bouton qui prétend encaisser. */}
        <p className="text-sm text-gray-500">
          Le paiement en ligne n'est pas encore ouvert : votre demande part au support, qui
          applique la formule et vous répond dans votre espace.
        </p>
      </div>
    </div>
  );
}
