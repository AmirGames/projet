'use client';


import { jetonAcces } from '@/lib/jeton-session';
/**
 * Les versements du lundi : commerçants et livreurs, en un seul fichier SEPA.
 *
 * Chaque lundi 00 h 00 (Bruxelles), la semaine écoulée s'arrête d'elle-même.
 * Ici, la plateforme télécharge le fichier, l'importe dans sa banque (KBC/CBC
 * Business, Isabel…), signe une fois, puis marque le lot versé.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Banknote, Check, Download, RefreshCw } from 'lucide-react';

import { useLocale, useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import ReleveReversement, { type Releve } from '@/components/ReleveReversement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Lot {
  reference: string;
  total: number;
  nombre: number;
  pret: boolean;
  inclus: { commercants: string[]; livreurs: string[] };
  ecartes: { type: string; id: string; nom: string; montant: number; raison: string }[];
}

interface LotBancaire {
  id: string;
  reference: string;
  status: 'PREPARED' | 'APPROVED' | 'EXPORTED' | 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  total: number;
  itemCount: number;
}

interface Ligne {
  id: string;
  organization: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  amount: number;
  status: string;
  ibanFin: string | null;
  ibanValide: boolean;
}

// Libellé de chaque état d'un relevé : `etats.<statut>` des traductions.
const ETATS_CONNUS = ['PENDING', 'PAID', 'CARRIED', 'CANCELLED'];

export default function VersementsSepaPage() {
  const t = useTranslations('versementsSepa');
  const locale = useLocale();
  const periode = (debut: string, fin: string) => {
    const veille = new Date(new Date(fin).getTime() - 1);
    return t('periode', {
      debut: new Date(debut).toLocaleDateString(locale),
      fin: veille.toLocaleDateString(locale),
    });
  };
  const [lot, setLot] = useState<Lot | null>(null);
  const [actif, setActif] = useState<LotBancaire | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [lotErreur, setLotErreur] = useState('');
  const [releves, setReleves] = useState<Ligne[]>([]);
  const [filtre, setFiltre] = useState('PENDING');
  const [ouvert, setOuvert] = useState<Releve | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const entetes = () => ({ Authorization: `Bearer ${jetonAcces()}` });

  const charger = useCallback(async () => {
    setLotErreur('');
    try {
      const [lotRep, listeRep, lotsRep] = await Promise.all([
        fetch(`${API_URL}/api/superowner/versements/sepa`, { headers: entetes() }),
        fetch(`${API_URL}/api/superowner/merchant-payouts${filtre ? `?status=${filtre}` : ''}`, {
          headers: entetes(),
        }),
        fetch(`${API_URL}/api/superowner/versements/lots`, { headers: entetes() }),
      ]);
      if (lotsRep.ok) setActif((await lotsRep.json()).data?.actif ?? null);
      const lotLu = await lotRep.json().catch(() => ({}));
      if (lotRep.ok) setLot(lotLu.data);
      else {
        setLot(null);
        setLotErreur(lotLu?.error || lotLu?.message || t('lotIllisible'));
      }
      if (listeRep.ok) setReleves((await listeRep.json()).data || []);
    } catch {
      setLotErreur('Serveur injoignable');
    }
  }, [filtre, t]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const arreter = async () => {
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const rep = await fetch(`${API_URL}/api/superowner/versements/arreter`, { method: 'POST', headers: entetes() });
      const lu = await rep.json();
      if (!rep.ok) throw new Error(lu?.error || t('arreteImpossible'));
      setMessage(
        lu.data.inactif
          ? t('inactifs')
          : t('semaineArretee', { commercants: lu.data.commercants, livreurs: lu.data.livreurs })
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('erreur'));
    } finally {
      setOccupe(false);
    }
  };

  /** Un geste sur le lot actif : l'état est celui du serveur, jamais déduit ici. */
  const agirSurLeLot = async (chemin: string, corps?: object) => {
    if (!actif) return;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const rep = await fetch(`${API_URL}/api/superowner/versements/lots/${actif.id}/${chemin}`, {
        method: 'POST',
        headers: { ...entetes(), 'Content-Type': 'application/json' },
        body: JSON.stringify(corps ?? {}),
      });
      const lu = await rep.json().catch(() => ({}));
      if (!rep.ok) {
        if (rep.status === 409) await charger();
        throw new Error(lu?.error || lu?.message || t('actionImpossible'));
      }
      setMotDePasse('');
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const preparer = async () => {
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const rep = await fetch(`${API_URL}/api/superowner/versements/lots`, { method: 'POST', headers: entetes() });
      const lu = await rep.json().catch(() => ({}));
      if (!rep.ok) {
        if (rep.status === 409) await charger();
        throw new Error(lu?.error || lu?.message || t('preparerImpossible'));
      }
      setMessage(t('lotPrepare'));
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : t('erreur'));
    } finally {
      setOccupe(false);
    }
  };

  const telecharger = async () => {
    if (!actif) return;
    setErreur('');
    const rep = await fetch(`${API_URL}/api/superowner/versements/lots/${actif.id}/sepa.xml`, { headers: entetes() });
    if (!rep.ok) {
      const lu = await rep.json().catch(() => ({}));
      setErreur(lu?.error || t('telechargementImpossible'));
      return;
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(await rep.blob());
    lien.download = `${actif.reference}.xml`;
    lien.click();
    URL.revokeObjectURL(lien.href);
    await charger();
  };

  const confirmerVerse = async () => {
    if (!actif) return;
    if (!confirm(t('confirmerVerse', { n: actif.itemCount, total: euro(actif.total) }))) return;
    await agirSurLeLot('confirmer', { reference: actif.reference });
  };

  const ouvrir = async (id: string) => {
    const rep = await fetch(`${API_URL}/api/superowner/merchant-payouts/${id}`, { headers: entetes() });
    if (rep.ok) setOuvert((await rep.json()).data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Banknote /> {t('titre')}
        </h1>
        <p className="text-gray-500 mt-1">
          {t('intro')}
        </p>
      </div>

      {message && <div className="bg-green-50 border border-green-200 text-green-700 rounded-sm p-3">{message}</div>}
      {erreur && <div className="bg-red-50 border border-red-200 text-red-700 rounded-sm p-3">{erreur}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-gray-900">{t('lotAVerser')}</h2>
        {lotErreur ? (
          <p className="text-amber-700">{lotErreur}</p>
        ) : lot ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-gray-500 text-sm">{t('total')}</p>
                <p className="text-3xl font-bold text-green-600">{euro(lot.total)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">{t('virements')}</p>
                <p className="text-3xl font-bold text-gray-900">{lot.nombre}</p>
                <p className="text-xs text-gray-500">
                  {t('repartition', { commercants: lot.inclus.commercants.length, livreurs: lot.inclus.livreurs.length })}
                </p>
              </div>
              <div>
                <p className="text-gray-500 text-sm">{t('reference')}</p>
                <p className="text-gray-900 font-mono text-sm break-all">{lot.reference}</p>
              </div>
            </div>

            {lot.ecartes.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-sm text-amber-800 space-y-1">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} /> {t('ecartes')}
                </p>
                {lot.ecartes.map((e) => (
                  <p key={e.id}>
                    {t('ecarte', {
                      type: e.type === 'commercant' ? t('commercant') : t('livreur'),
                      nom: e.nom,
                      montant: euro(e.montant),
                      raison: e.raison,
                    })}
                  </p>
                ))}
              </div>
            )}

            {actif ? (
              <div className="border border-gray-200 rounded-sm p-4 space-y-3" data-testid="lot-actif">
                <p className="text-sm text-gray-500">
                  {t('lotEnCours')} <span className="font-mono text-gray-900">{actif.reference}</span> ·{' '}
                  {euro(actif.total)} · {t('virementsN', { n: actif.itemCount })}
                </p>
                <p className="font-semibold text-gray-900">{t(`etatsLot.${actif.status}`)}</p>
                <div className="flex flex-wrap items-end gap-3">
                  {actif.status === 'PREPARED' && (
                    <>
                      <input
                        type="password"
                        value={motDePasse}
                        onChange={(e) => setMotDePasse(e.target.value)}
                        placeholder={t('motDePasse')}
                        autoComplete="current-password"
                        className="border border-gray-300 rounded-sm px-3 py-2 text-gray-900"
                      />
                      <button
                        onClick={() => agirSurLeLot('approuver', { motDePasse })}
                        disabled={!motDePasse || occupe}
                        className="bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-sm flex items-center gap-2"
                      >
                        <Check size={18} /> {t('approuver')}
                      </button>
                    </>
                  )}
                  {['APPROVED', 'EXPORTED'].includes(actif.status) && (
                    <button
                      onClick={telecharger}
                      disabled={occupe}
                      className="bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-sm flex items-center gap-2"
                    >
                      <Download size={18} /> {t('telecharger')}
                    </button>
                  )}
                  {actif.status === 'EXPORTED' && (
                    <button
                      onClick={() => agirSurLeLot('transmettre')}
                      disabled={occupe}
                      className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-sm"
                    >
                      {t('marquerTransmis')}
                    </button>
                  )}
                  {['EXPORTED', 'SUBMITTED'].includes(actif.status) && (
                    <>
                      <button
                        onClick={confirmerVerse}
                        disabled={occupe}
                        className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-sm flex items-center gap-2"
                      >
                        <Check size={18} /> {t('marquerVerse')}
                      </button>
                      <button
                        onClick={() => confirm(t('confirmerRejet')) && agirSurLeLot('rejeter', { raison: t('refuseParBanque') })}
                        disabled={occupe}
                        className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-sm"
                      >
                        {t('refuse')}
                      </button>
                    </>
                  )}
                  {['PREPARED', 'APPROVED'].includes(actif.status) && (
                    <button
                      onClick={() => agirSurLeLot('annuler')}
                      disabled={occupe}
                      className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-sm"
                    >
                      {t('annulerLot')}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={preparer}
                  disabled={!lot.pret || occupe}
                  className="bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-sm flex items-center gap-2"
                >
                  <Download size={18} /> {t('preparer')}
                </button>
                <button
                  onClick={arreter}
                  disabled={occupe}
                  className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-sm flex items-center gap-2"
                >
                  <RefreshCw size={18} /> {t('arreter')}
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500">
              {t('etapes')}
            </p>
          </>
        ) : (
          <p className="text-gray-500">{t('chargement')}</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">{t('relevesCommercants')}</h2>
          <select
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            className="bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 text-sm"
          >
            <option value="PENDING">{t('filtreAVerser')}</option>
            <option value="PAID">{t('filtreVerses')}</option>
            <option value="CARRIED">{t('filtreReportes')}</option>
            <option value="">{t('filtreTous')}</option>
          </select>
        </div>
        {releves.length === 0 ? (
          <p className="text-gray-500">{t('aucun')}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {releves.map((r) => (
              <button
                key={r.id}
                onClick={() => ouvrir(r.id)}
                className="w-full text-left py-3 flex flex-wrap justify-between gap-2 hover:bg-gray-50 px-2 rounded-sm"
              >
                <span>
                  <span className="text-gray-900 font-semibold">{r.organization}</span>
                  <span className="block text-xs text-gray-500">
                    {periode(r.periodStart, r.periodEnd)} · {t('commandes', { n: r.orderCount })} ·{' '}
                    {r.ibanValide ? `IBAN …${r.ibanFin}` : <span className="text-amber-700">{t('ibanManquant')}</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`font-bold ${r.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{euro(r.amount)}</span>
                  <span className="block text-xs text-gray-500">{ETATS_CONNUS.includes(r.status) ? t(`etats.${r.status}`) : r.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {ouvert && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setOuvert(null)}>
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <ReleveReversement releve={ouvert} />
            <button onClick={() => setOuvert(null)} className="mt-3 w-full bg-gray-100 text-gray-900 py-2 rounded-sm">
              {t('fermer')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
