'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownRight, ArrowUpRight, BarChart3, Star } from 'lucide-react';

import { euro } from '@/lib/format';
import { GraphiqueColonnes, type Colonne } from '@/components/GraphiqueColonnes';

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
  };
  precedente: { livrees: number; gains: number };
  offres: { recues: number; acceptees: number; refusees: number; expirees: number; tauxAcceptation: number | null };
  notes: { moyennePeriode: number | null; avisPeriode: number; moyenneGlobale: number | null; avisTotal: number };
  parJour: { date: string; livrees: number; gains: number; distanceKm: number }[];
  parHeure: { heure: number; livrees: number; gains: number }[];
}

const PERIODES: { jours: Jours; label: string }[] = [
  { jours: 7, label: '7 jours' },
  { jours: 30, label: '30 jours' },
  { jours: 90, label: '90 jours' },
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
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-white text-2xl font-semibold mt-1">{valeur}</p>
      {delta != null ? (
        // Une hausse est bonne pour toutes ces mesures : vert vers le haut.
        <p
          className={`text-xs mt-1 flex items-center gap-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta >= 0 ? '+' : ''}
          {delta} % vs période précédente
        </p>
      ) : (
        aide && <p className="text-xs text-gray-500 mt-1">{aide}</p>
      )}
    </div>
  );
}

/** Statistiques du livreur : gains, rythme, acceptation, heures fortes. */
export default function AnalyticsLivreurPage() {
  const router = useRouter();
  const [jours, setJours] = useState<Jours>(7);
  const [donnees, setDonnees] = useState<Analytics | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const token = localStorage.getItem('driverToken');
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
      setErreur(e instanceof Error && e.message ? e.message : 'Statistiques indisponibles.');
    } finally {
      setChargement(false);
    }
  }, [jours, router]);

  useEffect(() => {
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
            ? date.toLocaleDateString('fr-FR', jours === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })
            : '',
        labelComplet: date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        valeur: j.gains,
        details: [`${j.livrees} course${j.livrees > 1 ? 's' : ''}`, `${nombre(j.distanceKm, 1)} km`],
      };
    });
  }, [donnees, jours]);

  const colonnesHeures: Colonne[] = useMemo(() => {
    if (!donnees) return [];
    return donnees.parHeure.map((h) => ({
      label: h.heure % 3 === 0 ? `${h.heure}h` : '',
      labelComplet: `${h.heure}h – ${h.heure + 1}h`,
      valeur: h.livrees,
      details: [`${euro(h.gains)} gagnés`],
    }));
  }, [donnees]);

  const heureForte = useMemo(() => {
    if (!donnees) return null;
    const meilleure = [...donnees.parHeure].sort((a, b) => b.livrees - a.livrees)[0];
    return meilleure && meilleure.livrees > 0 ? meilleure : null;
  }, [donnees]);

  const r = donnees?.resume;
  const o = donnees?.offres;

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-orange-500" size={28} />
            <div>
              <h1 className="text-2xl font-bold text-white">Statistiques</h1>
              <p className="text-gray-400 text-sm">Votre activité, vos gains et vos heures fortes</p>
            </div>
          </div>
          <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1" role="group" aria-label="Période">
            {PERIODES.map((p) => (
              <button
                key={p.jours}
                onClick={() => setJours(p.jours)}
                aria-pressed={jours === p.jours}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${
                  jours === p.jours ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {erreur && (
          <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">{erreur}</div>
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
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <p className="text-gray-400 text-sm">Gains sur {jours} jours</p>
                <p className="text-white text-5xl font-semibold mt-1">{euro(r.gains)}</p>
                {variation(r.gains, donnees.precedente.gains) != null && (
                  <p
                    className={`text-sm mt-2 ${
                      (variation(r.gains, donnees.precedente.gains) ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {(variation(r.gains, donnees.precedente.gains) ?? 0) >= 0 ? '+' : ''}
                    {variation(r.gains, donnees.precedente.gains)} % par rapport aux {jours} jours précédents (
                    {euro(donnees.precedente.gains)})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Tuile
                  label="Courses livrées"
                  valeur={nombre(r.livrees)}
                  delta={variation(r.livrees, donnees.precedente.livrees)}
                />
                <Tuile label="Gain moyen par course" valeur={r.gainMoyen != null ? euro(r.gainMoyen) : '—'} />
                <Tuile
                  label="Gains par heure de course"
                  valeur={r.gainsParHeure != null ? euro(r.gainsParHeure) : '—'}
                  aide="Temps d'acceptation à remise"
                />
                <Tuile label="Distance parcourue" valeur={`${nombre(r.distanceKm, 1)} km`} />
                <Tuile
                  label="Durée moyenne d'une course"
                  valeur={r.dureeMoyenneMin != null ? `${r.dureeMoyenneMin} min` : '—'}
                  aide={r.retraitMoyenMin != null ? `dont ${r.retraitMoyenMin} min jusqu'au retrait` : undefined}
                />
                <Tuile label="Courses annulées" valeur={nombre(r.annulees)} />
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-xs">Note moyenne</p>
                  <p className="text-white text-2xl font-semibold mt-1 flex items-center gap-2">
                    {donnees.notes.moyenneGlobale != null ? nombre(donnees.notes.moyenneGlobale, 1) : '—'}
                    {donnees.notes.moyenneGlobale != null && (
                      <Star size={18} className="text-yellow-400" fill="currentColor" aria-hidden />
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {donnees.notes.avisTotal} avis
                    {donnees.notes.avisPeriode > 0 &&
                      ` · ${nombre(donnees.notes.moyennePeriode ?? 0, 1)} sur la période`}
                  </p>
                </div>

                {/* Taux d'acceptation : une jauge, piste du même ton. */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                  <p className="text-gray-400 text-xs">Taux d&apos;acceptation</p>
                  <p className="text-white text-2xl font-semibold mt-1">
                    {o.tauxAcceptation != null ? `${o.tauxAcceptation} %` : '—'}
                  </p>
                  <div
                    className="mt-2 h-2 rounded-full bg-orange-950"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={o.tauxAcceptation ?? 0}
                    aria-label="Taux d'acceptation"
                  >
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${o.tauxAcceptation ?? 0}%`, background: '#ea580c' }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {o.acceptees} acceptées · {o.refusees} refusées · {o.expirees} expirées
                  </p>
                </div>
              </div>

              <GraphiqueColonnes
                titre="Gains par jour"
                colonnes={colonnesGains}
                format={(v) => euro(v)}
                formatAxe={(v) => `${nombre(v)} €`}
                mesure="Gains"
              />

              <GraphiqueColonnes
                titre="Courses selon l'heure de livraison"
                colonnes={colonnesHeures}
                format={(v) => nombre(v)}
                mesure="Courses"
              />
              {heureForte && (
                <p className="text-sm text-gray-400 -mt-3">
                  Votre créneau le plus actif : {heureForte.heure}h – {heureForte.heure + 1}h (
                  {heureForte.livrees} course{heureForte.livrees > 1 ? 's' : ''}).
                </p>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
