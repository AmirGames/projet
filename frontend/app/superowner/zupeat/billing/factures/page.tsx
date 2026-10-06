'use client';

/**
 * Les factures Peppol.
 *
 * Chaque mois, la plateforme facture à chaque commerçant sa commission et les
 * frais qu'il a encaissés pour elle, en UBL sur le réseau Peppol. L'émission est
 * automatique ; cet écran montre où en est chaque commerçant, pourquoi une
 * facture est bloquée, et permet d'émettre, télécharger ou renvoyer à la main.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Send } from 'lucide-react';

import { euro } from '@/lib/format';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Etat = 'FACTUREE' | 'FACTURABLE' | 'RIEN' | 'BLOQUEE';

interface Ligne {
  orgId: string;
  nom: string;
  etat: Etat;
  invoiceId?: string;
  numero?: string;
  totalTtc?: number;
  /** La part déjà réglée par retenue sur les reversements. */
  dejaRegle?: number;
  peppolStatus?: string;
  raison?: string;
  code?: string;
}

interface Apercu {
  periode: string;
  plateformeManque: string[];
  fournisseurPeppol: string | null;
  lignes: Ligne[];
}

// Libellés : `etats.<etat>` et `peppol.<statut>` des traductions.
const ETATS: Record<Etat, { classe: string }> = {
  FACTUREE: { classe: 'bg-green-100 text-green-600 border-green-500/20' },
  FACTURABLE: { classe: 'bg-blue-100 text-blue-600 border-blue-500/20' },
  RIEN: { classe: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  BLOQUEE: { classe: 'bg-red-100 text-red-600 border-red-500/20' },
};

const PEPPOL: Record<string, { classe: string }> = {
  GENERATED: { classe: 'text-yellow-600' },
  SENT: { classe: 'text-blue-600' },
  DELIVERED: { classe: 'text-green-600' },
  FAILED: { classe: 'text-red-600' },
};

/** Le mois écoulé, « 2026-08 » en septembre 2026 : le seul facturable au départ. */
function moisPrecedent() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function entete() {
  return { Authorization: `Bearer ${localStorage.getItem('accessToken')}` };
}

async function lireErreur(res: Response, defaut: string) {
  try {
    const corps = await res.json();
    return (typeof corps?.error === 'string' ? corps.error : corps?.error?.message) || corps?.message || defaut;
  } catch {
    return defaut;
  }
}

export default function FacturesPeppolPage() {
  const t = useTranslations('facturesPeppol');
  const [periode, setPeriode] = useState(moisPrecedent);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [actionEnCours, setActionEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await fetch(`${API_URL}/api/superowner/platform-invoices/overview?period=${periode}`, {
        headers: entete(),
      });
      if (!res.ok) throw new Error(await lireErreur(res, t('chargementImpossible')));
      setApercu(await res.json());
      setErreur('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('chargementImpossible'));
    } finally {
      setChargement(false);
    }
  }, [periode]);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  const agir = async (cle: string, requete: () => Promise<Response>, succes: (corps: any) => string) => {
    setActionEnCours(cle);
    setErreur('');
    setInfo('');
    try {
      const res = await requete();
      if (!res.ok) throw new Error(await lireErreur(res, t('actionImpossible')));
      setInfo(succes(await res.json()));
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('actionImpossible'));
    } finally {
      setActionEnCours(null);
    }
  };

  const post = (chemin: string, corps: object) =>
    fetch(`${API_URL}/api/superowner/${chemin}`, {
      method: 'POST',
      headers: { ...entete(), 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });

  const emettre = (ligne: Ligne) =>
    agir(
      ligne.orgId,
      () => post(`billing/${ligne.orgId}/invoice`, { period: periode }),
      (f) => t('emise', { numero: f.number })
    );

  const emettreTout = () =>
    agir(
      'tout',
      () => post('platform-invoices/issue-month', { period: periode }),
      (b) =>
        t('bilan', { emises: b.emises, envoyees: b.envoyees ?? 0, bloquees: b.bloquees.length })
    );

  const envoyer = (ligne: Ligne) =>
    agir(
      ligne.invoiceId!,
      () => post(`platform-invoices/${ligne.invoiceId}/send`, {}),
      (f) => (f.peppolStatus === 'SENT' ? t('envoyee', { numero: f.number }) : t('envoiEchoue', { erreur: f.peppolError || t('erreurInconnue') }))
    );

  const telecharger = async (ligne: Ligne) => {
    setErreur('');
    try {
      const res = await fetch(`${API_URL}/api/superowner/platform-invoices/${ligne.invoiceId}/ubl`, {
        headers: entete(),
      });
      if (!res.ok) throw new Error(await lireErreur(res, t('telechargementImpossible')));
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(await res.blob());
      lien.download = `${ligne.numero}.xml`;
      lien.click();
      URL.revokeObjectURL(lien.href);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('telechargementImpossible'));
    }
  };

  const nbAEmettre = apercu?.lignes.filter((l) => l.etat === 'FACTURABLE').length ?? 0;
  const nbBloquees = apercu?.lignes.filter((l) => l.etat === 'BLOQUEE').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-8 h-8" />
            {t('titre')}
          </h1>
          <p className="text-gray-500 mt-2">
            {t('aide')}
          </p>
          <Link href="/superowner/zupeat/billing" className="text-sm text-blue-600 hover:text-blue-700 underline">
            {t('retour')}
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="month"
            value={periode}
            max={moisPrecedent()}
            onChange={(e) => e.target.value && setPeriode(e.target.value)}
            className="bg-white border border-gray-200 text-gray-900 rounded-lg px-3 py-2"
            aria-label={t('mois')}
          />
          <button
            onClick={emettreTout}
            disabled={nbAEmettre === 0 || actionEnCours !== null || (apercu?.plateformeManque.length ?? 0) > 0}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 transition"
          >
            {actionEnCours === 'tout' ? t('emission') : t('toutEmettre', { n: nbAEmettre })}
          </button>
        </div>
      </div>

      {apercu && apercu.plateformeManque.length > 0 && (
        <div role="alert" className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-500/20 text-sm">
          {t('identiteIncomplete', { liste: apercu.plateformeManque.join(', ') })}
        </div>
      )}

      {apercu && !apercu.fournisseurPeppol && (
        <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-500/20 text-sm">
          {t('sansFournisseur')}
        </div>
      )}

      {erreur && <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-500/20">{erreur}</div>}
      {info && <div className="p-4 bg-green-50 text-green-600 rounded-lg border border-green-500/20">{info}</div>}

      {chargement ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : !apercu || apercu.lignes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">{t('aucunCommercant')}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-200 text-sm text-gray-500">
            {t('resume', { n: apercu.lignes.length, aEmettre: nbAEmettre, bloques: nbBloquees })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('commercant')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('etat')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('facture')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('totalTtc')}</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('peppolCol')}</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {apercu.lignes.map((ligne) => {
                  const etat = ETATS[ligne.etat];
                  const peppol = ligne.peppolStatus ? PEPPOL[ligne.peppolStatus] : null;
                  return (
                    <tr key={ligne.orgId} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {ligne.nom}
                        {ligne.etat === 'BLOQUEE' && (
                          <span role="status" className="block text-xs font-normal text-amber-700">
                            {ligne.raison}{' '}
                            <Link href={`/superowner/zupeat/organizations/${ligne.orgId}`} className="underline hover:text-amber-800">
                              {t('voirDossier')}
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${etat.classe}`}>
                          {t(`etats.${ligne.etat}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{ligne.numero ?? '—'}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-700">
                        {ligne.totalTtc !== undefined ? euro(ligne.totalTtc) : '—'}
                        {(ligne.dejaRegle ?? 0) > 0 && (
                          <span className="block text-xs text-gray-500">
                            {t('retenus', { montant: euro(ligne.dejaRegle ?? 0) })}
                            {ligne.totalTtc !== undefined && t('reste', { montant: euro(Math.max(0, ligne.totalTtc - (ligne.dejaRegle ?? 0))) })}
                          </span>
                        )}
                      </td>
                      <td className={`px-6 py-4 text-sm ${peppol?.classe ?? 'text-gray-500'}`}>
                        {peppol && ligne.peppolStatus ? t(`peppol.${ligne.peppolStatus}`) : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {ligne.etat === 'FACTURABLE' && (
                            <button
                              onClick={() => emettre(ligne)}
                              disabled={actionEnCours !== null || (apercu.plateformeManque.length ?? 0) > 0}
                              className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-black disabled:opacity-50 transition"
                            >
                              {actionEnCours === ligne.orgId ? '…' : t('emettre')}
                            </button>
                          )}
                          {ligne.etat === 'FACTUREE' && (
                            <>
                              <button
                                onClick={() => telecharger(ligne)}
                                className="px-3 py-1.5 bg-gray-100 text-gray-800 text-sm rounded-lg hover:bg-gray-200 transition flex items-center gap-1"
                                title={t('telechargerXml')}
                              >
                                <Download className="w-4 h-4" /> XML
                              </button>
                              {ligne.peppolStatus !== 'SENT' && ligne.peppolStatus !== 'DELIVERED' && (
                                <button
                                  onClick={() => envoyer(ligne)}
                                  disabled={actionEnCours !== null || !apercu.fournisseurPeppol}
                                  title={apercu.fournisseurPeppol ? t('envoyerPeppol') : t('aucunFournisseur')}
                                  className="px-3 py-1.5 bg-gray-100 text-gray-800 text-sm rounded-lg hover:bg-gray-200 disabled:opacity-50 transition flex items-center gap-1"
                                >
                                  <Send className="w-4 h-4" /> {ligne.peppolStatus === 'FAILED' ? t('renvoyer') : t('envoyer')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
