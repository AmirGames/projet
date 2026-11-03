'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { enregistrerCuisine, type EtatCuisine } from '@/lib/use-preparation-cuisine';

/** Ces réglages concernent les prochaines suggestions, jamais les commandes acceptées. */
export function ReglagesCuisine({ storeId, etat }: { storeId: string; etat: EtatCuisine }) {
  const t = useTranslations('cuisinePreparation');
  const [base, setBase] = useState(String(etat.reglages.minutesParDefaut));
  const [capacite, setCapacite] = useState(String(etat.reglages.commandesParalleles));
  const [supplement, setSupplement] = useState(String(etat.rush?.supplementMinutes ?? 10));
  const [duree, setDuree] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const valide = [[base, 5, 120], [capacite, 1, 30], [supplement, 0, 120]].every(([v, min, max]) => Number.isInteger(Number(v)) && Number(v) >= Number(min) && Number(v) <= Number(max));
  const enregistrer = async () => {
    if (!valide || envoi) return;
    setEnvoi(true); setErreur(''); setMessage('');
    try {
      await enregistrerCuisine(storeId, { minutesParDefaut: Number(base), commandesParalleles: Number(capacite), supplementRush: Number(supplement), dureeRush: duree === '' ? null : Number(duree) });
      setMessage(t('enregistre')); setDuree('');
    } catch (e) { setErreur(e instanceof Error ? e.message : t('erreur')); }
    finally { setEnvoi(false); }
  };
  return (
    <details className="mt-3 rounded-lg border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t('reglages')}</summary>
      <p className="mt-2 text-xs text-gray-600">{t('aideReglages')}</p>
      <div className="mt-3 grid gap-3 text-sm">
        <label>{t('base')} <input className="w-20 rounded border p-2" type="number" min={5} max={120} value={base} disabled={envoi} onChange={(e) => setBase(e.target.value)} /></label>
        <label>{t('capacite')} <input className="w-20 rounded border p-2" type="number" min={1} max={30} value={capacite} disabled={envoi} onChange={(e) => setCapacite(e.target.value)} /></label>
        <label>{t('mode')} <select className="rounded border bg-white p-2" value={duree} disabled={envoi} onChange={(e) => setDuree(e.target.value)}>
          <option value="">{t('conserver')}</option><option value="0">{t('normal')}</option>
          {[30, 60, 120].map((n) => <option key={n} value={n}>{t('rushPendant', { n })}</option>)}
        </select></label>
        <label>{t('supplement')} <input className="w-20 rounded border p-2" type="number" min={0} max={120} value={supplement} disabled={envoi} onChange={(e) => setSupplement(e.target.value)} /></label>
        <button type="button" className="rounded bg-gray-900 px-3 py-2 text-white disabled:opacity-50" disabled={envoi || !valide} onClick={enregistrer}>{envoi ? '…' : t('enregistrer')}</button>
        {message && <p role="status" className="text-green-700">{message}</p>}
        {erreur && <p role="alert" className="text-red-600">{erreur}</p>}
      </div>
    </details>
  );
}
