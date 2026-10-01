'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Circle, MessageCircle, Phone, RefreshCw, SatelliteDish, Store, User } from 'lucide-react';

import { connexionTempsReel } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type TypeIncident =
  | 'RETARD_RETRAIT'
  | 'ECART_RETRAIT'
  | 'RETARD_LIVRAISON'
  | 'ECART_LIVRAISON'
  | 'COURSE_RETIREE'
  | 'COURSE_ECHOUEE'
  | 'DEPOT_CONTESTE'
  | 'RECLAMATION_CLIENT'
  | 'DEPOT_VALIDE'
  | 'DEPOT_REFUSE';

interface Incident {
  id: string;
  type: TypeIncident;
  phase: 'RETRAIT' | 'LIVRAISON';
  detail: string;
  minutes: number | null;
  distanceKm: number | null;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  resolution: string | null;
  /** Alertes envoyées à la plateforme, première comprise. */
  alertes: number;
  driver: {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    isOnline: boolean;
    gpsLostAt: string | null;
    lastLocationUpdate: string | null;
  };
  course: {
    id: string;
    orderId: string;
    numero: string;
    status: string;
    actions: { retirer: boolean; echec: boolean; depot: boolean };
    /** Le paiement au livreur : REVIEW (suspendu, en examen), REFUSED, ou null. */
    paiement: { blocage: string | null; motif: string | null; surUnReleve: boolean };
    /** Le dépôt en photo, quand la course a été close ainsi. */
    depot: { photo: string | null; note: string | null; le: string | null } | null;
    boutique: { id: string; name: string; phone: string | null } | null;
    client: { nom: string; telephone: string | null; ville: string | null } | null;
    commande: string | null;
  };
}

type Geste = { incidentId: string; type: 'retirer' | 'echec' | 'clore' | 'valider' | 'refuser' };

// Les plus graves en rouge : la commande est partie avec le livreur.
const COULEURS: Record<TypeIncident, string> = {
  RETARD_RETRAIT: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
  ECART_RETRAIT: 'bg-amber-600/20 text-amber-300 border-amber-600/40',
  RETARD_LIVRAISON: 'bg-red-600/20 text-red-300 border-red-600/40',
  ECART_LIVRAISON: 'bg-red-600/20 text-red-300 border-red-600/40',
  COURSE_RETIREE: 'bg-gray-600/30 text-gray-300 border-gray-600/50',
  COURSE_ECHOUEE: 'bg-gray-600/30 text-gray-300 border-gray-600/50',
  DEPOT_CONTESTE: 'bg-red-600/20 text-red-300 border-red-600/40',
  RECLAMATION_CLIENT: 'bg-red-600/20 text-red-300 border-red-600/40',
  DEPOT_VALIDE: 'bg-gray-600/30 text-gray-300 border-gray-600/50',
  DEPOT_REFUSE: 'bg-gray-600/30 text-gray-300 border-gray-600/50',
};

/**
 * Les courses qui dérapent : livreur qui ne vient pas au commerce, qui
 * s'éloigne, livraison en retard. La surveillance retire d'elle-même une
 * course encore au commerce ; une commande déjà dans le sac attend une
 * décision d'ici.
 */
export default function IncidentsLivraisonPage() {
  const t = useTranslations('superownerDeliveryIncidents');
  const [etat, setEtat] = useState<'ouverts' | 'tous'>('ouverts');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [geste, setGeste] = useState<Geste | null>(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  // Course échouée : rembourser le client et suspendre le livreur, cochés d'office.
  const [rembourser, setRembourser] = useState(true);
  const [suspendre, setSuspendre] = useState(true);
  // Ce que la dernière action a donné (remboursement, suspension).
  const [bilan, setBilan] = useState('');
  // L'heure du dernier relevé : « il y a 12 min » se calcule depuis elle.
  const [releveA, setReleveA] = useState(0);

  const charger = useCallback(async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/superowner/delivery-incidents?etat=${etat}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      setIncidents(donnees.data || []);
      setReleveA(Date.now());
      setErreur('');
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('loadError'));
    } finally {
      setChargement(false);
    }
  }, [etat, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Un nouveau constat arrive en direct ; le relevé régulier rattrape un
  // événement perdu (connexion coupée).
  useEffect(() => {
    const socket = connexionTempsReel();
    const surIncident = () => charger();
    socket.on('incident-livraison', surIncident);
    const minuteur = setInterval(charger, 30000);
    return () => {
      socket.off('incident-livraison', surIncident);
      clearInterval(minuteur);
    };
  }, [charger]);

  const ouvrirGeste = (incidentId: string, type: Geste['type']) => {
    setGeste({ incidentId, type });
    setTexte('');
    setErreur('');
    setBilan('');
    setRembourser(true);
    setSuspendre(true);
  };

  const confirmer = async (incident: Incident) => {
    if (!geste) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    const depot = geste.type === 'valider' || geste.type === 'refuser';
    const url =
      geste.type === 'clore'
        ? `${API_URL}/api/superowner/delivery-incidents/${incident.id}/clore`
        : `${API_URL}/api/superowner/delivery-incidents/courses/${incident.course.id}/${depot ? 'depot' : geste.type}`;
    const corps =
      geste.type === 'clore'
        ? { resolution: texte }
        : geste.type === 'echec'
          ? { motif: texte, rembourser, suspendre }
          : geste.type === 'refuser'
            ? { decision: 'REFUSER', motif: texte, rembourser, suspendre }
            : geste.type === 'valider'
              ? { decision: 'VALIDER', motif: texte }
              : { motif: texte };

    setEnvoi(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(corps),
      });
      const donnees = await res.json();
      if (!res.ok) throw new Error(donnees.error);
      if (geste.type === 'valider') setBilan(t('depositValidated'));
      if (geste.type === 'echec' || geste.type === 'refuser') {
        const r = donnees.data;
        setBilan(
          [
            t(`refund.${r.remboursement}`),
            r.suspendu ? t('suspended', { courses: r.coursesRetirees }) : null,
          ]
            .filter(Boolean)
            .join(' ')
        );
      }
      setGeste(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error && e.message ? e.message : t('actionError'));
    } finally {
      setEnvoi(false);
    }
  };

  const depuis = (date: string) => {
    const minutes = Math.max(0, Math.round((releveA - new Date(date).getTime()) / 60000));
    return minutes < 60 ? t('minutesAgo', { minutes }) : t('hoursAgo', { hours: Math.floor(minutes / 60) });
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-orange-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
            <p className="text-gray-400 text-sm">{t('description')}</p>
          </div>
        </div>
        <button
          onClick={() => charger()}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg flex items-center gap-2 text-gray-200 text-sm"
        >
          <RefreshCw size={16} />
          {t('refresh')}
        </button>
      </div>

      <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 text-xs text-gray-400 space-y-1">
        <p>{t('rulePickup')}</p>
        <p>{t('ruleDelivery')}</p>
      </div>

      <div className="flex gap-2">
        {(['ouverts', 'tous'] as const).map((valeur) => (
          <button
            key={valeur}
            onClick={() => setEtat(valeur)}
            className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
              etat === valeur
                ? 'bg-orange-600/20 border-orange-600 text-orange-300'
                : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t(valeur === 'ouverts' ? 'tabOpen' : 'tabAll')}
          </button>
        ))}
      </div>

      {bilan && (
        <div className="bg-green-900/30 border border-green-700/50 text-green-200 rounded-lg p-3 text-sm">{bilan}</div>
      )}

      {erreur && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">{erreur}</div>
      )}

      {chargement ? (
        <p className="text-center text-gray-400 py-8">{t('loading')}</p>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 border border-gray-700 rounded-lg">
          <AlertTriangle size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400">{t(etat === 'ouverts' ? 'emptyOpen' : 'empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => {
            const ouvert = geste?.incidentId === incident.id ? geste : null;
            return (
              <div key={incident.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${COULEURS[incident.type]}`}>
                        {t(`type.${incident.type}`)}
                      </span>
                      <span className="text-sm text-gray-300">
                        {t('order', { numero: incident.course.numero })} · {t(`courseStatus.${incident.course.status}`)}
                      </span>
                      <span className="text-xs text-gray-500">{depuis(incident.createdAt)}</span>
                    </div>
                    <p className="text-white">{incident.detail}</p>
                    {incident.course.actions.depot && incident.course.paiement.surUnReleve && (
                      <p className="text-xs text-amber-300">{t('alreadyOnStatement')}</p>
                    )}
                    {incident.course.paiement.blocage && (
                      <p className="text-xs text-amber-300">
                        {t(`payoutHold.${incident.course.paiement.blocage}`)}
                      </p>
                    )}
                    {incident.course.depot?.photo && (
                      <a href={incident.course.depot.photo} target="_blank" rel="noreferrer" className="inline-block">
                        <img
                          src={incident.course.depot.photo}
                          alt={t('depositPhoto')}
                          className="mt-1 h-32 w-auto max-w-full rounded border border-gray-700 object-cover"
                        />
                      </a>
                    )}
                    {incident.course.depot?.note && (
                      <p className="text-xs text-gray-400">{t('depositNote', { note: incident.course.depot.note })}</p>
                    )}
                    {!incident.closedAt && incident.alertes > 1 && (
                      <p className="text-xs text-red-300">{t('reminders', { count: incident.alertes - 1 })}</p>
                    )}
                    {incident.closedAt && (
                      <p className="text-xs text-green-400">
                        {t('closed', { resolution: incident.resolution || '—' })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="bg-gray-900/40 rounded p-3 space-y-1">
                    <p className="text-gray-400 text-xs uppercase">{t('driver')}</p>
                    <p className="text-white flex items-center gap-2">
                      <Circle
                        size={8}
                        className={incident.driver.isOnline ? 'fill-green-500 text-green-500' : 'fill-gray-500 text-gray-500'}
                      />
                      {incident.driver.name}
                    </p>
                    {incident.driver.status === 'SUSPENDED' && (
                      <p className="text-red-300 text-xs">{t('driverSuspended')}</p>
                    )}
                    {incident.driver.gpsLostAt && (
                      <p className="text-amber-300 text-xs flex items-center gap-1">
                        <SatelliteDish size={12} /> {t('gpsLost')}
                      </p>
                    )}
                    {incident.driver.phone && (
                      <a href={`tel:${incident.driver.phone}`} className="text-orange-300 flex items-center gap-1 hover:underline">
                        <Phone size={12} /> {incident.driver.phone}
                      </a>
                    )}
                    <Link
                      href="/superowner/driver-support"
                      className="text-orange-300 flex items-center gap-1 hover:underline text-xs"
                    >
                      <MessageCircle size={12} /> {t('chat')}
                    </Link>
                  </div>
                  <div className="bg-gray-900/40 rounded p-3 space-y-1">
                    <p className="text-gray-400 text-xs uppercase">{t('store')}</p>
                    <p className="text-white flex items-center gap-2">
                      <Store size={14} /> {incident.course.boutique?.name || '—'}
                    </p>
                    {incident.course.boutique?.phone && (
                      <a
                        href={`tel:${incident.course.boutique.phone}`}
                        className="text-orange-300 flex items-center gap-1 hover:underline"
                      >
                        <Phone size={12} /> {incident.course.boutique.phone}
                      </a>
                    )}
                  </div>
                  <div className="bg-gray-900/40 rounded p-3 space-y-1">
                    <p className="text-gray-400 text-xs uppercase">{t('customer')}</p>
                    <p className="text-white flex items-center gap-2">
                      <User size={14} /> {incident.course.client?.nom || '—'}
                      {incident.course.client?.ville ? ` · ${incident.course.client.ville}` : ''}
                    </p>
                    {incident.course.client?.telephone && (
                      <a
                        href={`tel:${incident.course.client.telephone}`}
                        className="text-orange-300 flex items-center gap-1 hover:underline"
                      >
                        <Phone size={12} /> {incident.course.client.telephone}
                      </a>
                    )}
                  </div>
                </div>

                {ouvert ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-300">{t(`confirm.${ouvert.type}`)}</p>
                    <textarea
                      value={texte}
                      onChange={(e) => setTexte(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder={t(ouvert.type === 'clore' ? 'resolutionPlaceholder' : 'reasonPlaceholder')}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                    {(ouvert.type === 'echec' || ouvert.type === 'refuser') && (
                      <div className="space-y-1 text-sm text-gray-200">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={rembourser} onChange={(e) => setRembourser(e.target.checked)} />
                          {t('optionRefund')}
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={suspendre} onChange={(e) => setSuspendre(e.target.checked)} />
                          {t('optionSuspend')}
                        </label>
                      </div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        disabled={envoi || texte.trim().length < 3}
                        onClick={() => confirmer(incident)}
                        className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white text-sm font-semibold"
                      >
                        {t('confirmButton')}
                      </button>
                      <button
                        onClick={() => setGeste(null)}
                        className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {incident.course.actions.retirer && (
                      <button
                        onClick={() => ouvrirGeste(incident.id, 'retirer')}
                        className="px-3 py-2 rounded-lg bg-amber-600/20 border border-amber-600/50 text-amber-200 hover:bg-amber-600/30 text-sm"
                      >
                        {t('withdraw')}
                      </button>
                    )}
                    {incident.course.actions.echec && (
                      <button
                        onClick={() => ouvrirGeste(incident.id, 'echec')}
                        className="px-3 py-2 rounded-lg bg-red-600/20 border border-red-600/50 text-red-200 hover:bg-red-600/30 text-sm"
                      >
                        {t('fail')}
                      </button>
                    )}
                    {incident.course.actions.depot && (
                      <>
                        <button
                          onClick={() => ouvrirGeste(incident.id, 'valider')}
                          className="px-3 py-2 rounded-lg bg-green-600/20 border border-green-600/50 text-green-200 hover:bg-green-600/30 text-sm"
                        >
                          {t('validateDeposit')}
                        </button>
                        <button
                          onClick={() => ouvrirGeste(incident.id, 'refuser')}
                          className="px-3 py-2 rounded-lg bg-red-600/20 border border-red-600/50 text-red-200 hover:bg-red-600/30 text-sm"
                        >
                          {t('refuseDeposit')}
                        </button>
                      </>
                    )}
                    {!incident.closedAt && !incident.course.actions.depot && (
                      <button
                        onClick={() => ouvrirGeste(incident.id, 'clore')}
                        className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 text-sm"
                      >
                        {t('close')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
