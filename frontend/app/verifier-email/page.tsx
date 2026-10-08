'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 mx-auto" />
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
          className="inline-block rounded-full bg-gray-900 px-6 py-3 font-bold text-white transition hover:bg-gray-800 hover:no-underline"
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xs ring-1 ring-gray-200 md:p-10">
        {/* useSearchParams impose une frontière de suspense au rendu statique. */}
        <Suspense fallback={<p className="text-center text-slate-600">{t('chargement')}</p>}>
          <Confirmation />
        </Suspense>
      </div>
    </div>
  );
}
