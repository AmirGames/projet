'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { signalerAuServeur } from '@/lib/surveillance-navigateur';
import { useTranslations } from 'next-intl';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('pageErreur');
  // Une erreur rattrapée par React n'atteint pas l'écouteur global de la
  // page : sans cet envoi, un écran d'erreur resterait invisible au serveur.
  useEffect(() => {
    signalerAuServeur(error, error.digest ? `rendu (digest ${error.digest})` : 'rendu');
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F7F7F6] text-gray-900 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4">{t('titre')}</h1>
        <p className="text-lg text-gray-500 mb-6">
          {t('texte')}
        </p>
        {error.message && (
          <p className="text-gray-600 mb-8 text-sm bg-white border border-gray-200 p-4 rounded-xl">
            {error.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-bold"
          >
            {t('reessayer')}
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-white border border-gray-200 hover:border-gray-400 text-gray-900 rounded-full font-bold"
          >
            {t('accueil')}
          </Link>
        </div>
      </div>
    </div>
  );
}
