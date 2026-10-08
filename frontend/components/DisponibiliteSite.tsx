'use client';


import { jetonAcces } from '@/lib/jeton-session';
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

interface Heure {
  heure: string;
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
  heures?: Heure[];
  incidents: { debut: string; fin: string | null; dureeS: number; cause: string }[];
}

interface Bilan {
  intervalleMs: number;
  conservationJours: number;
  cibles: CibleBilan[];
}

/** Au-dessus de 99,9 % vert, de 99 % orange, en dessous rouge. */
const teinte = (valeur: number | null | undefined) =>
  valeur == null ? 'bg-gray-100' : valeur >= 99.9 ? 'bg-green-500' : valeur >= 99 ? 'bg-amber-500' : 'bg-red-500';

const teinteTexte = (valeur: number | null | undefined) =>
  valeur == null ? 'text-gray-500' : valeur >= 99.9 ? 'text-green-600' : valeur >= 99 ? 'text-amber-600' : 'text-red-600';

export function DisponibiliteSite() {
  const t = useTranslations('superownerMonitoring');
  const locale = useLocale();
  const formatLocal = locale === 'en' ? 'en-US' : 'fr-FR';

  const [bilan, setBilan] = useState<Bilan | null>(null);
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState<{ cible: string; index: number } | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [fenetreSelectionnee, setFenetreSelectionnee] = useState<'24h' | '7j' | '30j' | '90j'>('24h');

  const charger = useCallback(async () => {
    try {
      const reponse = await fetch(`${API_URL}/api/superowner/uptime`, {
        headers: { Authorization: `Bearer ${jetonAcces()}` },
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
  const heure = (iso: string) => new Date(iso).toLocaleTimeString(formatLocal, { hour: '2-digit', minute: '2-digit' });

  const duree = (secondes: number) => {
    if (secondes < 60) return t('uptimeSeconds', { s: secondes });
    const minutes = Math.round(secondes / 60);
    if (minutes < 60) return t('durationMinutes', { m: minutes });
    return t('durationHours', { h: Math.floor(minutes / 60), m: minutes % 60 });
  };

  const donneesAffichees = (cible: CibleBilan) => {
    if (fenetreSelectionnee === '24h' && cible.heures?.length) {
      return { donnees: cible.heures, estHeures: true };
    }
    const nbreJours = { '24h': 1, '7j': 7, '30j': 30, '90j': 90 }[fenetreSelectionnee];
    return { donnees: cible.jours.slice(-nbreJours), estHeures: false };
  };


  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Globe size={18} className="text-gray-500" />
          {t('uptimeTitle')}
        </h2>
        <div className="flex gap-1 text-xs">
          {(['24h', '7j', '30j', '90j'] as const).map((fenetre) => (
            <button
              key={fenetre}
              type="button"
              onClick={() => setFenetreSelectionnee(fenetre)}
              aria-pressed={fenetreSelectionnee === fenetre}
              className={`px-2.5 py-1 rounded ${
                fenetreSelectionnee === fenetre
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {t(`uptimeWindow${fenetre}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="p-5 space-y-8">
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        {!bilan && !erreur && <p className="text-sm text-gray-500">{t('loading')}</p>}

        {bilan?.cibles.map((cible) => (
          <article key={cible.cle} className="space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2">
                  {cible.etat === 'OK' ? (
                    <CheckCircle2 size={18} className="text-green-600" />
                  ) : cible.etat === 'PANNE' ? (
                    <XCircle size={18} className="text-red-600" />
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
                  <p className="text-sm text-red-700 mt-1 wrap-break-word">
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
                {/* Un trait par jour/heure, le plus ancien à gauche. */}
                <div className="flex gap-[2px] h-9 items-stretch" role="list" aria-label={t('uptimeTimelineLabel')}>
                  {donneesAffichees(cible).donnees.map((item, index) => {
                    const actif = survol?.cible === cible.cle && survol.index === index;
                    const estHeure = donneesAffichees(cible).estHeures;
                    const cle = estHeure ? (item as Heure).heure : (item as Jour).jour;
                    return (
                      <div
                        key={cle}
                        role="listitem"
                        tabIndex={0}
                        aria-label={`${estHeure ? heure(cle) : date(cle)} : ${pourcent(item.disponibilite)}`}
                        onMouseEnter={() => setSurvol({ cible: cible.cle, index })}
                        onMouseLeave={() => setSurvol(null)}
                        onFocus={() => setSurvol({ cible: cible.cle, index })}
                        onBlur={() => setSurvol(null)}
                        className={`flex-1 min-w-0 rounded-xs outline-hidden ${teinte(item.disponibilite)} ${
                          actif ? 'opacity-100 ring-1 ring-white/70' : survol?.cible === cible.cle ? 'opacity-60' : ''
                        }`}
                      />
                    );
                  })}
                </div>

                {survol?.cible === cible.cle && donneesAffichees(cible).donnees[survol.index] && (
                  <div
                    className={`absolute z-10 top-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs shadow-lg pointer-events-none min-w-44 ${
                      survol.index > donneesAffichees(cible).donnees.length / 2 ? 'right-0' : 'left-0'
                    }`}
                  >
                    {donneesAffichees(cible).estHeures ? (
                      <>
                        <p className="text-gray-500">{heure((donneesAffichees(cible).donnees[survol.index] as Heure).heure)}</p>
                        <p className={`font-semibold text-sm ${teinteTexte(donneesAffichees(cible).donnees[survol.index].disponibilite)}`}>
                          {donneesAffichees(cible).donnees[survol.index].disponibilite == null ? t('uptimeNoDataDay') : pourcent(donneesAffichees(cible).donnees[survol.index].disponibilite)}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-gray-500">{date((donneesAffichees(cible).donnees[survol.index] as Jour).jour)}</p>
                        <p className={`font-semibold text-sm ${teinteTexte(donneesAffichees(cible).donnees[survol.index].disponibilite)}`}>
                          {donneesAffichees(cible).donnees[survol.index].disponibilite == null ? t('uptimeNoDataDay') : pourcent(donneesAffichees(cible).donnees[survol.index].disponibilite)}
                        </p>
                      </>
                    )}
                    {donneesAffichees(cible).donnees[survol.index].indisponibleMin > 0 && (
                      <p className="text-gray-700">{t('uptimeDowntime', { m: donneesAffichees(cible).donnees[survol.index].indisponibleMin })}</p>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-[11px] text-gray-500 mt-1">
                  <span>
                    {donneesAffichees(cible).estHeures ? '00:00' : t('uptimeDaysAgo', { n: donneesAffichees(cible).donnees.length })}
                  </span>
                  <span>{donneesAffichees(cible).estHeures ? '23:00' : t('uptimeToday')}</span>
                </div>
              </div>
            )}

            {cible.incidents.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setOuverte(ouverte === cible.cle ? null : cible.cle)}
                  aria-expanded={ouverte === cible.cle}
                  className="text-sm text-gray-700 hover:text-gray-900 flex items-center gap-1"
                >
                  <ChevronDown size={16} className={`transition-transform ${ouverte === cible.cle ? '' : '-rotate-90'}`} />
                  {t('uptimeIncidents', { n: cible.incidents.length })}
                </button>
                {ouverte === cible.cle && (
                  <ul className="mt-2 divide-y divide-gray-100 text-sm">
                    {cible.incidents.map((incident) => (
                      <li key={incident.debut} className="py-2 flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-gray-800 wrap-break-word">{incident.cause}</p>
                          <p className="text-xs text-gray-500">
                            {dateHeure(incident.debut)} → {incident.fin ? dateHeure(incident.fin) : t('uptimeOngoing')}
                          </p>
                        </div>
                        <span className={`tabular-nums ${incident.fin ? 'text-gray-700' : 'text-red-600'}`}>{duree(incident.dureeS)}</span>
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
