'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le compte où le livreur reçoit ses versements du lundi. Sans IBAN valide, il
 * est écarté du virement groupé : ses courses sont comptées, mais pas payées.
 */
export default function CompteVersementLivreur({
  compte,
  onSaved,
}: {
  compte?: { ibanFin: string; titulaire?: string | null; valide: boolean } | null;
  onSaved: () => void;
}) {
  const [edition, setEdition] = useState(!compte);
  const [iban, setIban] = useState('');
  const [titulaire, setTitulaire] = useState(compte?.titulaire || '');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const rep = await fetch(`${API_URL}/api/drivers/me/bank-account`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('driverToken')}`,
        },
        body: JSON.stringify({ iban, accountHolder: titulaire }),
      });
      const lu = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(lu?.error || lu?.message || "Impossible d'enregistrer le compte");
      setEdition(false);
      setIban('');
      onSaved();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-6 bg-gray-800 border border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-bold text-white">Mes versements</h2>
      <p className="text-sm text-gray-400 mb-4">Vos gains de la semaine sont virés chaque lundi sur ce compte.</p>
      {!edition && compte ? (
        <div className="space-y-1 text-sm">
          <p className="text-white">Compte …{compte.ibanFin}</p>
          <p className="text-gray-400">{compte.titulaire}</p>
          {!compte.valide && <p className="text-red-400">Cet IBAN n&apos;est pas valide : corrigez-le pour être payé.</p>}
          <button onClick={() => setEdition(true)} className="text-orange-400 font-semibold mt-2">
            Modifier
          </button>
        </div>
      ) : (
        <form onSubmit={enregistrer} className="space-y-3">
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="IBAN (BE68 5390 0754 7034)"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            required
          />
          <input
            value={titulaire}
            onChange={(e) => setTitulaire(e.target.value)}
            placeholder="Titulaire du compte"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            required
          />
          {erreur && <p className="text-red-400 text-sm">{erreur}</p>}
          <button
            type="submit"
            disabled={envoi}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 rounded"
          >
            Enregistrer
          </button>
        </form>
      )}
    </div>
  );
}
