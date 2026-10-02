'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  Gauge,
  MemoryStick,
  MonitorSmartphone,
  Radio,
  RefreshCw,
  Server,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { GraphiqueColonnes } from '@/components/GraphiqueColonnes';
import { DisponibiliteSite } from '@/components/DisponibiliteSite';

/**
 * Le site en fonctionnement, en direct.
 *
 * La page Santé note la plateforme d'après la base (sauvegardes, courses,
 * webhooks). Celle-ci montre ce qui se passe en ce moment : trafic, erreurs,
 * temps de réponse, état du serveur, dépendances, tâches de fond, et les
 * erreurs vécues par les visiteurs dans leur navigateur.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const RAFRAICHISSEMENT_MS = 10_000;

type Statut = 'OK' | 'DEGRADE' | 'PANNE';
type EtatDependance = 'OK' | 'ATTENTION' | 'PANNE' | 'NON_CONFIGURE';
type EtatTache = 'OK' | 'ATTENTION' | 'RETARD' | 'PANNE';

interface Fenetre {
  requetes: number;
  requetesParMinute: number;
  erreurs4xx: number;
  erreurs5xx: number;
  tauxErreur5xx: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  erreursNavigateur: number;
}

interface Incident {
  cle: string;
  niveau: 'ATTENTION' | 'CRITIQUE';
  titre: string;
  detail: string;
  ouvertLe: string;
  resoluLe?: string;
}

interface Instantane {
  statut: Statut;
  dernierPassage: string | null;
  alertes: { courriel: boolean; webhook: boolean; adressesSupplementaires: number };
  incidents: { ouverts: Incident[]; historique: Incident[] };
  trafic: {
    cinqMinutes: Fenetre;
    uneHeure: Fenetre;
    serie: {
      debut: string;
      requetes: number;
      erreurs4xx: number;
      erreurs5xx: number;
      p95Ms: number;
      erreursNavigateur: number;
    }[];
  };
  processus: {
    demarreLe: string;
    dureeFonctionnementS: number;
    versionNode: string;
    hote: string;
    environnement: string;
    cpuPourcent: number;
    memoire: { residenteMo: number; tasUtiliseMo: number; tasLimiteMo: number; tasPourcent: number };
    boucle: { p99Ms: number; maxMs: number };
    systeme: {
      charge: number[];
      coeurs: number;
      memoireLibreMo: number;
      memoireTotaleMo: number;
      disque: { libreMo: number; totaleMo: number; utiliseMo: number; pourcentUtilise: number };
    };
  };
  tempsReel: { connexions: number; redis: { configure: boolean; relie: boolean; pret: boolean } };
  dependances: { cle: string; libelle: string; etat: EtatDependance; detail: string }[];
  taches: {
    cle: string;
    libelle: string;
    intervalleMs: number;
    etat: EtatTache;
    enCours: boolean;
    executions: number;
    echecs: number;
    derniereFin: string | null;
    derniereDureeMs: number | null;
    derniereErreur: string | null;
  }[];
  routes: {
    route: string;
    requetes: number;
    erreurs4xx: number;
    erreurs5xx: number;
    tauxErreur5xx: number;
    moyenneMs: number;
    p95Ms: number;
    maxMs: number;
  }[];
  erreurs: {
    serveur: { instant: string; route: string; statut: number; message: string; pile?: string }[];
    navigateur: {
      empreinte: string;
      message: string;
      source?: string;
      page: string;
      pile?: string;
      navigateur?: string;
      occurrences: number;
      premiereFois: string;
      derniereFois: string;
    }[];
  };
}

type TriRoutes = 'requetes' | 'p95Ms' | 'erreurs5xx';

const TEINTE_ETAT: Record<string, string> = {
  OK: 'text-green-600',
  ATTENTION: 'text-amber-600',
  RETARD: 'text-amber-600',
  DEGRADE: 'text-amber-600',
  PANNE: 'text-red-600',
  CRITIQUE: 'text-red-600',
  NON_CONFIGURE: 'text-gray-500',
};

function IconeEtat({ etat, taille = 18 }: { etat: string; taille?: number }) {
  if (etat === 'OK') return <CheckCircle2 size={taille} className="text-green-600" />;
  if (etat === 'PANNE' || etat === 'CRITIQUE') return <XCircle size={taille} className="text-red-600" />;
  if (etat === 'NON_CONFIGURE') return <span className="inline-block w-[18px] text-center text-gray-500">–</span>;
  return <AlertTriangle size={taille} className="text-amber-600" />;
}

function Section({ titre, icone, children, action }: { titre: string; icone?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
        <h2 className="font-semibold flex items-center gap-2">
          {icone}
          {titre}
        </h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Tuile({ libelle, valeur, detail, alerte, icone }: { libelle: string; valeur: string; detail?: string; alerte?: 'ATTENTION' | 'PANNE'; icone: ReactNode }) {
  const bord = alerte === 'PANNE' ? 'border-red-200' : alerte === 'ATTENTION' ? 'border-amber-200' : 'border-gray-200';
  const teinte = alerte === 'PANNE' ? 'text-red-600' : alerte === 'ATTENTION' ? 'text-amber-600' : 'text-gray-900';
  return (
    <div className={`bg-white border ${bord} rounded-lg p-4`}>
      <p className="text-xs uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
        {icone}
        {libelle}
      </p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${teinte}`}>{valeur}</p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </div>
  );
}

export default function SurveillancePage() {
  const t = useTranslations('superownerMonitoring');
  const locale = useLocale();
  const formatLocal = locale === 'en' ? 'en-US' : 'fr-FR';

  const [donnees, setDonnees] = useState<Instantane | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [auto, setAuto] = useState(true);
  const [tri, setTri] = useState<TriRoutes>('requetes');
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [disponibiliteOuverte, setDisponibiliteOuverte] = useState(true);
  const [slaOuvert, setSlaOuvert] = useState(true);

  const charger = useCallback(
    async (relever = false) => {
      setChargement(true);
      try {
        const jeton = localStorage.getItem('accessToken');
        const reponse = await fetch(`${API_URL}/api/superowner/monitoring${relever ? '/releve' : ''}`, {
          method: relever ? 'POST' : 'GET',
          headers: { Authorization: `Bearer ${jeton}` },
        });
        const corps = await reponse.json();
        if (!reponse.ok) {
          setErreur(corps.error || t('loadError'));
          return;
        }
        setDonnees(corps.data);
        setErreur('');
      } catch {
        setErreur(t('serverUnreachable'));
      } finally {
        setChargement(false);
      }
    },
    [t]
  );

  useEffectChargement(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (!auto) return;
    const minuteur = setInterval(() => {
      // Onglet caché : inutile de solliciter le serveur.
      if (document.visibilityState === 'visible') charger();
    }, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuteur);
  }, [auto, charger]);

  const heure = useCallback(
    (iso: string | null | undefined) =>
      iso ? new Date(iso).toLocaleTimeString(formatLocal, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—',
    [formatLocal]
  );
  const dateHeure = useCallback(
    (iso: string) => new Date(iso).toLocaleString(formatLocal, { dateStyle: 'short', timeStyle: 'medium' }),
    [formatLocal]
  );

  const duree = (secondes: number) => {
    const j = Math.floor(secondes / 86400);
    const h = Math.floor((secondes % 86400) / 3600);
    const m = Math.floor((secondes % 3600) / 60);
    if (j > 0) return t('durationDays', { d: j, h });
    if (h > 0) return t('durationHours', { h, m });
    return t('durationMinutes', { m });
  };

  const intervalle = (ms: number) => (ms >= 3600000 ? `${ms / 3600000} h` : ms >= 60000 ? `${ms / 60000} min` : `${ms / 1000} s`);

  const colonnes = useMemo(() => {
    if (!donnees) return { requetes: [], p95: [], erreurs: [] };
    const serie = donnees.trafic.serie;
    const libelle = (iso: string, i: number) =>
      // Une graduation tous les quarts d'heure : soixante libellés seraient illisibles.
      i % 15 === 0 || i === serie.length - 1 ? heure(iso).slice(0, 5) : '';
    return {
      requetes: serie.map((m, i) => ({
        label: libelle(m.debut, i),
        labelComplet: heure(m.debut).slice(0, 5),
        valeur: m.requetes,
        details: [t('chartErrors4xx', { n: m.erreurs4xx }), t('chartErrors5xx', { n: m.erreurs5xx })],
      })),
      p95: serie.map((m, i) => ({
        label: libelle(m.debut, i),
        labelComplet: heure(m.debut).slice(0, 5),
        valeur: m.p95Ms,
      })),
      erreurs: serie.map((m, i) => ({
        label: libelle(m.debut, i),
        labelComplet: heure(m.debut).slice(0, 5),
        valeur: m.erreurs5xx + m.erreursNavigateur,
        details: [t('chartErrors5xx', { n: m.erreurs5xx }), t('chartBrowserErrors', { n: m.erreursNavigateur })],
      })),
    };
  }, [donnees, heure, t]);

  const routesTriees = useMemo(
    () => [...(donnees?.routes ?? [])].sort((a, b) => b[tri] - a[tri]),
    [donnees, tri]
  );

  const STATUTS: Record<Statut, { libelle: string; fond: string }> = {
    OK: { libelle: t('statusOk'), fond: 'bg-green-50 border-green-200' },
    DEGRADE: { libelle: t('statusDegraded'), fond: 'bg-amber-50 border-amber-200' },
    PANNE: { libelle: t('statusDown'), fond: 'bg-red-50 border-red-200' },
  };

  const ETATS_TACHE: Record<EtatTache, string> = {
    OK: t('taskOk'),
    ATTENTION: t('taskWarning'),
    RETARD: t('taskLate'),
    PANNE: t('taskDown'),
  };

  const cinq = donnees?.trafic.cinqMinutes;
  const processus = donnees?.processus;

  return (
    // Une grille à colonne `minmax(0, 1fr)` : les tableaux larges défilent
    // dans leur cadre au lieu d'élargir toute la page sur un téléphone.
    <div className="grid grid-cols-1 gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link href="/superowner" aria-label={t('back')} title={t('back')} className="p-2 hover:bg-white rounded-lg transition">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Radio size={28} className="text-red-500" />
              {t('title')}
            </h1>
            <p className="text-gray-500 text-sm mt-1">{t('subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-orange-600" />
            {t('autoRefresh')}
          </label>
          <button
            type="button"
            onClick={() => charger(true)}
            disabled={chargement}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg transition disabled:opacity-60"
          >
            <RefreshCw size={16} className={chargement ? 'animate-spin' : ''} />
            {t('checkNow')}
          </button>
        </div>
      </div>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">{erreur}</div>}

      {!donnees && chargement && <p className="text-gray-500">{t('loading')}</p>}

      {donnees && cinq && processus && (
        <>
          {/* Le verdict, d'un coup d'œil */}
          <section className={`border rounded-lg p-5 ${STATUTS[donnees.statut].fond}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <IconeEtat etat={donnees.statut === 'DEGRADE' ? 'ATTENTION' : donnees.statut} taille={28} />
              <p className={`text-2xl font-bold ${TEINTE_ETAT[donnees.statut]}`}>{STATUTS[donnees.statut].libelle}</p>
              <p className="text-sm text-gray-500 ml-auto">
                {t('lastCheck', { time: heure(donnees.dernierPassage) })}
              </p>
            </div>

            {donnees.incidents.ouverts.length > 0 && (
              <ul className="mt-4 space-y-2">
                {donnees.incidents.ouverts.map((incident) => (
                  <li key={incident.cle} className="flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <IconeEtat etat={incident.niveau} />
                    <div className="min-w-0">
                      <p className={`font-semibold ${TEINTE_ETAT[incident.niveau]}`}>{incident.titre}</p>
                      <p className="text-sm text-gray-700 break-words">{incident.detail}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('openedAt', { time: dateHeure(incident.ouvertLe) })}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-gray-500 mt-3">
              {donnees.alertes.courriel || donnees.alertes.webhook
                ? t('alertsOn', {
                    channels: [
                      donnees.alertes.courriel ? t('alertChannelEmail') : null,
                      donnees.alertes.webhook ? t('alertChannelWebhook') : null,
                    ]
                      .filter(Boolean)
                      .join(' + '),
                  })
                : t('alertsOff')}
            </p>
          </section>

          {/* Dans la durée : l'historique survit aux redémarrages. */}
          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setDisponibiliteOuverte(!disponibiliteOuverte)}
              className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-200 hover:bg-gray-50 transition"
              aria-expanded={disponibiliteOuverte}
            >
              <h2 className="font-semibold flex items-center gap-2">
                <Clock size={18} className="text-gray-500" />
                {t('uptimeTitle')}
              </h2>
              <ChevronDown
                size={20}
                className={`text-gray-500 transition-transform ${disponibiliteOuverte ? '' : '-rotate-90'}`}
              />
            </button>
            {disponibiliteOuverte && (
              <div className="p-5">
                <DisponibiliteSite />
              </div>
            )}
          </section>

          {/* SLA Summary */}
          {donnees && (
            <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setSlaOuvert(!slaOuvert)}
                className="w-full flex items-center justify-between px-5 py-3 border-b border-gray-200 hover:bg-gray-50 transition"
                aria-expanded={slaOuvert}
              >
                <h2 className="font-semibold flex items-center gap-2">
                  <Gauge size={18} className="text-gray-500" />
                  {t('slaTitle')}
                </h2>
                <ChevronDown
                  size={20}
                  className={`text-gray-500 transition-transform ${slaOuvert ? '' : '-rotate-90'}`}
                />
              </button>
              {slaOuvert && (
                <div className="p-5 space-y-4">
                  <p className="text-sm text-gray-700">{t('slaIntro')}</p>
                  <div className="pt-3 border-t border-gray-200">
                    <h3 className="text-xs font-semibold text-gray-500 mb-2">{t('slaThresholds')}</h3>
                    {/* Mêmes seuils que les teintes de DisponibiliteSite. */}
                    <ul className="space-y-1 text-xs text-gray-500">
                      <li className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-green-500 rounded-sm"></span>
                        <span>{t('slaGreen')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-amber-500 rounded-sm"></span>
                        <span>{t('slaAmber')}</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 bg-red-500 rounded-sm"></span>
                        <span>{t('slaRed')}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Les chiffres qui comptent */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tuile icone={<Zap size={14} />} libelle={t('kpiRequests')} valeur={`${cinq.requetesParMinute}`} detail={t('kpiRequestsDetail', { n: cinq.requetes })} />
            <Tuile
              icone={<XCircle size={14} />}
              libelle={t('kpiErrorRate')}
              valeur={`${cinq.tauxErreur5xx} %`}
              detail={t('kpiErrorRateDetail', { n5: cinq.erreurs5xx, n4: cinq.erreurs4xx })}
              alerte={cinq.tauxErreur5xx >= 10 ? 'PANNE' : cinq.tauxErreur5xx >= 2 ? 'ATTENTION' : undefined}
            />
            <Tuile
              icone={<Gauge size={14} />}
              libelle={t('kpiLatency')}
              valeur={`${cinq.p95Ms} ms`}
              detail={t('kpiLatencyDetail', { p50: cinq.p50Ms, p99: cinq.p99Ms })}
              alerte={cinq.p95Ms >= 5000 ? 'PANNE' : cinq.p95Ms >= 1500 ? 'ATTENTION' : undefined}
            />
            <Tuile
              icone={<MonitorSmartphone size={14} />}
              libelle={t('kpiBrowserErrors')}
              valeur={`${cinq.erreursNavigateur}`}
              detail={t('kpiBrowserErrorsDetail')}
              alerte={cinq.erreursNavigateur >= 25 ? 'ATTENTION' : undefined}
            />
            <Tuile
              icone={<Radio size={14} />}
              libelle={t('kpiSockets')}
              valeur={`${donnees.tempsReel.connexions}`}
              detail={donnees.tempsReel.redis.relie ? t('kpiSocketsRedis') : t('kpiSocketsSingle')}
            />
            <Tuile icone={<Clock size={14} />} libelle={t('kpiUptime')} valeur={duree(processus.dureeFonctionnementS)} detail={t('kpiUptimeDetail', { date: dateHeure(processus.demarreLe) })} />
          </div>

          {/* L'heure écoulée */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <GraphiqueColonnes clair
              titre={t('chartRequests')}
              colonnes={colonnes.requetes}
              format={(v) => `${v}`}
              mesure={t('chartRequestsUnit')}
              messageVide={t('chartEmpty')}
              hauteur={150}
            />
            <GraphiqueColonnes clair
              titre={t('chartLatency')}
              colonnes={colonnes.p95}
              format={(v) => `${v} ms`}
              mesure="p95"
              messageVide={t('chartEmpty')}
              hauteur={150}
            />
            <GraphiqueColonnes clair
              titre={t('chartErrors')}
              colonnes={colonnes.erreurs}
              format={(v) => `${v}`}
              mesure={t('chartErrorsUnit')}
              messageVide={t('chartNoErrors')}
              hauteur={150}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Le serveur */}
            <Section titre={t('serverTitle')} icone={<Server size={18} className="text-gray-500" />}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-500 flex items-center gap-1.5"><Cpu size={14} />{t('cpu')}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{processus.cpuPourcent} %</dd>
                </div>
                <div>
                  <dt className="text-gray-500 flex items-center gap-1.5"><MemoryStick size={14} />{t('heap')}</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${processus.memoire.tasPourcent >= 85 ? 'text-amber-600' : ''}`}>
                    {processus.memoire.tasUtiliseMo} / {processus.memoire.tasLimiteMo} Mo
                  </dd>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${processus.memoire.tasPourcent >= 85 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, processus.memoire.tasPourcent)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <dt className="text-gray-500">{t('rss')}</dt>
                  <dd className="font-semibold tabular-nums">{processus.memoire.residenteMo} Mo</dd>
                </div>
                <div>
                  <dt className="text-gray-500 flex items-center gap-1.5"><MemoryStick size={14} />{t('diskSpace')}</dt>
                  <dd className={`text-lg font-semibold tabular-nums ${processus.systeme.disque.pourcentUtilise >= 85 ? 'text-amber-600' : ''}`}>
                    {processus.systeme.disque.libreMo} / {processus.systeme.disque.totaleMo} Mo
                  </dd>
                  <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${processus.systeme.disque.pourcentUtilise >= 85 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, processus.systeme.disque.pourcentUtilise)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <dt className="text-gray-500">{t('load')}</dt>
                  <dd className="font-semibold tabular-nums">
                    {processus.systeme.charge.join(' · ')} <span className="text-gray-500 font-normal">({t('cores', { n: processus.systeme.coeurs })})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('eventLoop')}</dt>
                  <dd className={`font-semibold tabular-nums ${processus.boucle.p99Ms >= 200 ? 'text-amber-600' : ''}`}>
                    {t('eventLoopValue', { p99: processus.boucle.p99Ms, max: processus.boucle.maxMs })}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('systemMemory')}</dt>
                  <dd className="font-semibold tabular-nums">
                    {t('systemMemoryValue', { free: processus.systeme.memoireLibreMo, total: processus.systeme.memoireTotaleMo })}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-gray-500 mt-4">
                {processus.hote} · Node {processus.versionNode} · {processus.environnement}
              </p>
            </Section>

            {/* Les services dont le site dépend */}
            <Section titre={t('dependenciesTitle')}>
              <ul className="divide-y divide-gray-100 -my-2">
                {donnees.dependances.map((d) => (
                  <li key={d.cle} className="py-2.5 flex items-start gap-3">
                    <span className="mt-0.5"><IconeEtat etat={d.etat} /></span>
                    <div className="min-w-0">
                      <p className="font-medium">{d.libelle}</p>
                      <p className={`text-sm break-words ${d.etat === 'OK' ? 'text-gray-500' : TEINTE_ETAT[d.etat]}`}>{d.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {/* Les tâches de fond */}
          <Section titre={t('tasksTitle')}>
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="font-medium px-5 py-2">{t('taskName')}</th>
                    <th className="font-medium px-3 py-2">{t('taskState')}</th>
                    <th className="font-medium px-3 py-2">{t('taskEvery')}</th>
                    <th className="font-medium px-3 py-2">{t('taskLastRun')}</th>
                    <th className="font-medium px-3 py-2 text-right">{t('taskDuration')}</th>
                    <th className="font-medium px-5 py-2 text-right">{t('taskRuns')}</th>
                  </tr>
                </thead>
                <tbody>
                  {donnees.taches.map((tache) => (
                    <tr key={tache.cle} className="border-t border-gray-200 align-top">
                      <td className="px-5 py-2.5">
                        <p className="font-medium">{tache.libelle}</p>
                        {tache.derniereErreur && tache.etat !== 'OK' && (
                          <p className="text-xs text-red-700 mt-0.5 break-words">{tache.derniereErreur}</p>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 whitespace-nowrap ${TEINTE_ETAT[tache.etat]}`}>
                        {tache.enCours ? t('taskRunning') : ETATS_TACHE[tache.etat]}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">{intervalle(tache.intervalleMs)}</td>
                      <td className="px-3 py-2.5 text-gray-700 tabular-nums">{tache.derniereFin ? heure(tache.derniereFin) : t('taskNever')}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700 tabular-nums">{tache.derniereDureeMs != null ? `${tache.derniereDureeMs} ms` : '—'}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {tache.executions}
                        {tache.echecs > 0 && <span className="text-red-600"> ({t('taskFailures', { n: tache.echecs })})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Les routes */}
          <Section
            titre={t('routesTitle')}
            action={
              <div className="flex gap-1 text-xs" role="group" aria-label={t('routesSort')}>
                {(
                  [
                    ['requetes', t('routesSortVolume')],
                    ['p95Ms', t('routesSortSlow')],
                    ['erreurs5xx', t('routesSortErrors')],
                  ] as [TriRoutes, string][]
                ).map(([cle, libelle]) => (
                  <button
                    key={cle}
                    type="button"
                    onClick={() => setTri(cle)}
                    aria-pressed={tri === cle}
                    className={`px-2.5 py-1 rounded ${tri === cle ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            }
          >
            {routesTriees.length === 0 ? (
              <p className="text-gray-500 text-sm">{t('routesEmpty')}</p>
            ) : (
              <div className="overflow-x-auto -mx-5 max-h-[28rem] overflow-y-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-gray-500">
                      <th className="font-medium px-5 py-2">{t('routesRoute')}</th>
                      <th className="font-medium px-3 py-2 text-right">{t('routesCount')}</th>
                      <th className="font-medium px-3 py-2 text-right">5xx</th>
                      <th className="font-medium px-3 py-2 text-right">4xx</th>
                      <th className="font-medium px-3 py-2 text-right">{t('routesAvg')}</th>
                      <th className="font-medium px-3 py-2 text-right">p95</th>
                      <th className="font-medium px-5 py-2 text-right">max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routesTriees.map((r) => (
                      <tr key={r.route} className="border-t border-gray-200">
                        <td className="px-5 py-2 font-mono text-xs text-gray-800 break-all">{r.route}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.requetes}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.erreurs5xx > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {r.erreurs5xx}
                          {r.erreurs5xx > 0 && <span className="text-xs"> ({r.tauxErreur5xx} %)</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.erreurs4xx}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.moyenneMs} ms</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.p95Ms >= 1500 ? 'text-amber-600' : ''}`}>{r.p95Ms} ms</td>
                        <td className="px-5 py-2 text-right tabular-nums text-gray-500">{r.maxMs} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3">{t('routesNote')}</p>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Pannes serveur */}
            <Section titre={t('serverErrorsTitle', { n: donnees.erreurs.serveur.length })}>
              {donnees.erreurs.serveur.length === 0 ? (
                <p className="text-sm text-gray-500">{t('serverErrorsEmpty')}</p>
              ) : (
                <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {donnees.erreurs.serveur.map((e, i) => {
                    const cle = `s-${i}-${e.instant}`;
                    return (
                      <li key={cle} className="bg-gray-50 rounded-lg px-3 py-2">
                        <button type="button" className="w-full text-left" onClick={() => setOuverte(ouverte === cle ? null : cle)} aria-expanded={ouverte === cle}>
                          <p className="text-xs text-gray-500 tabular-nums">
                            {dateHeure(e.instant)} · <span className="text-red-600">{e.statut}</span> · <span className="font-mono">{e.route}</span>
                          </p>
                          <p className="text-sm text-red-800 break-words">{e.message}</p>
                        </button>
                        {ouverte === cle && e.pile && (
                          <pre className="mt-2 text-[11px] text-gray-500 whitespace-pre-wrap break-all">{e.pile}</pre>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* Erreurs navigateur */}
            <Section titre={t('browserErrorsTitle', { n: donnees.erreurs.navigateur.length })}>
              {donnees.erreurs.navigateur.length === 0 ? (
                <p className="text-sm text-gray-500">{t('browserErrorsEmpty')}</p>
              ) : (
                <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
                  {donnees.erreurs.navigateur.map((e) => {
                    const cle = `n-${e.empreinte}`;
                    return (
                      <li key={cle} className="bg-gray-50 rounded-lg px-3 py-2">
                        <button type="button" className="w-full text-left" onClick={() => setOuverte(ouverte === cle ? null : cle)} aria-expanded={ouverte === cle}>
                          <p className="text-xs text-gray-500">
                            <span className="text-amber-600 font-semibold">×{e.occurrences}</span> · {t('lastSeen', { time: dateHeure(e.derniereFois) })} ·{' '}
                            <span className="font-mono">{e.page}</span>
                          </p>
                          <p className="text-sm text-amber-800 break-words">{e.message}</p>
                        </button>
                        {ouverte === cle && (
                          <div className="mt-2 text-[11px] text-gray-500 space-y-1">
                            {e.source && <p className="font-mono break-all">{e.source}</p>}
                            {e.navigateur && <p className="break-all">{e.navigateur}</p>}
                            <p>{t('firstSeen', { time: dateHeure(e.premiereFois) })}</p>
                            {e.pile && <pre className="whitespace-pre-wrap break-all">{e.pile}</pre>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>

          {/* Les incidents passés */}
          <Section titre={t('historyTitle')}>
            {donnees.incidents.historique.length === 0 ? (
              <p className="text-sm text-gray-500">{t('historyEmpty')}</p>
            ) : (
              <ul className="divide-y divide-gray-100 -my-2">
                {donnees.incidents.historique.map((incident) => (
                  <li key={`${incident.cle}-${incident.ouvertLe}`} className="py-2.5 flex items-start gap-3">
                    <IconeEtat etat={incident.niveau} />
                    <div className="min-w-0">
                      <p className="font-medium">{incident.titre}</p>
                      <p className="text-sm text-gray-500 break-words">{incident.detail}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('historyRange', { from: dateHeure(incident.ouvertLe), to: incident.resoluLe ? dateHeure(incident.resoluLe) : '—' })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <p className="text-sm text-gray-500">
            {t('footerNote')}{' '}
            <Link href="/superowner/health" className="underline hover:text-gray-700">
              {t('footerHealthLink')}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
