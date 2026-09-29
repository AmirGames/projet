'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';

// Les comptes créés par backend/scripts/seed-demo.mjs.
const MOT_DE_PASSE = 'Password123!';
const COMPTES = [
  { cle: 'plateforme', email: 'super@demo.fr' },
  { cle: 'commercant', email: 'marchand@demo.fr' },
  { cle: 'livreur', email: 'livreur@demo.fr' },
] as const;

/**
 * Bandeau de l'environnement de démonstration : dit qu'il s'agit d'une démo
 * (rien n'est réel, tout est effacé chaque nuit) et donne les comptes d'essai.
 * Affiché seulement si NEXT_PUBLIC_DEMO=true au build (voir docker-compose.demo.yml).
 */
export default function BandeauDemo() {
  const t = useTranslations('bandeauDemo');
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState('');

  if (process.env.NEXT_PUBLIC_DEMO !== 'true') return null;

  const copier = async (texte: string) => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(texte);
      setTimeout(() => setCopie(''), 1500);
    } catch {
      // Presse-papiers indisponible : les valeurs restent lisibles à l'écran.
    }
  };

  return (
    <div className="bg-amber-500 text-gray-900 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="flex items-center gap-2 font-medium">
          <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('message')}
        </p>
        <button
          type="button"
          onClick={() => setOuvert(!ouvert)}
          aria-expanded={ouvert}
          className="rounded bg-gray-900 px-3 py-1 font-medium text-white hover:bg-gray-800"
        >
          {ouvert ? t('masquer') : t('voir')}
        </button>
      </div>

      {ouvert && (
        <div className="border-t border-amber-600/40 bg-amber-100 px-4 py-3">
          <ul className="mx-auto max-w-6xl space-y-2">
            {COMPTES.map(({ cle, email }) => (
              <li key={cle} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="w-28 font-semibold">{t(`comptes.${cle}`)}</span>
                <button
                  type="button"
                  onClick={() => copier(email)}
                  className="rounded bg-white px-2 py-0.5 font-mono hover:bg-amber-50"
                  title={t('copier')}
                >
                  {copie === email ? t('copie') : email}
                </button>
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-2 max-w-6xl">
            {t('motDePasse')}{' '}
            <button
              type="button"
              onClick={() => copier(MOT_DE_PASSE)}
              className="rounded bg-white px-2 py-0.5 font-mono hover:bg-amber-50"
              title={t('copier')}
            >
              {copie === MOT_DE_PASSE ? t('copie') : MOT_DE_PASSE}
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
