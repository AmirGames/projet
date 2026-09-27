'use client';

import { useTranslations } from 'next-intl';
import { criteresMotDePasse } from '@/lib/mot-de-passe';

/**
 * Les critères du mot de passe, cochés au fil de la saisie.
 *
 * Refuser le formulaire après coup obligeait à deviner ce qui manquait : la
 * liste dit tout de suite ce qu'il reste à ajouter.
 */
export default function ReglesMotDePasse({ valeur, sombre = false }: { valeur: string; sombre?: boolean }) {
  const t = useTranslations('motDePasse');
  const neutre = sombre ? 'text-gray-400' : 'text-slate-500';

  return (
    <ul className="mt-2 space-y-0.5 text-sm" aria-live="polite">
      {criteresMotDePasse(valeur).map(({ cle, ok }) => (
        <li key={cle} className={ok ? 'text-green-600' : neutre}>
          <span aria-hidden="true">{ok ? '✓' : '•'}</span> {t(cle)}
          <span className="sr-only">{ok ? ` — ${t('respecte')}` : ` — ${t('manquant')}`}</span>
        </li>
      ))}
    </ul>
  );
}
