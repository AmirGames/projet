'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ReglesMotDePasse from '@/components/ReglesMotDePasse';
import { motDePasseValide } from '@/lib/mot-de-passe';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Choix d'un nouveau mot de passe, depuis le lien reçu par courriel. */
function Formulaire() {
  const t = useTranslations('resetPassword');
  const tMdp = useTranslations('motDePasse');
  const router = useRouter();
  const jeton = useSearchParams().get('jeton') || '';

  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [reussi, setReussi] = useState(false);

  const valider = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    // Vérifié ici pour un retour immédiat ; le serveur reste juge du reste.
    if (!motDePasseValide(motDePasse)) {
      setErreur(tMdp('invalide'));
      return;
    }

    if (motDePasse !== confirmation) {
      setErreur(t('differents'));
      return;
    }

    setEnCours(true);

    try {
      const reponse = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton, password: motDePasse }),
      });

      const donnees = await reponse.json();

      if (!reponse.ok) {
        setErreur(donnees.error || t('plusValable'));
        return;
      }

      setReussi(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch {
      setErreur(t('injoignable'));
    } finally {
      setEnCours(false);
    }
  };

  if (!jeton) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{t('lienIncomplet')}</h1>
        <p className="text-slate-600">
          {t('sansJeton')}
        </p>
        <Link
          href="/mot-de-passe-oublie"
          className="inline-block font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600"
        >
          {t('nouveauLien')}
        </Link>
      </div>
    );
  }

  if (reussi) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 size={48} className="mx-auto text-gray-900" />
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{t('modifie')}</h1>
        <p className="text-slate-600">{t('redirection')}</p>
        <Link href="/login" className="inline-block font-semibold text-gray-900 underline underline-offset-4 transition hover:text-gray-600">
          {t('seConnecter')}
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="mb-2 text-center text-3xl font-extrabold tracking-tight text-gray-900">{t('nouveauMdp')}</h1>
      <p className="text-slate-600 text-center mb-6">
        {t('regles')}
      </p>

      {erreur && <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">{erreur}</div>}

      <form onSubmit={valider} className="space-y-4">
        <div>
          <label htmlFor="motdepasse" className="mb-1.5 block text-sm font-semibold text-gray-700">
            {t('mdp')}
          </label>
          <input
            id="motdepasse"
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            placeholder="••••••••"
            minLength={8}
            autoComplete="new-password"
            required
            autoFocus
          />
          <ReglesMotDePasse valeur={motDePasse} />
        </div>

        <div>
          <label htmlFor="confirmation" className="mb-1.5 block text-sm font-semibold text-gray-700">
            {t('confirmation')}
          </label>
          <input
            id="confirmation"
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            placeholder="••••••••"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="w-full rounded-full bg-gray-900 px-4 py-3.5 font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {enCours ? 'Enregistrement...' : t('save')}
        </button>
      </form>
    </>
  );
}

export default function Reinitialiser() {
  const t = useTranslations('resetPassword');
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm ring-1 ring-gray-200 md:p-10">
        {/* useSearchParams impose une frontière de suspense au rendu statique. */}
        <Suspense fallback={<p className="text-center text-slate-600">{t('chargement')}</p>}>
          <Formulaire />
        </Suspense>
      </div>
    </div>
  );
}
