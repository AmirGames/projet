'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { jetonAcces } from '@/lib/jeton-session';
import { cheminCommande, jetonDeSuivi } from '@/lib/suivi-commande';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { EtatRemboursement, type RemboursementCommande } from './EtatRemboursement';

interface Dossier {
  id: string; category: string; message: string; requestRefund: boolean;
  status: string; response: string | null;
  refundOperation?: RemboursementCommande | null;
}
interface Etat {
  categories: string[]; refundPossible: boolean;
  items: { id: string; name: string; quantity: number }[];
  dossiers: Dossier[];
}
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function IncidentCommande({ orderId }: { orderId: string }) {
  const t = useTranslations('incidentsCommande');
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const [categorie, setCategorie] = useState('');
  const [message, setMessage] = useState('');
  const [remboursement, setRemboursement] = useState(false);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [envoi, setEnvoi] = useState(false);
  const headers = (): Record<string, string> => { const token = jetonAcces(); return token ? { Authorization: `Bearer ${token}` } : {}; };
  const url = `${API}${cheminCommande(orderId, jetonDeSuivi(orderId), '/incidents')}`;
  const charger = useCallback(async (signal?: AbortSignal) => {
    try {
      const token = jetonAcces();
      const cible = `${API}${cheminCommande(orderId, jetonDeSuivi(orderId), '/incidents')}`;
      const rep = await fetch(cible, { signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!rep.ok) throw new Error('Unavailable');
      const corps = await rep.json();
      if (!signal?.aborted) { setEtat(corps.data); setErreur(''); }
    } catch { if (!signal?.aborted) setErreur(t('erreurChargement')); }
  }, [orderId, t]);
  useEffectChargement(() => {
    const controller = new AbortController();
    void charger(controller.signal);
    return () => controller.abort();
  }, [charger]);
  const enAttente = etat?.dossiers.some((d) => d.status === 'OPEN' || d.requestRefund && d.status !== 'REJECTED' && d.refundOperation?.status !== 'SUCCEEDED') ?? false;
  useEffect(() => {
    if (!enAttente) return;
    const controller = new AbortController();
    let lecture = false;
    const timer = setInterval(async () => {
      if (lecture) return;
      lecture = true;
      try { await charger(controller.signal); } finally { lecture = false; }
    }, 20_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [enAttente, charger]);

  const motif = categorie || etat?.categories[0] || '';
  const lignes = Object.entries(quantites).map(([lineId, quantity]) => ({ lineId, quantity }));
  const articlesValides = motif !== 'MISSING_ITEM' || (lignes.length > 0 && lignes.length <= 50 && lignes.every((l) => Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= (etat?.items.find((i) => i.id === l.lineId)?.quantity ?? 0)));
  const valide = Boolean(etat?.categories.includes(motif)) && message.trim().length >= 5 && message.trim().length <= 1000 && articlesValides;
  const envoyer = async () => {
    if (!valide || envoi) return;
    setEnvoi(true); setErreur('');
    try {
      const rep = await fetch(url, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({
        category: motif, message: message.trim(), requestRefund: remboursement && etat?.refundPossible,
        items: motif === 'MISSING_ITEM' ? lignes : [],
      }) });
      const corps = await rep.json();
      if (!rep.ok) throw new Error(corps.error || t('erreurEnvoi'));
      const dossier: Dossier = corps.data;
      setEtat((ancien) => ancien ? { ...ancien, categories: ancien.categories.filter((c) => c !== dossier.category),
        dossiers: [...ancien.dossiers.filter((d) => d.id !== dossier.id), dossier] } : ancien);
      setOuvert(false); setCategorie(''); setMessage(''); setRemboursement(false); setQuantites({});
    } catch (e) { setErreur(e instanceof Error ? e.message : t('erreurEnvoi')); }
    finally { setEnvoi(false); }
  };
  if (!etat && !erreur) return null;
  return <section aria-label={t('titre')} className="rounded-2xl border border-gray-200 bg-white p-5 text-gray-900">
    <h2 className="font-bold">{t('titre')}</h2>
    {erreur && <div role="alert" className="mt-2 text-sm text-red-700">{erreur} <button type="button" onClick={() => void charger()} className="underline">{t('reessayer')}</button></div>}
    {etat?.dossiers.map((d) => <article key={d.id} className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
      <p className="font-semibold">{t(`categories.${d.category}`)} · {t(`statuts.${d.status}`)}</p>
      <p className="mt-1 whitespace-pre-wrap">{d.message}</p>
      {d.requestRefund && !d.refundOperation && <p className="mt-1">{t('remboursementDemande')}</p>}
      <EtatRemboursement operation={d.refundOperation} />
      {d.response && <p className="mt-2 whitespace-pre-wrap">{t('reponseSupport')} {d.response}</p>}
    </article>)}
    {etat && !etat.categories.length && !etat.dossiers.length && <p className="mt-2 text-sm">{t('indisponible')}</p>}
    {etat && etat.categories.length > 0 && !ouvert && <button type="button" className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white" onClick={() => setOuvert(true)}>{t('signaler')}</button>}
    {etat && ouvert && etat.categories.length > 0 && <div className="mt-3 space-y-3 text-sm">
      <label className="block">{t('motif')}<select className="ml-2 rounded border bg-white p-2" value={motif} disabled={envoi} onChange={(e) => { setCategorie(e.target.value); setQuantites({}); }}>
        {etat.categories.map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
      </select></label>
      {motif === 'MISSING_ITEM' && <fieldset className="space-y-2"><legend>{t('articles')}</legend>{etat.items.map((i) => <div key={i.id} className="flex flex-wrap items-center gap-2">
        <label><input type="checkbox" disabled={envoi} checked={i.id in quantites} onChange={(e) => setQuantites((q) => { const next = { ...q }; if (e.target.checked) next[i.id] = 1; else delete next[i.id]; return next; })} /> {i.name}</label>
        {i.id in quantites && <label>{t('quantite')} <input className="w-20 rounded border p-2" type="number" min={1} max={i.quantity} disabled={envoi} value={quantites[i.id]} onChange={(e) => setQuantites((q) => ({ ...q, [i.id]: Number(e.target.value) }))} /></label>}
      </div>)}</fieldset>}
      <label className="block">{t('description')}<textarea className="mt-1 block w-full rounded border p-2" minLength={5} maxLength={1000} value={message} disabled={envoi} onChange={(e) => setMessage(e.target.value)} /></label>
      {etat.refundPossible && <label className="block"><input type="checkbox" checked={remboursement} disabled={envoi} onChange={(e) => setRemboursement(e.target.checked)} /> {t('demanderRemboursement')}</label>}
      <p className="text-xs text-gray-600">{t('examen')}</p>
      <div className="flex gap-2"><button type="button" disabled={!valide || envoi} onClick={envoyer} className="rounded-lg bg-orange-600 px-4 py-2 text-white disabled:opacity-50">{envoi ? '…' : t('envoyer')}</button>
        <button type="button" disabled={envoi} onClick={() => setOuvert(false)} className="rounded-lg border px-4 py-2">{t('annuler')}</button></div>
    </div>}
  </section>;
}
