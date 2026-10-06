'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('compteVersementLivreur');
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
      if (!rep.ok) throw new Error(lu?.error || lu?.message || t('impossible'));
      setEdition(false);
      setIban('');
      onSaved();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-bold text-gray-900">{t('titre')}</h2>
      <p className="text-sm text-gray-500 mb-4">{t('aide')}</p>
      {!edition && compte ? (
        <div className="space-y-1 text-sm">
          <p className="text-gray-900">{t('compte', { fin: compte.ibanFin })}</p>
          <p className="text-gray-500">{compte.titulaire}</p>
          {!compte.valide && <p className="text-red-600">{t('invalide')}</p>}
          <button onClick={() => setEdition(true)} className="text-orange-600 font-semibold mt-2">
            {t('modifier')}
          </button>
        </div>
      ) : (
        <form onSubmit={enregistrer} className="space-y-3">
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder={t('iban')}
            className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
            required
          />
          <input
            value={titulaire}
            onChange={(e) => setTitulaire(e.target.value)}
            placeholder={t('titulaire')}
            className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
            required
          />
          {erreur && <p className="text-red-600 text-sm">{erreur}</p>}
          <button
            type="submit"
            disabled={envoi}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 rounded"
          >
            {t('enregistrer')}
          </button>
        </form>
      )}
    </div>
  );
}
