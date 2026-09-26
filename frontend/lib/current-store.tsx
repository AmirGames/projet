'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface MerchantStore {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  isOpen?: boolean;
}

interface CurrentStoreValue {
  stores: MerchantStore[];
  currentStore: MerchantStore | null;
  storeId: string;
  loading: boolean;
  selectStore: (storeId: string) => void;
  refresh: () => Promise<void>;
}

const CurrentStoreContext = createContext<CurrentStoreValue | undefined>(undefined);

const storageKey = (orgId: string) => `currentStoreId:${orgId}`;

/**
 * Mémorise la boutique à gérer depuis l'extérieur de l'espace commerçant.
 *
 * Le choix se fait sur /merchant, hors du fournisseur de contexte : sans
 * cela, toutes les boutiques mènent au même tableau de bord et le choix ne
 * sert à rien.
 */
export function memoriserBoutique(orgId: string, storeId: string) {
  try {
    localStorage.setItem(storageKey(orgId), storeId);
  } catch {
    // Navigation privée ou stockage refusé : la boutique par défaut prendra
    // le relais, ce n'est pas bloquant.
  }
}

export function CurrentStoreProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: React.ReactNode;
}) {
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/stores/org/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const list: MerchantStore[] = await response.json();
      setStores(list);

      // Une sélection mémorisée peut pointer vers une boutique supprimée.
      const remembered = localStorage.getItem(storageKey(orgId));
      const valid = list.some((s) => s.id === remembered);
      setStoreId(valid ? (remembered as string) : list[0]?.id || '');
    } catch (error) {
      console.error('Error loading stores:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // Une autre organisation : ses boutiques restent à lire.
  const [orgVue, setOrgVue] = useState(orgId);
  if (orgId !== orgVue) {
    setOrgVue(orgId);
    setLoading(true);
  }

  useEffectChargement(() => {
    load();
  }, [load]);

  const selectStore = useCallback(
    (id: string) => {
      setStoreId(id);
      localStorage.setItem(storageKey(orgId), id);
    },
    [orgId]
  );

  const value = useMemo<CurrentStoreValue>(
    () => ({
      stores,
      currentStore: stores.find((s) => s.id === storeId) || null,
      storeId,
      loading,
      selectStore,
      refresh: load,
    }),
    [stores, storeId, loading, selectStore, load]
  );

  return <CurrentStoreContext.Provider value={value}>{children}</CurrentStoreContext.Provider>;
}

export function useCurrentStore() {
  const context = useContext(CurrentStoreContext);

  if (!context) {
    throw new Error("useCurrentStore doit être utilisé dans l'espace commerçant");
  }

  return context;
}
