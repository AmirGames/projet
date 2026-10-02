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

const ETATS: Record<Etat, { libelle: string; classe: string }> = {
  FACTUREE: { libelle: 'Facturée', classe: 'bg-green-500/10 text-green-400 border-green-500/20' },
  FACTURABLE: { libelle: 'À émettre', classe: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  RIEN: { libelle: 'Rien à facturer', classe: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  BLOQUEE: { libelle: 'Bloquée', classe: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const PEPPOL: Record<string, { libelle: string; classe: string }> = {
  GENERATED: { libelle: 'Prête, non envoyée', classe: 'text-yellow-400' },
  SENT: { libelle: 'Envoyée', classe: 'text-blue-400' },
  DELIVERED: { libelle: 'Délivrée', classe: 'text-green-400' },
  FAILED: { libelle: 'Échec d’envoi', classe: 'text-red-400' },
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
      if (!res.ok) throw new Error(await lireErreur(res, 'Chargement impossible'));
      setApercu(await res.json());
      setErreur('');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Chargement impossible');
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
      if (!res.ok) throw new Error(await lireErreur(res, 'Action impossible'));
      setInfo(succes(await res.json()));
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Action impossible');
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
      (f) => `Facture ${f.number} émise.`
    );

  const emettreTout = () =>
    agir(
      'tout',
      () => post('platform-invoices/issue-month', { period: periode }),
      (b) =>
        `${b.emises} facture(s) émise(s)${b.envoyees ? `, ${b.envoyees} envoyée(s)` : ''}` +
        `${b.bloquees.length ? `, ${b.bloquees.length} bloquée(s)` : ''}.`
    );

  const envoyer = (ligne: Ligne) =>
    agir(
      ligne.invoiceId!,
      () => post(`platform-invoices/${ligne.invoiceId}/send`, {}),
      (f) => (f.peppolStatus === 'SENT' ? `Facture ${f.number} envoyée.` : `Envoi échoué : ${f.peppolError || 'erreur inconnue'}`)
    );

  const telecharger = async (ligne: Ligne) => {
    setErreur('');
    try {
      const res = await fetch(`${API_URL}/api/superowner/platform-invoices/${ligne.invoiceId}/ubl`, {
        headers: entete(),
      });
      if (!res.ok) throw new Error(await lireErreur(res, 'Téléchargement impossible'));
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(await res.blob());
      lien.download = `${ligne.numero}.xml`;
      lien.click();
      URL.revokeObjectURL(lien.href);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Téléchargement impossible');
    }
  };

  const nbAEmettre = apercu?.lignes.filter((l) => l.etat === 'FACTURABLE').length ?? 0;
  const nbBloquees = apercu?.lignes.filter((l) => l.etat === 'BLOQUEE').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Factures Peppol
          </h1>
          <p className="text-gray-400 mt-2">
            Facture mensuelle de la plateforme à chaque commerçant (commission, livraison, frais de service),
            envoyée en UBL. L’émission est automatique chaque jour pour le mois écoulé.
          </p>
          <Link href="/superowner/zupeat/billing" className="text-sm text-blue-400 hover:text-blue-300 underline">
            ← Retour à la facturation
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="month"
            value={periode}
            max={moisPrecedent()}
            onChange={(e) => e.target.value && setPeriode(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2"
            aria-label="Mois facturé"
          />
          <button
            onClick={emettreTout}
            disabled={nbAEmettre === 0 || actionEnCours !== null || (apercu?.plateformeManque.length ?? 0) > 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 transition"
          >
            {actionEnCours === 'tout' ? 'Émission…' : `Tout émettre (${nbAEmettre})`}
          </button>
        </div>
      </div>

      {apercu && apercu.plateformeManque.length > 0 && (
        <div role="alert" className="p-4 bg-red-900/20 text-red-300 rounded-lg border border-red-500/20 text-sm">
          L’identité de la plateforme est incomplète : aucune facture ne peut être émise. À renseigner dans
          l’environnement du serveur : {apercu.plateformeManque.join(', ')}.
        </div>
      )}

      {apercu && !apercu.fournisseurPeppol && (
        <div className="p-4 bg-yellow-900/20 text-yellow-300 rounded-lg border border-yellow-500/20 text-sm">
          Aucun fournisseur Peppol n’est branché : les factures sont générées mais ne partent pas. Téléchargez
          le XML et déposez-le chez votre Access Point en attendant.
        </div>
      )}

      {erreur && <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">{erreur}</div>}
      {info && <div className="p-4 bg-green-900/20 text-green-400 rounded-lg border border-green-500/20">{info}</div>}

      {chargement ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : !apercu || apercu.lignes.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <p className="text-gray-400">Aucun commerçant.</p>
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="px-6 py-3 border-b border-gray-700 text-sm text-gray-400">
            {apercu.lignes.length} commerçant(s) — {nbAEmettre} à émettre, {nbBloquees} bloqué(s)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700/50 border-b border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Commerçant</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">État</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Facture</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">Total TTC</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-300">Peppol</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {apercu.lignes.map((ligne) => {
                  const etat = ETATS[ligne.etat];
                  const peppol = ligne.peppolStatus ? PEPPOL[ligne.peppolStatus] : null;
                  return (
                    <tr key={ligne.orgId} className="hover:bg-gray-700/20 transition">
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        {ligne.nom}
                        {ligne.etat === 'BLOQUEE' && (
                          <span role="status" className="block text-xs font-normal text-amber-300">
                            {ligne.raison}{' '}
                            <Link href={`/superowner/zupeat/organizations/${ligne.orgId}`} className="underline hover:text-amber-200">
                              Voir le dossier
                            </Link>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${etat.classe}`}>
                          {etat.libelle}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">{ligne.numero ?? '—'}</td>
                      <td className="px-6 py-4 text-right text-sm text-gray-300">
                        {ligne.totalTtc !== undefined ? euro(ligne.totalTtc) : '—'}
                        {(ligne.dejaRegle ?? 0) > 0 && (
                          <span className="block text-xs text-gray-500">
                            dont {euro(ligne.dejaRegle ?? 0)} retenus sur les reversements
                            {ligne.totalTtc !== undefined && ` · reste ${euro(Math.max(0, ligne.totalTtc - (ligne.dejaRegle ?? 0)))}`}
                          </span>
                        )}
                      </td>
                      <td className={`px-6 py-4 text-sm ${peppol?.classe ?? 'text-gray-500'}`}>
                        {peppol?.libelle ?? '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          {ligne.etat === 'FACTURABLE' && (
                            <button
                              onClick={() => emettre(ligne)}
                              disabled={actionEnCours !== null || (apercu.plateformeManque.length ?? 0) > 0}
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition"
                            >
                              {actionEnCours === ligne.orgId ? '…' : 'Émettre'}
                            </button>
                          )}
                          {ligne.etat === 'FACTUREE' && (
                            <>
                              <button
                                onClick={() => telecharger(ligne)}
                                className="px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg hover:bg-gray-600 transition flex items-center gap-1"
                                title="Télécharger le XML"
                              >
                                <Download className="w-4 h-4" /> XML
                              </button>
                              {ligne.peppolStatus !== 'SENT' && ligne.peppolStatus !== 'DELIVERED' && (
                                <button
                                  onClick={() => envoyer(ligne)}
                                  disabled={actionEnCours !== null || !apercu.fournisseurPeppol}
                                  title={apercu.fournisseurPeppol ? 'Envoyer sur Peppol' : 'Aucun fournisseur Peppol branché'}
                                  className="px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition flex items-center gap-1"
                                >
                                  <Send className="w-4 h-4" /> {ligne.peppolStatus === 'FAILED' ? 'Renvoyer' : 'Envoyer'}
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
