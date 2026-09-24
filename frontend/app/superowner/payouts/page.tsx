'use client';

/**
 * Les versements aux livreurs.
 *
 * Les gains d'un livreur s'accumulaient sans que rien ne les paie : la
 * plateforme ne savait ni combien elle devait, ni à qui. Elle arrête ici les
 * relevés d'une période, puis les marque versés.
 */

import { useCallback, useEffect, useState } from 'react';
import { Banknote, CalendarRange, Check, FileText, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { useDonneesModifiees } from '@/lib/temps-reel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Releve {
  id: string;
  driverId: string;
  driverName: string;
  driverEmail: string;
  periodStart: string;
  periodEnd: string;
  deliveryCount: number;
  amount: number;
  status: string;
  methodLibelle: string;
  reference: string | null;
  paidAt: string | null;
  note: string | null;
}

interface Reste {
  montant: number;
  courses: number;
  livreurs: number;
}

const jour = (date: string) => new Date(date).toLocaleDateString('fr-FR');

/** La borne de fin est exclue : on l'affiche comme la veille. */
const periode = (releve: Releve) => {
  const fin = new Date(releve.periodEnd);
  fin.setDate(fin.getDate() - 1);

  return `du ${jour(releve.periodStart)} au ${fin.toLocaleDateString('fr-FR')}`;
};

/**
 * Une date au format que réclame un `<input type="date">`.
 *
 * Par les parties locales, jamais par `toISOString()` : minuit à Paris est
 * 23 h la veille en UTC, et la période proposée reculerait d'un jour.
 */
const pourChamp = (date: string) => {
  const d = new Date(date);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

export default function VersementsPage() {
  const t = useTranslations('superownerPayouts');
  const tCommon = useTranslations('common');
  
  const [releves, setReleves] = useState<Releve[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [totaux, setTotaux] = useState<Record<string, number>>({});
  const [reste, setReste] = useState<Reste | null>(null);
  const [filtre, setFiltre] = useState('PENDING');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');

  const [bornes, setBornes] = useState({ debut: '', fin: '' });
  const [versement, setVersement] = useState<{ id: string; method: string; reference: string } | null>(
    null
  );

  const jeton = () => localStorage.getItem('accessToken');

  // silencieux : une relecture en direct garde la page affichée.
  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true);
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/payouts?status=${filtre}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (!reponse.ok) throw new Error(t('loadError'));

      const lu = await reponse.json();
      setReleves(lu.payouts || []);
      setComptes(lu.counts || {});
      setTotaux(lu.totals || {});
      setReste(lu.reste || null);

      // La période proposée est la semaine écoulée : sans elle, il faudrait la
      // ressaisir à chaque arrêté.
      setBornes((actuelles) =>
        actuelles.debut
          ? actuelles
          : {
              debut: pourChamp(lu.periodeProposee.periodStart),
              fin: pourChamp(lu.periodeProposee.periodEnd),
            }
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setChargement(false);
    }
  }, [filtre, t, tCommon]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Une course livrée grossit ce qui est dû ; un versement payé ou annulé
  // par un collègue change de colonne : la page suit.
  useDonneesModifiees(['payouts', 'orders', 'drivers'], () => charger(true), { delaiMs: 1500 });

  const agir = async (chemin: string, corps?: unknown) => {
    setErreur('');
    setMessage('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/payouts${chemin}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify(corps ?? {}),
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('actionFailed'));
        return false;
      }

      if (lu?.message) setMessage(lu.message);

      await charger();
      return true;
    } catch {
      setErreur(t('connectionError'));
      return false;
    }
  };

  const arreter = async () => {
    if (!bornes.debut || !bornes.fin) {
      setErreur(t('requireBothDates'));
      return;
    }

    await agir('/draw', {
      periodStart: new Date(bornes.debut).toISOString(),
      // La borne de fin est exclue : on prend le lendemain du jour saisi pour
      // que la journée de fin soit bien comprise.
      periodEnd: new Date(bornes.fin).toISOString(),
    });
  };

  const verser = async () => {
    if (!versement) return;

    const ok = await agir(`/${versement.id}/pay`, {
      method: versement.method,
      reference: versement.reference,
    });

    if (ok) setVersement(null);
  };

  const annuler = async (releve: Releve) => {
    const raison = window.prompt(t('cancelReason'));

    if (!raison) return;

    await agir(`/${releve.id}/cancel`, { raison });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Banknote className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">
          {t('subtitle')}
        </p>
      </div>

      {erreur && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur}
        </div>
      )}

      {message && (
        <div role="status" className="p-4 bg-green-900/20 text-green-300 rounded-lg border border-green-500/20">
          {message}
        </div>
      )}

      {/* Ce que la plateforme doit et qui n'est porté par aucun relevé : le
          chiffre qui n'existait nulle part. */}
      {reste && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-2">{t('restAmount')}</p>
            <p className="text-3xl font-bold text-amber-300">{euro(reste.montant)}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-2">{t('unpaidDeliveries')}</p>
            <p className="text-3xl font-bold text-white">{reste.courses}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-2">{t('concernedDrivers')}</p>
            <p className="text-3xl font-bold text-white">{reste.livreurs}</p>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <CalendarRange size={18} className="text-orange-500" />
          {t('drawPeriod')}
        </h2>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="periode-debut" className="block text-sm text-gray-400 mb-1">
              {t('from')}
            </label>
            <input
              id="periode-debut"
              type="date"
              value={bornes.debut}
              onChange={(e) => setBornes({ ...bornes, debut: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label htmlFor="periode-fin" className="block text-sm text-gray-400 mb-1">
              {t('toExcluded')}
            </label>
            <input
              id="periode-fin"
              type="date"
              value={bornes.fin}
              onChange={(e) => setBornes({ ...bornes, fin: e.target.value })}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
            />
          </div>

          <button
            onClick={arreter}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium transition"
          >
            {t('drawButton')}
          </button>
        </div>

        <p className="text-xs text-gray-500">
          {t('drawExplanation')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filterPayouts')}>
        {[
          { valeur: 'PENDING', key: 'statusPending' },
          { valeur: 'PAID', key: 'statusPaid' },
          { valeur: 'CANCELLED', key: 'statusCancelled' },
          { valeur: 'ALL', key: 'statusAll' },
        ].map((etat) => (
          <button
            key={etat.valeur}
            onClick={() => setFiltre(etat.valeur)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              filtre === etat.valeur
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t(etat.key)}
            {comptes[etat.valeur] !== undefined && (
              <span className="ml-2 text-xs opacity-75">{comptes[etat.valeur]}</span>
            )}
            {totaux[etat.valeur] !== undefined && (
              <span className="ml-2 text-xs opacity-75">· {euro(totaux[etat.valeur])}</span>
            )}
          </button>
        ))}
      </div>

      {chargement ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : releves.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <p className="text-gray-400">{t('noPayouts')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {releves.map((releve) => (
            <div key={releve.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText size={16} className="text-gray-500 flex-shrink-0" />
                    <h3 className="text-white font-semibold">{releve.driverName}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        releve.status === 'PAID'
                          ? 'bg-green-500/20 text-green-300'
                          : releve.status === 'CANCELLED'
                            ? 'bg-gray-700 text-gray-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {releve.status === 'PAID'
                        ? t('statusPaid')
                        : releve.status === 'CANCELLED'
                          ? t('statusCancelled')
                          : t('statusPending')}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400">{releve.driverEmail}</p>

                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{periode(releve)}</span>
                    <span>
                      {releve.deliveryCount} {releve.deliveryCount > 1 ? t('deliveries_plural') : t('delivery')}
                    </span>
                    {releve.paidAt && (
                      <span>
                        {t('paidOn')} {jour(releve.paidAt)}
                        {releve.methodLibelle ? ` · ${releve.methodLibelle}` : ''}
                        {releve.reference ? ` · ${releve.reference}` : ''}
                      </span>
                    )}
                  </div>

                  {releve.note && releve.status === 'CANCELLED' && (
                    <p className="text-xs text-gray-400 mt-2">{t('cancelReason')}: {releve.note}</p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-2xl font-bold text-white">{euro(releve.amount)}</p>

                  {releve.status === 'PENDING' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() =>
                          setVersement({ id: releve.id, method: 'BANK_TRANSFER', reference: '' })
                        }
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition"
                      >
                        <Check size={14} />
                        {t('markPaid')}
                      </button>
                      <button
                        onClick={() => annuler(releve)}
                        aria-label={t('cancelPayout', { driver: releve.driverName })}
                        className="p-1.5 rounded bg-red-600/20 text-red-300 hover:bg-red-600/40"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {versement?.id === releve.id && (
                <div className="border-t border-gray-700 mt-4 pt-4 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label
                        htmlFor={`moyen-${releve.id}`}
                        className="block text-sm text-gray-400 mb-1"
                      >
                        {t('method')}
                      </label>
                      <select
                        id={`moyen-${releve.id}`}
                        value={versement.method}
                        onChange={(e) => setVersement({ ...versement, method: e.target.value })}
                        className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      >
                        <option value="BANK_TRANSFER">{t('methodBankTransfer')}</option>
                        <option value="CASH">{t('methodCash')}</option>
                        <option value="OTHER">{t('methodOther')}</option>
                      </select>
                    </div>

                    <div className="flex-1 min-w-[12rem]">
                      <label
                        htmlFor={`reference-${releve.id}`}
                        className="block text-sm text-gray-400 mb-1"
                      >
                        {t('reference')}
                      </label>
                      <input
                        id={`reference-${releve.id}`}
                        value={versement.reference}
                        onChange={(e) => setVersement({ ...versement, reference: e.target.value })}
                        placeholder={t('referencePlaceholder')}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      />
                    </div>

                    <button
                      onClick={verser}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm font-medium transition"
                    >
                      {t('confirmPayout')}
                    </button>

                    <button
                      onClick={() => setVersement(null)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
                    >
                      {tCommon('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
