'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { jetonAcces } from '@/lib/jeton-session';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { EtatRemboursement, type RemboursementCommande } from './EtatRemboursement';

interface Ligne {
  lineId: string; name: string; quantity: number; refundedQuantity: number; netCents: number;
}
interface Apercu {
  available: boolean; currency: string; remainingCents: number; items: Ligne[];
  operation: RemboursementCommande | null; explanation?: string;
}
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const cumul = (l: Ligne, n: number) => Math.floor(l.netCents / l.quantity) * n + Math.min(l.netCents % l.quantity, n);

export function RemboursementIncident({ issueId, onSaved }: { issueId: string; onSaved: () => void }) {
  const t = useTranslations('incidentsCommande');
  const locale = useLocale();
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState('ITEMS');
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [confirme, setConfirme] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  // Conservé après une réponse perdue : une nouvelle tentative reprend le même payload.
  const [demandeEnregistree, setDemandeEnregistree] = useState<string | null>(null);
  const url = `${API}/api/superowner/orders/issues/${encodeURIComponent(issueId)}/refund`;
  const charger = useCallback(async (signal?: AbortSignal) => {
    try {
      const rep = await fetch(url, { signal, headers: { Authorization: `Bearer ${jetonAcces()}` } });
      const body = await rep.json();
      if (!rep.ok) throw new Error(body.error || t('erreurChargement'));
      if (!signal?.aborted) { setApercu(body.data); setConfirme(false); setErreur(''); }
    } catch (e) { if (!signal?.aborted) setErreur(e instanceof Error ? e.message : t('erreurChargement')); }
  }, [url, t]);
  useEffectChargement(() => {
    if (!ouvert) return;
    const controller = new AbortController();
    void charger(controller.signal);
    return () => controller.abort();
  }, [charger, ouvert]);
  const enAttente = apercu?.operation && !['SUCCEEDED', 'ABANDONED'].includes(apercu.operation.status);
  useEffect(() => {
    if (!ouvert || !enAttente) return;
    const controller = new AbortController();
    let lecture = false;
    const timer = setInterval(async () => {
      if (lecture) return;
      lecture = true;
      try { await charger(controller.signal); } finally { lecture = false; }
    }, 10_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [charger, ouvert, enAttente]);
  const items = Object.entries(quantites).map(([lineId, quantity]) => ({ lineId, quantity }));
  const articlesValides = items.length > 0 && items.length <= 50 && items.every((i) => {
    const ligne = apercu?.items.find((l) => l.lineId === i.lineId);
    return ligne && Number.isInteger(i.quantity) && i.quantity >= 1 && i.quantity <= ligne.quantity - ligne.refundedQuantity;
  });
  const montant = mode === 'BALANCE' ? apercu?.remainingCents ?? 0 : items.reduce((s, i) => {
    const ligne = apercu?.items.find((l) => l.lineId === i.lineId);
    return s + (ligne && Number.isInteger(i.quantity) ? cumul(ligne, ligne.refundedQuantity + i.quantity) - cumul(ligne, ligne.refundedQuantity) : 0);
  }, 0);
  const valide = apercu?.available && montant > 0 && montant <= apercu.remainingCents && (mode === 'BALANCE' || articlesValides) && reason.trim().length >= 5 && confirme;
  const euros = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: apercu?.currency ?? 'EUR' }).format(n / 100);
  const envoyer = async (reprise = false) => {
    if (envoi || (!reprise && !valide && !demandeEnregistree) || (reprise && reason.trim().length < 5)) return;
    const body = reprise ? JSON.stringify({ reason: reason.trim() }) : demandeEnregistree ?? JSON.stringify({ mode, items: mode === 'ITEMS' ? items : [], reason: reason.trim(), expectedAmountCents: montant });
    if (!reprise) setDemandeEnregistree(body);
    setEnvoi(true); setErreur('');
    try {
      const rep = await fetch(url + (reprise ? '/retry' : ''), { method: 'POST', headers: { Authorization: `Bearer ${jetonAcces()}`, 'Content-Type': 'application/json' }, body });
      const data = await rep.json();
      if (!rep.ok) {
        setDemandeEnregistree(null);
        setConfirme(false);
        await charger();
        throw new Error(data.error || t('erreurEnvoi'));
      }
      setApercu((ancien) => ancien ? { ...ancien, available: false, operation: data.data } : ancien);
      setDemandeEnregistree(null); setConfirme(false); onSaved();
    } catch (e) { setErreur(e instanceof Error ? e.message : t('erreurEnvoi')); }
    finally { setEnvoi(false); }
  };
  if (!ouvert) return <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setOuvert(true)}>{t('ouvrirRemboursement')}</button>;
  const fige = envoi || !!demandeEnregistree;
  return <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm">
    <h3 className="font-semibold">{t('titreRemboursement')}</h3>
    {erreur && <p role="alert" className="text-red-700">{erreur}</p>}
    <button type="button" className="underline" disabled={envoi} onClick={() => void charger()}>{t('actualiser')}</button>
    {apercu?.explanation && <p>{apercu.explanation}</p>}
    <EtatRemboursement operation={apercu?.operation} />
    {apercu?.available && <>
      <p>{t('soldeRemboursable', { montant: euros(apercu.remainingCents) })}</p>
      <label className="block">{t('modeRemboursement')} <select className="rounded border bg-white p-2" value={mode} disabled={fige} onChange={(e) => { setMode(e.target.value); setConfirme(false); }}>
        <option value="ITEMS">{t('articlesSelectionnes')}</option><option value="BALANCE">{t('soldeIntegral')}</option>
      </select></label>
      {mode === 'ITEMS' && <fieldset className="space-y-2"><legend>{t('articlesARembourser')}</legend>{apercu.items.filter((l) => l.quantity > l.refundedQuantity).map((l) => <div key={l.lineId} className="flex flex-wrap items-center gap-2">
        <label><input type="checkbox" disabled={fige} checked={l.lineId in quantites} onChange={(e) => { setQuantites((ancien) => { const suivant = { ...ancien }; if (e.target.checked) suivant[l.lineId] = 1; else delete suivant[l.lineId]; return suivant; }); setConfirme(false); }} /> {l.name}</label>
        {l.lineId in quantites && <label>{t('quantite')} <input type="number" className="w-20 rounded border p-2" min={1} max={l.quantity - l.refundedQuantity} value={quantites[l.lineId]} disabled={fige} onChange={(e) => { setQuantites((ancien) => ({ ...ancien, [l.lineId]: Number(e.target.value) })); setConfirme(false); }} /></label>}
      </div>)}</fieldset>}
      <p className="font-semibold">{t('montantRemboursement', { montant: euros(montant) })}</p>
      <p className="text-xs">{t('calculRemboursement')}</p>
      <label className="block">{t('raisonRemboursement')}<textarea className="mt-1 block w-full rounded border bg-white p-2" minLength={5} maxLength={300} value={reason} disabled={fige} onChange={(e) => setReason(e.target.value)} /></label>
      <label className="block"><input type="checkbox" checked={confirme} disabled={fige} onChange={(e) => setConfirme(e.target.checked)} /> {t('confirmerRemboursement', { montant: euros(montant) })}</label>
      <button type="button" className="rounded bg-orange-700 px-4 py-2 text-white disabled:opacity-50" disabled={envoi || (!valide && !demandeEnregistree)} onClick={() => void envoyer()}>{demandeEnregistree ? t('reprendreDemande') : t('lancerRemboursement')}</button>
    </>}
    {apercu?.operation?.status === 'ABANDONED' && <>
      <p>{t('aideVerification')}</p>
      <label className="block">{t('raisonRemboursement')}<textarea className="block w-full rounded border bg-white p-2" minLength={5} maxLength={300} value={reason} disabled={envoi} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" className="rounded border px-3 py-2" disabled={envoi || reason.trim().length < 5} onClick={() => void envoyer(true)}>{t('verifierRemboursement')}</button>
    </>}
  </div>;
}
