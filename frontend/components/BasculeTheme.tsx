'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Le bouton lune / soleil des en-têtes : passe l'espace en sombre ou en clair. */
export function BasculeTheme({ sombre, onClick }: { sombre: boolean; onClick: () => void }) {
  const t = useTranslations('themeSombre');
  const libelle = sombre ? t('clair') : t('sombre');
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      title={libelle}
      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
    >
      {sombre ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
