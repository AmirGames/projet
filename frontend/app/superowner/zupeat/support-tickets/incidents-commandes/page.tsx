'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { jetonAcces } from '@/lib/jeton-session';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { chargerAcces, type AccesPlateforme } from '@/lib/acces-plateforme';
import { EtatRemboursement, type RemboursementCommande } from '@/components/EtatRemboursement';
import { RemboursementIncident } from '@/components/RemboursementIncident';

interface Dossier {
  id: string; category: string; message: string; status: string; response: string | null; requestRefund: boolean;
  items: { lineId: string; name: string; quantity: number }[];
  refundOperation?: RemboursementCommande | null;
  order: { id: string; status: string; paymentStatus: string; store: { name: string } };
}
const URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001') + '/api/superowner/support-tickets/order-issues';

export default function IncidentsCommandesPage() {
  const t = useTranslations('incidentsCommande');
  const [acces, setAcces] = useState<AccesPlateforme | null>(null);
  useEffectChargement(() => {
    let actif = true;
    chargerAcces().then((lu) => { if (actif) setAcces(lu); }).catch(() => { if (actif) setAcces(null); });
    return () => { actif = false; };
  }, []);
  const peutRembourser = !!acces?.isSuperOwner || acces?.permissions.billing === 'write';
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('OPEN');
  const [erreur, setErreur] = useState('');
  const charger = useCallback(async (signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ limit: '20', offset: String(offset), ...(status ? { status } : {}) });
      const rep = await fetch(`${URL}?${params}`, { signal, headers: { Authorization: `Bearer ${jetonAcces()}` } });
      if (!rep.ok) throw new Error(t('erreurChargement'));
      const data = await rep.json();
      if (!signal?.aborted) { setDossiers(data.dossiers); setTotal(data.total); setErreur(''); }
    } catch { if (!signal?.aborted) setErreur(t('erreurChargement')); }
  }, [offset, status, t]);
  useEffectChargement(() => {
    const controller = new AbortController();
    void charger(controller.signal);
    return () => controller.abort();
  }, [charger]);
  useEffect(() => {
    const controller = new AbortController();
    let lecture = false;
    const timer = setInterval(async () => {
      if (lecture) return;
      lecture = true;
      try { await charger(controller.signal); } finally { lecture = false; }
    }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [charger]);
  return <main className="space-y-5 text-gray-900">
    <h1 className="text-2xl font-bold">{t('titreAdmin')}</h1>
    <p className="text-sm text-gray-600">{t('aideAdmin')}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label>{t('statut')} <select className="rounded border bg-white p-2" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}>
        <option value="">{t('tous')}</option>{['OPEN', 'RESOLVED', 'REJECTED'].map((s) => <option key={s} value={s}>{t(`statuts.${s}`)}</option>)}
      </select></label>
      <button type="button" className="rounded border px-3 py-2" onClick={() => void charger()}>{t('actualiser')}</button>
      <span>{t('nombre', { n: total })}</span>
    </div>
    {erreur && <p role="alert" className="text-red-700">{erreur}</p>}
    {!erreur && !dossiers.length && <p>{t('aucun')}</p>}
    {dossiers.map((d) => <article key={d.id} className="space-y-2 rounded-xl border bg-white p-5">
      <h2 className="font-bold">{t(`categories.${d.category}`)} · {d.order.store.name}</h2>
      <p className="text-sm text-gray-600">{t('commande')} {d.order.id} · {t(`statuts.${d.status}`)} · {d.order.paymentStatus}</p>
      <p className="whitespace-pre-wrap">{d.message}</p>
      {d.items.map((i) => <p key={i.lineId} className="text-sm">{i.quantity} × {i.name}</p>)}
      {d.requestRefund && <p className="text-sm font-semibold text-orange-800">{t('remboursementDemande')}</p>}
      <EtatRemboursement operation={d.refundOperation} />
      {d.response && <p className="whitespace-pre-wrap text-sm">{t('reponseSupport')} {d.response}</p>}
      {d.status === 'OPEN' && <Reponse key={d.id} id={d.id} remboursementEngage={!!d.refundOperation} onSaved={() => void charger()} />}
      {d.requestRefund && d.status !== 'REJECTED' && peutRembourser && <RemboursementIncident issueId={d.id} onSaved={() => void charger()} />}
    </article>)}
    <div className="flex gap-3"><button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={offset === 0} onClick={() => setOffset((n) => Math.max(0, n - 20))}>{t('precedent')}</button>
      <button type="button" className="rounded border px-3 py-2 disabled:opacity-50" disabled={offset + 20 >= total} onClick={() => setOffset((n) => n + 20)}>{t('suivant')}</button></div>
  </main>;
}

function Reponse({ id, remboursementEngage, onSaved }: { id: string; remboursementEngage: boolean; onSaved: () => void }) {
  const t = useTranslations('incidentsCommande');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState('RESOLVED');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const envoyer = async () => {
    if (response.trim().length < 5 || envoi) return;
    setEnvoi(true); setErreur('');
    try {
      const rep = await fetch(`${URL}/${encodeURIComponent(id)}/response`, { method: 'PUT', headers: { Authorization: `Bearer ${jetonAcces()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, response: response.trim() }) });
      const body = await rep.json();
      if (!rep.ok) throw new Error(body.error || t('erreurEnvoi'));
      onSaved();
    } catch (e) { setErreur(e instanceof Error ? e.message : t('erreurEnvoi')); }
    finally { setEnvoi(false); }
  };
  return <div className="space-y-2 border-t pt-3 text-sm">
    <label className="block">{t('repondre')}<textarea className="mt-1 block w-full rounded border p-2" value={response} minLength={5} maxLength={2000} disabled={envoi} onChange={(e) => setResponse(e.target.value)} /></label>
    <label>{t('decision')} <select className="rounded border bg-white p-2" value={status} disabled={envoi} onChange={(e) => setStatus(e.target.value)}>{(remboursementEngage ? ['RESOLVED'] : ['RESOLVED', 'REJECTED']).map((s) => <option key={s} value={s}>{t(`statuts.${s}`)}</option>)}</select></label>
    <button type="button" className="ml-3 rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50" disabled={envoi || response.trim().length < 5} onClick={envoyer}>{t('envoyerReponse')}</button>
    {erreur && <p role="alert" className="text-red-700">{erreur}</p>}
  </div>;
}
