'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CreditCard, Clock, Gift, Store } from 'lucide-react';

import { euro, parSemaine } from '@/lib/format';

import { useLocale, useTranslations } from 'next-intl';
import { useEffectChargement } from '@/lib/use-effect-chargement';
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
  /** La promo « zéro commission » offerte par la plateforme. */
  commissionFree?: boolean;
  commissionFreeUntil?: string | null;
  /** Des conditions négociées avec la plateforme remplacent celles de la formule. */
  customTerms?: boolean;
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
  const locale = useLocale();
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
      setErreur(t('reconnectez'));
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
        setErreur(donnees.error || t('chargementImpossible'));
        return;
      }

      setGrille(donnees.data.grille || []);
      setQuota(donnees.data.quota || null);
      setDemande(donnees.data.demandeEnCours || null);
      setErreur('');
    } catch {
      setErreur(t('serverError'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
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
        setErreur(donnees.error || t('demandeRefusee'));
        return;
      }

      setMessage(donnees.message || t('demandeEnvoyee'));
      await charger();
    } catch {
      setErreur(t('serverError'));
    } finally {
      setEnvoi('');
    }
  };

  if (chargement) {
    return <div className="p-8 text-gray-500">{t('chargement')}</div>;
  }

  return (
    <div className="text-gray-900">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/merchant"
            aria-label={t('back')}
            title={t('back')}
            className="p-2 hover:bg-white rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t('titre')}</h1>
            <p className="text-gray-500 text-sm">
              {t('sousTitre')}
            </p>
          </div>
        </div>

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">
            {erreur}
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3">
            {message}
          </div>
        )}

        {quota && (
          <section className="bg-white border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-500 mb-1">{t('enCours')}</p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-2xl font-bold">{quota.tierLabel}</h2>
              <span className="flex items-center gap-1 text-gray-500">
                <Store size={16} />
                {t('boutiquesSur', { n: quota.used, max: quota.max })}
              </span>
            </div>

            {quota.customTerms && (
              <p className="mt-3 text-sm text-amber-700">
                {t('conditionsNegociees')}
              </p>
            )}

            {quota.commissionFree && (
              <p className="mt-3 flex items-center gap-2 text-sm text-pink-700">
                <Gift size={16} className="flex-shrink-0" />
                {quota.commissionFreeUntil
                  ? t('offertJusquau', { date: new Date(quota.commissionFreeUntil).toLocaleDateString(locale) })
                  : t('offert')}
              </p>
            )}

            {!quota.canCreate && (
              <p className="mt-3 text-sm text-amber-700">
                {quota.upgradeAvailable
                  ? t('limiteAvecSuivante', { formule: quota.nextTierLabel ?? '' })
                  : t('limiteSupport')}
              </p>
            )}
          </section>
        )}

        {demande && (
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Clock size={20} className="text-blue-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800">{demande.title}</p>
              <p className="text-sm text-blue-700/80">
                {t('demandeDeposee', {
                  date: new Date(demande.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'long' }),
                })}{' '}
                <Link href={`/merchant/${orgId}/support`} className="underline">
                  {t('suivre')}
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
                    ? 'bg-white border-orange-500'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold">{formule.libelle}</h3>
                  {actuelle && (
                    <span className="px-2 py-0.5 rounded border border-orange-500/50 bg-orange-100 text-orange-700 text-xs font-semibold uppercase tracking-wide">
                      {t('badgeEnCours')}
                    </span>
                  )}
                </div>

                {/* Affiché à la semaine, facturé au mois : le montant réellement
                    prélevé reste écrit juste en dessous. */}
                <p className="text-3xl font-bold mb-1">
                  {formule.prixMensuel === 0 ? t('gratuit') : euro(parSemaine(formule.prixMensuel))}
                  {formule.prixMensuel > 0 && (
                    <span className="text-sm font-normal text-gray-500"> {t('parSemaine')}</span>
                  )}
                </p>
                {formule.prixMensuel > 0 && (
                  <p className="text-xs text-gray-500 mb-1">
                    {t('soitParMois', { montant: euro(formule.prixMensuel) })}
                  </p>
                )}
                <p className="text-sm text-gray-500 mb-4">
                  {t('boutiques', { n: formule.maxBoutiques })}
                </p>

                <ul className="space-y-2 mb-6 flex-1">
                  {formule.avantages.map((avantage) => (
                    <li key={avantage} className="flex items-start gap-2 text-sm text-gray-700">
                      <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                      {avantage}
                    </li>
                  ))}
                </ul>

                {actuelle ? (
                  <p className="text-center text-sm text-gray-500 py-2">{t('votreFormule')}</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => demander(formule.code)}
                    disabled={Boolean(demande) || envoi === formule.code}
                    title={
                      demande
                        ? t('demandeEnCours')
                        : t('demanderFormule', { formule: formule.libelle })
                    }
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg font-semibold transition ${
                      demande
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : 'bg-orange-600 hover:bg-orange-700 text-white'
                    }`}
                  >
                    <CreditCard size={18} />
                    {envoi === formule.code ? t('envoi') : t('demanderCette')}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        {/* Dire ce qui se passe vaut mieux qu'un bouton qui prétend encaisser. */}
        <p className="text-sm text-gray-500">
          {t('paiementPasOuvert')}
        </p>
      </div>
    </div>
  );
}
