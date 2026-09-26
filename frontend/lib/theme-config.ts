import { signalerErreur } from '@/lib/erreurs';

export interface Theme {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  successColor: string;
  errorColor: string;
  warningColor: string;
}

export const AVAILABLE_THEMES: Record<string, Theme> = {
  dark: {
    id: 'dark',
    name: 'Sombre (Défaut)',
    description: 'Thème sombre classique avec fond gris foncé',
    primaryColor: '#3b82f6', // blue-500
    secondaryColor: '#1f2937', // gray-800
    accentColor: '#f59e0b', // amber-500
    backgroundColor: '#111827', // gray-900
    textColor: '#f3f4f6', // gray-100
    borderColor: '#374151', // gray-700
    successColor: '#10b981', // emerald-500
    errorColor: '#ef4444', // red-500
    warningColor: '#f59e0b', // amber-500
  },
  ocean: {
    id: 'ocean',
    name: 'Océan',
    description: 'Thème bleu océan avec accents turquoise',
    primaryColor: '#0891b2', // cyan-600
    secondaryColor: '#164e63', // cyan-900
    accentColor: '#06b6d4', // cyan-500
    backgroundColor: '#082f49', // cyan-950
    textColor: '#ecf0f1', // light gray
    borderColor: '#155e75', // cyan-800
    successColor: '#14b8a6', // teal-500
    errorColor: '#f87171', // red-400
    warningColor: '#fbbf24', // amber-400
  },
  forest: {
    id: 'forest',
    name: 'Forêt',
    description: 'Thème vert naturel avec accents de bois',
    primaryColor: '#16a34a', // green-600
    secondaryColor: '#1b4332', // green-900
    accentColor: '#22c55e', // green-500
    backgroundColor: '#0f172a', // slate-900
    textColor: '#f1f5f9', // slate-100
    borderColor: '#365314', // green-800
    successColor: '#10b981', // emerald-500
    errorColor: '#f87171', // red-400
    warningColor: '#facc15', // yellow-400
  },
  sunset: {
    id: 'sunset',
    name: 'Coucher de soleil',
    description: 'Thème chaud avec dégradé orange-rouge',
    primaryColor: '#f97316', // orange-500
    secondaryColor: '#7c2d12', // orange-900
    accentColor: '#fb923c', // orange-400
    backgroundColor: '#1c1917', // stone-900
    textColor: '#faf9f6', // stone-50
    borderColor: '#92400e', // amber-900
    successColor: '#34d399', // emerald-400
    errorColor: '#ff6b6b', // red-500
    warningColor: '#fbbf24', // amber-400
  },
  neon: {
    id: 'neon',
    name: 'Néon',
    description: 'Thème futuriste avec couleurs lumineuses',
    primaryColor: '#ec4899', // pink-500
    secondaryColor: '#2d1b4e', // purple-950
    accentColor: '#06b6d4', // cyan-500
    backgroundColor: '#0f0017', // nearly black
    textColor: '#e0e0e0', // light gray
    borderColor: '#4c1d95', // purple-900
    successColor: '#00ff00', // neon green
    errorColor: '#ff0080', // neon pink
    warningColor: '#ffff00', // neon yellow
  },
  professional: {
    id: 'professional',
    name: 'Professionnel',
    description: 'Thème sobre et minimaliste pour les affaires',
    primaryColor: '#1e40af', // blue-800
    secondaryColor: '#1e293b', // slate-800
    accentColor: '#7c3aed', // violet-600
    backgroundColor: '#0f172a', // slate-900
    textColor: '#e2e8f0', // slate-200
    borderColor: '#334155', // slate-700
    successColor: '#059669', // emerald-600
    errorColor: '#dc2626', // red-600
    warningColor: '#d97706', // amber-600
  },
};

export const getTheme = (themeId: string): Theme => {
  return AVAILABLE_THEMES[themeId] || AVAILABLE_THEMES.dark;
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.primaryColor);
  root.style.setProperty('--color-secondary', theme.secondaryColor);
  root.style.setProperty('--color-accent', theme.accentColor);
  root.style.setProperty('--color-background', theme.backgroundColor);
  root.style.setProperty('--color-text', theme.textColor);
  root.style.setProperty('--color-border', theme.borderColor);
  root.style.setProperty('--color-success', theme.successColor);
  root.style.setProperty('--color-error', theme.errorColor);
  root.style.setProperty('--color-warning', theme.warningColor);
  localStorage.setItem('selectedTheme', theme.id);
};

export const loadSavedTheme = () => {
  const saved = localStorage.getItem('selectedTheme');
  const theme = getTheme(saved || 'dark');
  applyTheme(theme);
  return theme;
};

export const loadThemeFromAPI = async (apiUrl: string, token: string) => {
  try {
    const response = await fetch(`${apiUrl}/api/admin/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok) {
      const data = await response.json();
      const themeName = data.selectedTheme || 'dark';
      const theme = getTheme(themeName);
      applyTheme(theme);
      return theme;
    }
  } catch (error) {
    signalerErreur('Erreur lors du chargement du thème:', error);
  }

  return loadSavedTheme();
};

export const saveThemeToAPI = async (themeId: string, apiUrl: string, token: string) => {
  try {
    const response = await fetch(`${apiUrl}/api/admin/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ selectedTheme: themeId }),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    signalerErreur('Erreur lors de la sauvegarde du thème:', error);
  }

  return null;
};
