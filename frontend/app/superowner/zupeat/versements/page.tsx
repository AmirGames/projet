'use client';

/**
 * Les versements du lundi : commerçants et livreurs, en un seul fichier SEPA.
 *
 * Chaque lundi 00 h 00 (Bruxelles), la semaine écoulée s'arrête d'elle-même.
 * Ici, la plateforme télécharge le fichier, l'importe dans sa banque (KBC/CBC
 * Business, Isabel…), signe une fois, puis marque le lot versé.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Banknote, Check, Download, RefreshCw } from 'lucide-react';

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

const ETATS: Record<string, string> = {
  PENDING: 'À verser',
  PAID: 'Versé',
  CARRIED: 'Reporté (négatif)',
  CANCELLED: 'Annulé',
};

const periode = (debut: string, fin: string) => {
  const veille = new Date(new Date(fin).getTime() - 1);
  return `du ${new Date(debut).toLocaleDateString('fr-FR')} au ${veille.toLocaleDateString('fr-FR')}`;
};

export default function VersementsSepaPage() {
  const [lot, setLot] = useState<Lot | null>(null);
  const [lotErreur, setLotErreur] = useState('');
  const [releves, setReleves] = useState<Ligne[]>([]);
  const [filtre, setFiltre] = useState('PENDING');
  const [ouvert, setOuvert] = useState<Releve | null>(null);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const entetes = () => ({ Authorization: `Bearer ${localStorage.getItem('accessToken')}` });

  const charger = useCallback(async () => {
    setLotErreur('');
    try {
      const [lotRep, listeRep] = await Promise.all([
        fetch(`${API_URL}/api/superowner/versements/sepa`, { headers: entetes() }),
        fetch(`${API_URL}/api/superowner/merchant-payouts${filtre ? `?status=${filtre}` : ''}`, {
          headers: entetes(),
        }),
      ]);
      const lotLu = await lotRep.json().catch(() => ({}));
      if (lotRep.ok) setLot(lotLu.data);
      else {
        setLot(null);
        setLotErreur(lotLu?.error || lotLu?.message || 'Lot illisible');
      }
      if (listeRep.ok) setReleves((await listeRep.json()).data || []);
    } catch {
      setLotErreur('Serveur injoignable');
    }
  }, [filtre]);

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
      if (!rep.ok) throw new Error(lu?.error || 'Arrêté impossible');
      setMessage(
        lu.data.inactif
          ? 'Les reversements ne sont pas encore activés (PAYOUTS_START_DATE).'
          : `Semaine arrêtée : ${lu.data.commercants} relevé(s) commerçant, ${lu.data.livreurs} relevé(s) livreur.`
      );
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setOccupe(false);
    }
  };

  const telecharger = async () => {
    setErreur('');
    const rep = await fetch(`${API_URL}/api/superowner/versements/sepa.xml`, { headers: entetes() });
    if (!rep.ok) {
      const lu = await rep.json().catch(() => ({}));
      setErreur(lu?.error || 'Téléchargement impossible');
      return;
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(await rep.blob());
    lien.download = `${lot?.reference || 'versements'}.xml`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  };

  const marquerVerse = async () => {
    if (!lot) return;
    if (!confirm(`Confirmez-vous que la banque a exécuté ces ${lot.nombre} virements (${euro(lot.total)}) ?`)) return;
    setOccupe(true);
    setErreur('');
    try {
      const rep = await fetch(`${API_URL}/api/superowner/versements/payer`, {
        method: 'POST',
        headers: { ...entetes(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...lot.inclus, reference: lot.reference }),
      });
      const lu = await rep.json();
      if (!rep.ok) throw new Error(lu?.error || 'Impossible de marquer le lot');
      setMessage(`Lot versé : ${lu.data.commercants} commerçant(s), ${lu.data.livreurs} livreur(s).`);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setOccupe(false);
    }
  };

  const ouvrir = async (id: string) => {
    const rep = await fetch(`${API_URL}/api/superowner/merchant-payouts/${id}`, { headers: entetes() });
    if (rep.ok) setOuvert((await rep.json()).data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Banknote /> Versements du lundi
        </h1>
        <p className="text-gray-400 mt-1">
          Commerçants et livreurs, en un seul fichier à importer dans votre banque. La semaine
          s&apos;arrête d&apos;elle-même chaque lundi à 00 h 00.
        </p>
      </div>

      {message && <div className="bg-green-900/30 border border-green-700 text-green-300 rounded p-3">{message}</div>}
      {erreur && <div className="bg-red-900/30 border border-red-700 text-red-300 rounded p-3">{erreur}</div>}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <h2 className="text-xl font-semibold text-white">Lot à verser</h2>
        {lotErreur ? (
          <p className="text-amber-300">{lotErreur}</p>
        ) : lot ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Total</p>
                <p className="text-3xl font-bold text-green-400">{euro(lot.total)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Virements</p>
                <p className="text-3xl font-bold text-white">{lot.nombre}</p>
                <p className="text-xs text-gray-500">
                  {lot.inclus.commercants.length} commerçant(s) · {lot.inclus.livreurs.length} livreur(s)
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Référence</p>
                <p className="text-white font-mono text-sm break-all">{lot.reference}</p>
              </div>
            </div>

            {lot.ecartes.length > 0 && (
              <div className="bg-amber-900/20 border border-amber-700 rounded p-3 text-sm text-amber-200 space-y-1">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} /> Écartés du fichier (à corriger avant le prochain lot)
                </p>
                {lot.ecartes.map((e) => (
                  <p key={e.id}>
                    {e.type === 'commercant' ? 'Commerçant' : 'Livreur'} {e.nom} — {euro(e.montant)} : {e.raison}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={telecharger}
                disabled={!lot.pret}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded flex items-center gap-2"
              >
                <Download size={18} /> Télécharger le fichier SEPA
              </button>
              <button
                onClick={marquerVerse}
                disabled={!lot.pret || occupe}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded flex items-center gap-2"
              >
                <Check size={18} /> Marquer le lot versé
              </button>
              <button
                onClick={arreter}
                disabled={occupe}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-2"
              >
                <RefreshCw size={18} /> Arrêter la semaine maintenant
              </button>
            </div>
            <p className="text-xs text-gray-500">
              1. Téléchargez le fichier · 2. Importez-le dans votre banque en ligne (virements groupés
              SEPA) et signez · 3. Revenez ici et marquez le lot versé.
            </p>
          </>
        ) : (
          <p className="text-gray-400">Chargement…</p>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Relevés des commerçants</h2>
          <select
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
          >
            <option value="PENDING">À verser</option>
            <option value="PAID">Versés</option>
            <option value="CARRIED">Reportés</option>
            <option value="">Tous</option>
          </select>
        </div>
        {releves.length === 0 ? (
          <p className="text-gray-400">Aucun relevé.</p>
        ) : (
          <div className="divide-y divide-gray-700">
            {releves.map((r) => (
              <button
                key={r.id}
                onClick={() => ouvrir(r.id)}
                className="w-full text-left py-3 flex flex-wrap justify-between gap-2 hover:bg-gray-700/40 px-2 rounded"
              >
                <span>
                  <span className="text-white font-semibold">{r.organization}</span>
                  <span className="block text-xs text-gray-400">
                    {periode(r.periodStart, r.periodEnd)} · {r.orderCount} commande(s) ·{' '}
                    {r.ibanValide ? `IBAN …${r.ibanFin}` : <span className="text-amber-300">IBAN manquant ou invalide</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className={`font-bold ${r.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{euro(r.amount)}</span>
                  <span className="block text-xs text-gray-400">{ETATS[r.status] || r.status}</span>
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
            <button onClick={() => setOuvert(null)} className="mt-3 w-full bg-gray-700 text-white py-2 rounded">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
