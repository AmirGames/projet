'use client';

import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';

/** Même forme que `retard` dans le suivi renvoyé par l'API. */
export interface Retard {
  motif: 'LIVRAISON' | 'NOUVEAU_LIVREUR';
  depuis: string;
}

/**
 * La livraison dérape : en route et en retard, ou confiée à un nouveau
 * livreur. Le client sait que l'équipe suit sa commande plutôt que de
 * regarder une pastille immobile sans explication.
 */
export function RetardLivraison({ retard }: { retard: Retard }) {
  const t = useTranslations('retardLivraison');
  const relais = retard.motif === 'NOUVEAU_LIVREUR';

  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3">
      <Clock size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-amber-800">{t(relais ? 'relaisTitre' : 'retardTitre')}</p>
        <p className="text-sm text-amber-700/90">{t(relais ? 'relaisTexte' : 'retardTexte')}</p>
      </div>
    </div>
  );
}
