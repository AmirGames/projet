'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';
import { LogoZupOne } from '@/components/auth/LogoZupOne';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Etat = 'en-cours' | 'confirme' | 'echec';

/** Confirmation d'adresse : le lien reçu suffit, rien à saisir. */
function Confirmation() {
  const t = useTranslations('verifierEmail');
  const jeton = useSearchParams().get('jeton') || '';

  const [etat, setEtat] = useState<Etat>('en-cours');
  const [message, setMessage] = useState('');

  const confirmer = useCallback(async () => {
    if (!jeton) {
      setEtat('echec');
      setMessage(t('sansJeton'));
      return;
    }

    try {
      const reponse = await fetch(`${API_URL}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setEtat('echec');
        setMessage(donnees.error || t('plusValable'));
        return;
      }

      setEtat('confirme');
      setMessage(donnees.email || '');
    } catch {
      setEtat('echec');
      setMessage(t('injoignable'));
    }
  }, [jeton, t]);

  useEffectChargement(() => {
    confirmer();
  }, [confirmer]);

  if (etat === 'en-cours') {
    return (
      <div className="text-center space-y-4">
        <div role="status" aria-label={t('enCours')} className="mx-auto size-10 animate-spin rounded-full border-2 border-neutral-200 border-b-[#FF7A00]" />
        <p className="text-slate-600">{t('enCours')}</p>
      </div>
    );
  }

  if (etat === 'confirme') {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-gray-900" />
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{t('confirmee')}</h1>
        {message && (
          <p className="text-slate-600">
            {t.rich('estLaVotre', {
              adresse: message,
              fort: (morceau) => <strong className="text-slate-900">{morceau}</strong>,
            })}
          </p>
        )}
        <Link
          href="/login"
          className="inline-flex rounded-full bg-[#FF7A00] px-6 py-3 font-bold text-black transition hover:bg-[#E66E00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 hover:no-underline"
        >
          {t('seConnecter')}
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <XCircle size={48} className="mx-auto text-red-500" />
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{t('impossible')}</h1>
      <p className="text-slate-600">{message}</p>
      <p className="text-sm text-slate-500">
        {t('expire')}
      </p>
      <Link href="/login" className="inline-block font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600">
        {t('retour')}
      </Link>
    </div>
  );
}

export default function VerifierEmail() {
  const t = useTranslations('verifierEmail');
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#fff0df_0,_#faf9f7_44%,_#f5f5f4_100%)] px-5 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-black/5 bg-white p-7 shadow-[0_24px_80px_-36px_rgba(0,0,0,.28)] md:p-10">
        <LogoZupOne />
        {/* useSearchParams impose une frontière de suspense au rendu statique. */}
        <Suspense fallback={<p className="text-center text-slate-600">{t('chargement')}</p>}>
          <Confirmation />
        </Suspense>
      </div>
    </div>
  );
}

