'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Le livreur est à la porte et n'arrive pas à joindre le client : six minutes
 * de compte à rebours, après quoi la commande est déposée en lieu sûr.
 *
 * `maintenant` est l'heure du serveur au moment de la lecture : l'écart avec
 * l'horloge du téléphone est corrigé, sans quoi une montre mal réglée
 * annoncerait une échéance fausse.
 */
export function AttenteLivreur({ finLe, maintenant }: { finLe: string; maintenant?: string | null }) {
  const t = useTranslations('attenteLivreur');
  const [ecart] = useState(() => (maintenant ? new Date(maintenant).getTime() - Date.now() : 0));
  const [instant, setInstant] = useState(() => Date.now());

  useEffect(() => {
    const minuteur = setInterval(() => setInstant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, []);

  const reste = Math.max(0, new Date(finLe).getTime() - (instant + ecart));
  const minutes = Math.floor(reste / 60000);
  const secondes = Math.floor((reste % 60000) / 1000);

  return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="font-semibold text-amber-800">{t('titre')}</p>
      {reste > 0 ? (
        <>
          <p className="text-3xl font-bold text-gray-900 tabular-nums my-1">
            {minutes}:{String(secondes).padStart(2, '0')}
          </p>
          <p className="text-sm text-amber-800/90">
            {t('aide')}
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-800/90 mt-1">
          {t('ecoule')}
        </p>
      )}
    </div>
  );
}
