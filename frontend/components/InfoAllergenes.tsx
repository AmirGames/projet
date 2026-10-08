'use client';

import { useTranslations } from 'next-intl';
import type { Allergene } from '@/lib/allergenes';

interface Props {
  produit: { allergens?: Allergene[]; allergensDeclared?: boolean; containsAlcohol?: boolean };
  compact?: boolean;
}

/** Allergènes et alcool d'un plat, affichés avant la commande (UE 1169/2011). */
export default function InfoAllergenes({ produit, compact }: Props) {
  const t = useTranslations('allergenes');
  const liste = produit.allergens ?? [];
  const taille = compact ? 'mt-1 text-xs' : 'mt-3 text-sm';

  return (
    <div className={`${taille} space-y-0.5 text-gray-600`}>
      {liste.length > 0 ? (
        <p>{t('contient', { liste: liste.map((a) => t(`noms.${a}`)).join(', ') })}</p>
      ) : produit.allergensDeclared ? (
        <p>{t('sansAllergene')}</p>
      ) : (
        <p className="text-gray-400">{t('nonRenseigne')}</p>
      )}
      {produit.containsAlcohol && <p className="font-semibold text-red-700">{t('alcoolEtiquette')}</p>}
    </div>
  );
}
