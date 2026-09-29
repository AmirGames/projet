'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type Identifiants = { email: string; password: string };

/**
 * Le compte commerçant de démonstration, sur la page de connexion.
 *
 * L'API dit si la démo est activée (GET /api/auth/demo) ; sinon rien ne
 * s'affiche. Les identifiants sont publics par nature. Un clic les recopie
 * dans le formulaire.
 */
export default function AccesDemo({ onUtiliser }: { onUtiliser: (email: string, password: string) => void }) {
  const t = useTranslations('accesDemo');
  const [demo, setDemo] = useState<Identifiants | null>(null);

  useEffect(() => {
    let annule = false;

    fetch(`${API_URL}/api/auth/demo`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees) => {
        if (!annule && donnees?.enabled) setDemo({ email: donnees.email, password: donnees.password });
      })
      .catch(() => {
        // API injoignable : la page de connexion se passe de la démo.
      });

    return () => {
      annule = true;
    };
  }, []);

  if (!demo) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-800">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('titre')}
      </p>
      <p className="mb-3 text-slate-600">{t('description')}</p>
      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-slate-500">{t('email')}</dt>
        <dd className="font-mono">{demo.email}</dd>
        <dt className="text-slate-500">{t('motDePasse')}</dt>
        <dd className="font-mono">{demo.password}</dd>
      </dl>
      <button
        type="button"
        onClick={() => onUtiliser(demo.email, demo.password)}
        className="rounded-lg bg-amber-500 px-3 py-1.5 font-medium text-gray-900 hover:bg-amber-400 transition"
      >
        {t('utiliser')}
      </button>
    </div>
  );
}
