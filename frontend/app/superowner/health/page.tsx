'use client';

import { useCallback, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

/**
 * La santé de la plateforme, relevé par relevé.
 *
 * Le tableau de bord n'affiche que le pourcentage. Ce qui le compose — et
 * surtout ce qu'il faut faire pour le remonter — tient ici.
 */

interface Controle {
  cle: string;
  libelle: string;
  poids: number;
  score: number;
  etat: 'OK' | 'ATTENTION' | 'PANNE';
  detail: string;
  remede: string;
  pointsObtenus: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/** Vert au-dessus de 90, orange au-dessus de 60, rouge en dessous. */
const teinteTexte = (score: number) =>
  score >= 90 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';

const teinteBarre = (score: number) =>
  score >= 90 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';

const ICONES: Record<string, ReactElement> = {
  OK: <CheckCircle2 size={20} className="text-green-400" />,
  ATTENTION: <AlertTriangle size={20} className="text-amber-400" />,
  PANNE: <XCircle size={20} className="text-red-400" />,
};

export default function SanteSystemePage() {
  const t = useTranslations('superownerHealth');
  const locale = useLocale();
  const [sante, setSante] = useState<{ score: number; controles: Controle[] } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [releveA, setReleveA] = useState<Date | null>(null);

  const ETIQUETTES: Record<string, string> = {
    OK: t('statusOk'),
    ATTENTION: t('statusWarning'),
    PANNE: t('statusDown'),
  };

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/superowner/system-health`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || t('loadError'));
        return;
      }

      setSante(donnees.data);
      setReleveA(new Date());
      setErreur('');
    } catch {
      setErreur(t('serverUnreachable'));
    } finally {
      setChargement(false);
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const aTraiter = (sante?.controles || []).filter((controle) => controle.etat !== 'OK');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link
            href="/superowner"
            aria-label={t('back')}
            title={t('backToDashboard')}
            className="p-2 hover:bg-gray-800 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity size={28} className="text-red-500" />
              {t('title')}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {t('subtitle')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={charger}
          disabled={chargement}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 hover:bg-gray-700 rounded-lg transition disabled:opacity-60"
        >
          <RefreshCw size={16} className={chargement ? 'animate-spin' : ''} />
          {chargement ? t('refreshing') : t('refresh')}
        </button>
      </div>

      {erreur && (
        <div className="bg-red-900/30 border border-red-700 text-red-200 rounded-lg px-4 py-3">
          {erreur}
        </div>
      )}

      {sante && (
        <>
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className={`text-5xl font-bold ${teinteTexte(sante.score)}`}>{sante.score}%</p>
              <p className="text-gray-400">{t('pointsOutOf100', { score: sante.score })}</p>
            </div>

            <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${teinteBarre(sante.score)} transition-all`}
                style={{ width: `${sante.score}%` }}
              />
            </div>

            <p className="text-sm text-gray-500 mt-3">
              {aTraiter.length === 0
                ? t('allGreen')
                : t('needsAttention', { count: aTraiter.length })}
              {releveA && t('measuredAt', { time: releveA.toLocaleTimeString(locale === 'en' ? 'en-US' : 'fr-FR') })}
            </p>
          </section>

          <section className="bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700">
            {sante.controles.map((controle) => (
              <div key={controle.cle} className="p-6 flex items-start gap-4">
                <span className="mt-0.5 flex-shrink-0">{ICONES[controle.etat]}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="font-bold text-lg">{controle.libelle}</h2>
                    <span className="text-sm text-gray-400">
                      {t('pointsEarned', { earned: controle.pointsObtenus, weight: controle.poids })}
                    </span>
                  </div>

                  <p className="text-xs uppercase tracking-wide text-gray-500 mt-0.5">
                    {ETIQUETTES[controle.etat]}
                  </p>

                  <p className="text-gray-300 mt-2">{controle.detail}</p>

                  {controle.remede && (
                    <p className="text-sm text-amber-300 mt-2 bg-amber-900/15 border border-amber-700/40 rounded px-3 py-2">
                      {controle.remede}
                    </p>
                  )}

                  {/* La part obtenue, visible d'un coup d'œil : le chiffre seul
                      ne dit pas s'il manque un point ou vingt. */}
                  <div className="mt-3 h-1.5 bg-gray-700 rounded-full overflow-hidden max-w-xs">
                    <div
                      className={`h-full ${teinteBarre(controle.score * 100)}`}
                      style={{ width: `${Math.round(controle.score * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </section>

          <p className="text-sm text-gray-500">
            {t('footerNote')}
          </p>
        </>
      )}

      {!sante && chargement && <p className="text-gray-400">{t('loadingLabel')}</p>}
    </div>
  );
}
