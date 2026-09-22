'use client';

import { useTranslations } from 'next-intl';
import { Store } from 'lucide-react';
import { useCurrentStore } from '@/lib/current-store';

export function StoreSwitcher() {
  const t = useTranslations('storeSwitcher');
  const { stores, storeId, selectStore, loading } = useCurrentStore();

  if (loading || stores.length === 0) return null;

  // Une seule boutique : afficher son nom suffit, pas besoin de choix.
  if (stores.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Store size={16} />
        <span className="truncate max-w-[200px]">{stores[0].name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Store size={16} className="text-gray-400 flex-shrink-0" />
      <select
        value={storeId}
        onChange={(e) => selectStore(e.target.value)}
        title={t('managedStore')}
        className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-orange-500 max-w-[220px]"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
            {store.city ? ` — ${store.city}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
