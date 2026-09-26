'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CheckCircle2, ChevronDown, Globe, HelpCircle, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

/**
 * La disponibilité dans la durée : pour chaque cible, les pourcentages sur
 * 24 h, 7, 30 et 90 jours, et une frise d'un trait par jour, comme sur une
 * page de statut.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
/** Les relevés sont minute par minute : relire plus souvent n'apprendrait rien. */
const RAFRAICHISSEMENT_MS = 60_000;

interface Jour {
  jour: string;
  disponibilite: number | null;
  indisponibleMin: number;
  tempsReponseMs: number | null;
}

interface CibleBilan {
  cle: string;
  libelle: string;
  url?: string;
  depuis: string | null;
  etat: 'OK' | 'PANNE' | 'INCONNU';
  etatDepuis?: string | null;
  derniereErreur?: string | null;
  disponibilite: Partial<Record<'24h' | '7j' | '30j' | '90j', number | null>>;
  jours: Jour[];
  incidents: { debut: string; fin: string | null; dureeS: number; cause: string }[];
}

interface Bilan {
  intervalleMs: number;
  conservationJours: number;
  cibles: CibleBilan[];
}

/** Au-dessus de 99,9 % vert, de 99 % orange, en dessous rouge. */
const teinte = (valeur: number | null | undefined) =>
  valeur == null ? 'bg-gray-700' : valeur >= 99.9 ? 'bg-green-500' : valeur >= 99 ? 'bg-amber-500' : 'bg-red-500';

const teinteTexte = (valeur: number | null | undefined) =>
  valeur == null ? 'text-gray-500' : valeur >= 99.9 ? 'text-green-400' : valeur >= 99 ? 'text-amber-400' : 'text-red-400';

export function DisponibiliteSite() {
  const t = useTranslations('superownerMonitoring');
  const locale = useLocale();
  const formatLocal = locale === 'en' ? 'en-US' : 'fr-FR';

  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState<{ cible: string; index: number } | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch(`${API_URL}/api/superowner/uptime`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const corps = await reponse.json();
      if (!reponse.ok) {
        setErreur(corps.error || t('uptimeLoadError'));
        return;
      }
      setBilan(corps.data);
      setErreur('');
    } catch {
      setErreur(t('serverUnreachable'));
    }
  }, [t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    const minuteur = setInterval(() => {
      if (document.visibilityState === 'visible') charger();
    }, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuteur);
  }, [charger]);

  const pourcent = (valeur: number | null | undefined) =>
    valeur == null
      ? '—'
      : `${valeur.toLocaleString(formatLocal, { minimumFractionDigits: valeur === 100 ? 0 : 2, maximumFractionDigits: 3 })} %`;

  const dateHeure = (iso: string) => new Date(iso).toLocaleString(formatLocal, { dateStyle: 'short', timeStyle: 'short' });
  const date = (jour: string) => new Date(`${jour}T00:00:00Z`).toLocaleDateString(formatLocal, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const duree = (secondes: number) => {
    if (secondes < 60) return t('uptimeSeconds', { s: secondes });
    const minutes = Math.round(secondes / 60);
    if (minutes < 60) return t('durationMinutes', { m: minutes });
    return t('durationHours', { h: Math.floor(minutes / 60), m: minutes % 60 });
  };

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-lg">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-700 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Globe size={18} className="text-gray-400" />
          {t('uptimeTitle')}
        </h2>
        {bilan && (
          <p className="text-xs text-gray-500">
            {t('uptimeSubtitle', { interval: Math.round(bilan.intervalleMs / 1000), days: bilan.conservationJours })}
          </p>
        )}
      </header>

      <div className="p-5 space-y-8">
        {erreur && <p className="text-sm text-red-300">{erreur}</p>}
        {!bilan && !erreur && <p className="text-sm text-gray-400">{t('loading')}</p>}

        {bilan?.cibles.map((cible) => (
          <article key={cible.cle} className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2">
                  {cible.etat === 'OK' ? (
                    <CheckCircle2 size={18} className="text-green-400" />
                  ) : cible.etat === 'PANNE' ? (
                    <XCircle size={18} className="text-red-400" />
                  ) : (
                    <HelpCircle size={18} className="text-gray-500" />
                  )}
                  {cible.libelle}
                </h3>
                <p className="text-xs text-gray-500 break-all">
                  {cible.url ?? t('uptimeInternal')}
                  {cible.depuis && ` · ${t('uptimeSince', { date: dateHeure(cible.depuis) })}`}
                </p>
                {cible.etat === 'PANNE' && cible.derniereErreur && (
                  <p className="text-sm text-red-300 mt-1 break-words">
                    {cible.derniereErreur}
                    {cible.etatDepuis && ` — ${t('uptimeDownSince', { date: dateHeure(cible.etatDepuis) })}`}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-4 gap-4 text-right">
                {(['24h', '7j', '30j', '90j'] as const).map((fenetre) => (
                  <div key={fenetre}>
                    <dt className="text-[11px] uppercase tracking-wide text-gray-500">{t(`uptimeWindow${fenetre}`)}</dt>
                    <dd className={`font-semibold tabular-nums text-sm ${teinteTexte(cible.disponibilite[fenetre])}`}>
                      {pourcent(cible.disponibilite[fenetre])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {cible.jours.length === 0 ? (
              <p className="text-sm text-gray-500">{t('uptimeNoData')}</p>
            ) : (
              <div className="relative">
                {/* Un trait par jour, le plus ancien à gauche. */}
                <div className="flex gap-[2px] h-9 items-stretch" role="list" aria-label={t('uptimeTimelineLabel')}>
                  {cible.jours.map((jour, index) => {
                    const actif = survol?.cible === cible.cle && survol.index === index;
                    return (
                      <div
                        key={jour.jour}
                        role="listitem"
                        tabIndex={0}
                        aria-label={`${date(jour.jour)} : ${pourcent(jour.disponibilite)}`}
                        onMouseEnter={() => setSurvol({ cible: cible.cle, index })}
                        onMouseLeave={() => setSurvol(null)}
                        onFocus={() => setSurvol({ cible: cible.cle, index })}
                        onBlur={() => setSurvol(null)}
                        className={`flex-1 min-w-0 rounded-sm outline-none ${teinte(jour.disponibilite)} ${
                          actif ? 'opacity-100 ring-1 ring-white/70' : survol?.cible === cible.cle ? 'opacity-60' : ''
                        }`}
                      />
                    );
                  })}
                </div>

                {survol?.cible === cible.cle && cible.jours[survol.index] && (
                  <div
                    className={`absolute z-10 top-11 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-xs shadow-lg pointer-events-none min-w-[11rem] ${
                      survol.index > cible.jours.length / 2 ? 'right-0' : 'left-0'
                    }`}
                  >
                    <p className="text-gray-400">{date(cible.jours[survol.index].jour)}</p>
                    <p className={`font-semibold text-sm ${teinteTexte(cible.jours[survol.index].disponibilite)}`}>
                      {cible.jours[survol.index].disponibilite == null ? t('uptimeNoDataDay') : pourcent(cible.jours[survol.index].disponibilite)}
                    </p>
                    {cible.jours[survol.index].indisponibleMin > 0 && (
                      <p className="text-gray-300">{t('uptimeDowntime', { m: cible.jours[survol.index].indisponibleMin })}</p>
                    )}
                    {cible.jours[survol.index].tempsReponseMs != null && (
                      <p className="text-gray-300">{t('uptimeResponse', { ms: cible.jours[survol.index].tempsReponseMs! })}</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <span>{t('uptimeDaysAgo', { n: cible.jours.length })}</span>
                  <span>{t('uptimeToday')}</span>
                </div>
              </div>
            )}

            {cible.incidents.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setOuverte(ouverte === cible.cle ? null : cible.cle)}
                  aria-expanded={ouverte === cible.cle}
                  className="text-sm text-gray-300 hover:text-white flex items-center gap-1"
                >
                  <ChevronDown size={16} className={`transition-transform ${ouverte === cible.cle ? '' : '-rotate-90'}`} />
                  {t('uptimeIncidents', { n: cible.incidents.length })}
                </button>
                {ouverte === cible.cle && (
                  <ul className="mt-2 divide-y divide-gray-700 text-sm">
                    {cible.incidents.map((incident) => (
                      <li key={incident.debut} className="py-2 flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-gray-200 break-words">{incident.cause}</p>
                          <p className="text-xs text-gray-500">
                            {dateHeure(incident.debut)} → {incident.fin ? dateHeure(incident.fin) : t('uptimeOngoing')}
                          </p>
                        </div>
                        <span className={`tabular-nums ${incident.fin ? 'text-gray-300' : 'text-red-400'}`}>{duree(incident.dureeS)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
