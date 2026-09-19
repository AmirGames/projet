'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Globe } from 'lucide-react';
import { LANGUES_SUPPORTEES, NOM_COOKIE_LANGUE, type Langue } from '@/i18n/langues';

const NOM_LANGUE: Record<Langue, string> = {
  fr: 'Français',
  en: 'English',
};

/**
 * Pas de segment d'URL à changer : on pose juste le cookie de langue, puis on
 * redemande à Next.js de re-rendre les pages serveur avec ce cookie — la même
 * adresse reste affichée, seul le contenu change de langue.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Langue;
  const t = useTranslations('nav');
  const router = useRouter();

  const changerDeLangue = (langue: Langue) => {
    // Un an : assez long pour ne pas redemander à chaque visite, assez court
    // pour qu'un choix oublié depuis longtemps ne colle pas indéfiniment.
    document.cookie = `${NOM_COOKIE_LANGUE}=${langue};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    router.refresh();
  };

  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-300">
      <Globe size={16} className="shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(e) => changerDeLangue(e.target.value as Langue)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-blue-500 cursor-pointer"
      >
        {LANGUES_SUPPORTEES.map((langue) => (
          <option key={langue} value={langue}>
            {NOM_LANGUE[langue]}
          </option>
        ))}
      </select>
    </label>
  );
}
