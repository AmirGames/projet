'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { signalerErreur } from '@/lib/erreurs';
import { AVAILABLE_THEMES, applyTheme, getTheme, saveThemeToAPI, Theme } from '@/lib/theme-config';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Le thème de l'interface, choisi par la plateforme pour tout le site.
 * Appliqué et enregistré dès qu'il change.
 */
export default function SelecteurTheme() {
  const t = useTranslations('selecteurTheme');
  const [selectionne, setSelectionne] = useState('dark');

  useEffectChargement(() => {
    const token = localStorage.getItem('accessToken');
    fetch(`${API_URL}/api/admin/config`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data?.selectedTheme && setSelectionne(data.selectedTheme))
      .catch((error) => signalerErreur('Erreur lors du chargement du thème :', error));
  }, []);

  const changer = async (themeId: string) => {
    setSelectionne(themeId);
    applyTheme(getTheme(themeId));
    try {
      await saveThemeToAPI(themeId, API_URL, localStorage.getItem('accessToken') || '');
    } catch (error) {
      signalerErreur('Erreur lors de l\'enregistrement du thème :', error);
    }
  };

  const theme = getTheme(selectionne);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-bold">{t('titre')}</h2>
      <div>
        <label htmlFor="selecteur-theme" className="block text-sm font-medium mb-3">{t('choisir')}</label>
        <select
          id="selecteur-theme"
          value={selectionne}
          onChange={(e) => changer(e.target.value)}
          className="w-full bg-gray-100 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:border-blue-500"
        >
          {/* Nom et description : `themes.<id>` des traductions, le nom enregistré sinon. */}
          {Object.entries(AVAILABLE_THEMES).map(([id, theme]) => (
            <option key={id} value={id}>
              {t.has(`themes.${id}.nom`)
                ? `${t(`themes.${id}.nom`)} - ${t(`themes.${id}.description`)}`
                : `${theme.name} - ${theme.description}`}
            </option>
          ))}
        </select>
        <p className="text-sm text-gray-500 mt-2">
          {t('aide')}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['primary', 'secondary', 'accent', 'success', 'error', 'warning'].map((type) => {
          const couleur = theme[`${type}Color` as keyof Theme] as string;
          return (
            <div key={type} className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg border border-gray-300 mb-2" style={{ backgroundColor: couleur }} />
              <span className="text-xs text-gray-500 capitalize">{type}</span>
              <span className="text-xs text-gray-500">{couleur}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
