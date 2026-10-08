'use client';

import { useState } from 'react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

/**
 * Le thème sombre d'un espace de travail : un choix par navigateur et par
 * espace (`cle`), clair tant qu'on n'a rien choisi. Lu après l'affichage, pour
 * que le serveur et le navigateur rendent la même chose.
 *
 * `classe` se pose sur le conteneur de l'espace ; `app/theme-sombre.css` fait
 * le reste.
 */
export function useThemeSombre(cle: string) {
  const [sombre, setSombre] = useState(false);
  useEffectChargement(() => {
    try {
      setSombre(localStorage.getItem(cle) === 'sombre');
    } catch {
      /* stockage indisponible : thème clair */
    }
  }, [cle]);
  const basculer = () => {
    const suivant = !sombre;
    setSombre(suivant);
    try {
      localStorage.setItem(cle, suivant ? 'sombre' : 'clair');
    } catch {
      /* le choix vaut pour cette visite seulement */
    }
  };
  return { sombre, basculer, classe: sombre ? 'theme-sombre' : '' };
}
