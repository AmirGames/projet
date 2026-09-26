'use client';

import { createContext, useContext } from 'react';
import { trouverRegion, type Region } from '@/i18n/regions';

const RegionContext = createContext<Region | undefined>(undefined);

/**
 * La région du rendu en cours, décidée côté serveur par le layout racine :
 * celle de l'adresse (/be-fr/…), sinon celle du cookie. Absente tant que le
 * visiteur n'en a aucune — les liens restent alors sans préfixe et le
 * proxy choisit pour lui.
 */
export function RegionProvider({ code, children }: { code?: string; children: React.ReactNode }) {
  return <RegionContext.Provider value={trouverRegion(code)}>{children}</RegionContext.Provider>;
}

export function useRegion(): Region | undefined {
  return useContext(RegionContext);
}
