'use client';


import { jetonAcces } from '@/lib/jeton-session';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, BarChart3, Star } from 'lucide-react';

import { euro } from '@/lib/format';
import { GraphiqueColonnes, type Colonne } from '@/components/GraphiqueColonnes';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Jours = 7 | 30 | 90;

interface Analytics {
  resume: {
    livrees: number;
    gains: number;
    gainMoyen: number | null;
    distanceKm: number;
    dureeMoyenneMin: number | null;
    retraitMoyenMin: number | null;
    gainsParHeure: number | null;
    annulees: number;
    /** Compris dans les gains. */
    pourboires: number;
    coursesAvecPourboire: number;
  };
  precedente: { livrees: number; gains: number };
  offres: { recues: number; acceptees: number; refusees: number; expirees: number; tauxAcceptation: number | null };
  notes: { moyennePeriode: number | null; avisPeriode: number; moyenneGlobale: number | null; avisTotal: number };
  parJour: { date: string; livrees: number; gains: number; distanceKm: number; pourboires: number }[];
  parHeure: { heure: number; livrees: number; gains: number }[];
}

const PERIODES: { jours: Jours }[] = [
  { jours: 7 },
  { jours: 30 },
  { jours: 90 },
];

const nombre = (n: number, decimales = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

/** Variation par rapport à la période précédente ; null si rien à comparer. */
function variation(actuel: number, precedent: number) {
  if (precedent === 0) return null;
  return Math.round(((actuel - precedent) / precedent) * 100);
}

function Tuile({
  label,
  valeur,
  delta,
  aide,
}: {
  label: string;
  valeur: string;
  delta?: number | null;
  aide?: string;
}) {
  const t = useTranslations('statistiquesLivreur');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="text-gray-900 text-2xl font-semibold mt-1">{valeur}</p>
      {delta != null ? (
        // Une hausse est bonne pour toutes ces mesures : vert vers le haut.
        <p
          className={`text-xs mt-1 flex items-center gap-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
        >
          {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta >= 0 ? '+' : ''}
          {t('vsPrecedente', { delta })}
        </p>
      ) : (
        aide && <p className="text-xs text-gray-500 mt-1">{aide}</p>
      )}
    </div>
  );
}

/** Statistiques du livreur : gains, rythme, acceptation, heures fortes. */
export default function AnalyticsLivreurPage() {
  const t = useTranslations('statistiquesLivreur');
  const locale = useLocale();
  const router = useRouter();
  const [jours, setJours] = useState<Jours>(7);
  const [donnees, setDonnees] = useState<Analytics | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const token = jetonAcces();
    if (!token) {
      router.push('/driver/login');
      return;
    }
    setChargement(true);
    setErreur('');
    try {
      const res = await fetch(`${API_URL}/api/drivers/analytics?jours=${jours}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.push('/driver/login');
        return;
      }
      const corps = await res.json();
      if (!res.ok) throw new Error(corps.error);
      setDonnees(corps.data);
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('indisponibles'));
    } finally {
      setChargement(false);
    }
  }, [jours, router, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const colonnesGains: Colonne[] = useMemo(() => {
    if (!donnees) return [];
    // Sur 30 ou 90 jours, un libellé sur sept suffit : l'axe reste lisible.
    const espacement = jours === 7 ? 1 : 7;
    return donnees.parJour.map((j, i) => {
      const date = new Date(`${j.date}T12:00:00`);
      return {
        // Compté depuis la fin : le jour le plus récent porte toujours un libellé.
        label:
          (donnees.parJour.length - 1 - i) % espacement === 0
            ? date.toLocaleDateString(locale, jours === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
            : '',
        labelComplet: date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
        valeur: j.gains,
        details: [
          t('courses', { n: j.livrees }),
          t('km', { n: nombre(j.distanceKm, 1) }),
          ...(j.pourboires > 0 ? [t('dontPourboires', { montant: euro(j.pourboires) })] : []),
        ],
      };
    });
  }, [donnees, jours, locale, t]);

  const colonnesHeures: Colonne[] = useMemo(() => {
    if (!donnees) return [];
    return donnees.parHeure.map((h) => ({
      label: h.heure % 3 === 0 ? `${h.heure}h` : '',
      labelComplet: `${h.heure}h – ${h.heure + 1}h`,
      valeur: h.livrees,
      details: [t('gagnes', { montant: euro(h.gains) })],
    }));
  }, [donnees, t]);

  const heureForte = useMemo(() => {
    if (!donnees) return null;
    const meilleure = [...donnees.parHeure].sort((a, b) => b.livrees - a.livrees)[0];
    return meilleure && meilleure.livrees > 0 ? meilleure : null;
  }, [donnees]);

  const r = donnees?.resume;
  const o = donnees?.offres;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-orange-500" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('titre')}</h1>
              <p className="text-gray-500 text-sm">{t('sousTitre')}</p>
            </div>
          </div>
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1" role="group" aria-label={t('periode')}>
            {PERIODES.map((p) => (
              <button
                key={p.jours}
                onClick={() => setJours(p.jours)}
                aria-pressed={jours === p.jours}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                  jours === p.jours ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t('nJours', { n: p.jours })}
              </button>
            ))}
          </div>
        </div>

        {erreur && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{erreur}</div>
        )}

        {chargement && !donnees ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          donnees &&
          r &&
          o && (
            <>
              {/* Chiffre de tête */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <p className="text-gray-500 text-sm">{t('gainsSur', { n: jours })}</p>
                <p className="text-gray-900 text-5xl font-semibold mt-1">{euro(r.gains)}</p>
                {r.pourboires > 0 && (
                  <p className="text-sm text-yellow-600 mt-2">{t('dontPourboiresFete', { montant: euro(r.pourboires) })}</p>
                )}
                {variation(r.gains, donnees.precedente.gains) != null && (
                  <p
                    className={`text-sm mt-2 ${
                      (variation(r.gains, donnees.precedente.gains) ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {(variation(r.gains, donnees.precedente.gains) ?? 0) >= 0 ? '+' : ''}
                    {t('parRapport', {
                      delta: variation(r.gains, donnees.precedente.gains) ?? 0,
                      n: jours,
                      montant: euro(donnees.precedente.gains),
                    })}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tuile
                  label={t('coursesLivrees')}
                  valeur={nombre(r.livrees)}
                  delta={variation(r.livrees, donnees.precedente.livrees)}
                />
                <Tuile label={t('gainMoyen')} valeur={r.gainMoyen != null ? euro(r.gainMoyen) : '—'} />
                <Tuile
                  label={t('gainsHeure')}
                  valeur={r.gainsParHeure != null ? euro(r.gainsParHeure) : '—'}
                  aide={t('gainsHeureAide')}
                />
                <Tuile label={t('distance')} valeur={t('km', { n: nombre(r.distanceKm, 1) })} />
                <Tuile
                  label={t('dureeMoyenne')}
                  valeur={r.dureeMoyenneMin != null ? t('minutes', { n: r.dureeMoyenneMin }) : '—'}
                  aide={r.retraitMoyenMin != null ? t('dontRetrait', { n: r.retraitMoyenMin }) : undefined}
                />
                <Tuile
                  label={t('pourboiresRecus')}
                  valeur={euro(r.pourboires ?? 0)}
                  aide={
                    r.coursesAvecPourboire
                      ? t('surCourses', { n: r.coursesAvecPourboire })
                      : t('aucunPeriode')
                  }
                />
                <Tuile label={t('annulees')} valeur={nombre(r.annulees)} />
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-xs">{t('noteMoyenne')}</p>
                  <p className="text-gray-900 text-2xl font-semibold mt-1 flex items-center gap-2">
                    {donnees.notes.moyenneGlobale != null ? nombre(donnees.notes.moyenneGlobale, 1) : '—'}
                    {donnees.notes.moyenneGlobale != null && (
                      <Star size={18} className="text-yellow-600" fill="currentColor" aria-hidden />
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('avis', { n: donnees.notes.avisTotal })}
                    {donnees.notes.avisPeriode > 0 &&
                      t('surLaPeriode', { moyenne: nombre(donnees.notes.moyennePeriode ?? 0, 1) })}
                  </p>
                </div>

                {/* Taux d'acceptation : une jauge, piste du même ton. */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-gray-500 text-xs">{t('tauxAcceptation')}</p>
                  <p className="text-gray-900 text-2xl font-semibold mt-1">
                    {o.tauxAcceptation != null ? t('pourcent', { n: o.tauxAcceptation }) : '—'}
                  </p>
                  <div
                    className="mt-2 h-2 rounded-full bg-orange-50"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={o.tauxAcceptation ?? 0}
                    aria-label={t('tauxAcceptation')}
                  >
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${o.tauxAcceptation ?? 0}%`, background: '#ea580c' }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('offres', { acceptees: o.acceptees, refusees: o.refusees, expirees: o.expirees })}
                  </p>
                </div>
              </div>

              <GraphiqueColonnes
                clair
                titre={t('gainsParJour')}
                colonnes={colonnesGains}
                format={(v) => euro(v)}
                formatAxe={(v) => `${nombre(v)} €`}
                mesure={t('gains')}
              />

              <GraphiqueColonnes
                clair
                titre={t('selonHeure')}
                colonnes={colonnesHeures}
                format={(v) => nombre(v)}
                mesure={t('coursesMesure')}
              />
              {heureForte && (
                <p className="text-sm text-gray-500 -mt-3">
                  {t('creneauActif', { debut: heureForte.heure, fin: heureForte.heure + 1, n: heureForte.livrees })}
                </p>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
