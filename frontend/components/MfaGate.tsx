'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { jetonAcces } from '@/lib/jeton-session';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type State = { enabled: boolean; required: boolean; verified: boolean; recent: boolean; recovery: boolean };
export async function mfaRequest(action = '', body?: unknown) {
  const response = await fetch(`/api/auth/mfa${action ? `/${action}` : ''}`, {
    method: body === undefined ? 'GET' : 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jetonAcces()}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

export function MfaPanel({ onDone }: { onDone?: () => void }) {
  const t = useTranslations('mfa');
  const { logout } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { mfaRequest().then(setState).catch((e) => setError(e.message)); }, []);
  async function act(action: string, body: unknown) {
    setBusy(true); setError('');
    try {
      const data = await mfaRequest(action, body);
      setCode(''); setPassword('');
      if (data.secret) setSecret(data.secret);
      if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(''); }
      if (action === 'revoke') { logout(); router.push('/login'); return; }
      const current = await mfaRequest(); setState(current);
      if (action === 'verify' && current.verified && !current.recovery) onDone?.();
    } catch (e) { setError(e instanceof Error ? e.message : t('error')); }
    finally { setBusy(false); }
  }
  return <section className="mx-auto my-8 max-w-lg rounded-xl border bg-white p-6 text-gray-900">
    <h1 className="text-xl font-semibold">{t('title')}</h1>
    <p className="my-3">{t(state?.recovery ? 'recoverNotice' : 'description')}</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {codes.length > 0 ? <>
      <p>{t('saveCodes')}</p><pre className="my-4 whitespace-pre-wrap">{codes.join('\n')}</pre>
      <button onClick={() => { setCodes([]); onDone?.(); }} className="rounded bg-black p-3 text-white">{t('saved')}</button>
    </> : <>
      {secret && <><p>{t('secretNotice')}</p><pre className="my-4 break-all whitespace-pre-wrap">{secret}</pre></>}
      <label className="block my-3">{t('code')}<input aria-label={t('code')} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} className="block w-full rounded border p-3" /></label>
      <button disabled={busy || !state} onClick={() => act(secret ? 'confirm' : 'verify', { code })} className="rounded bg-black p-3 text-white disabled:opacity-50">{t('verify')}</button>
      {state?.enabled && !secret && <button disabled={busy} onClick={() => act('recover', { code })} className="mx-2 rounded border p-3 disabled:opacity-50">{t('recover')}</button>}
      <label className="block my-3">{t('password')}<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full rounded border p-3" /></label>
      <button disabled={busy || !state} onClick={() => act('begin', { password })} className="rounded border p-3 disabled:opacity-50">{t(state?.enabled ? 'rotate' : 'enroll')}</button>
      {state?.enabled && <button disabled={busy} onClick={() => { if (window.confirm(t('revokeConfirm'))) void act('revoke', {}); }} className="mx-2 rounded border p-3 disabled:opacity-50">{t('revoke')}</button>}
    </>}
  </section>;
}

/** Confort client seulement : toutes les décisions sont aussi appliquées par l'API. */
export default function MfaGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const refresh = useCallback(() => { mfaRequest().then((s: State) => setReady(!s.required || (s.verified && !s.recovery))).catch(() => setReady(false)); }, []);
  useEffect(() => { refresh(); const need = () => setReady(false); window.addEventListener('mfa-required', need); return () => window.removeEventListener('mfa-required', need); }, [refresh]);
  return ready ? <><Link href="/mfa" className="fixed bottom-3 right-3 z-50 rounded border bg-white p-2 text-black">MFA</Link>{children}</> : <MfaPanel onDone={refresh} />;
}
