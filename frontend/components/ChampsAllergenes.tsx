'use client';

import { useTranslations } from 'next-intl';
import { ALLERGENES, type DeclarationAllergenes, type Allergene } from '@/lib/allergenes';

interface Props {
  valeur: DeclarationAllergenes;
  alcool: boolean;
  onChange: (valeur: DeclarationAllergenes) => void;
  onAlcool: (alcool: boolean) => void;
}

/** Saisie réglementaire d'un produit : allergènes (UE 1169/2011) et alcool. */
export default function ChampsAllergenes({ valeur, alcool, onChange, onAlcool }: Props) {
  const t = useTranslations('allergenes');

  const basculer = (a: Allergene) => {
    const allergens = valeur.allergens.includes(a)
      ? valeur.allergens.filter((x) => x !== a)
      : [...valeur.allergens, a];
    onChange({ allergens, declare: true });
  };

  return (
    <fieldset className="rounded-xl border border-gray-200 bg-white p-3">
      <legend className="px-1 text-sm font-bold text-gray-700">{t('titre')}</legend>
      <p className="mb-2 text-xs text-gray-500">{t('aide')}</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ALLERGENES.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={valeur.allergens.includes(a)} onChange={() => basculer(a)} />
            {t(`noms.${a}`)}
          </label>
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <input
          type="checkbox"
          checked={valeur.declare && valeur.allergens.length === 0}
          onChange={(e) => onChange({ allergens: [], declare: e.target.checked })}
        />
        {t('aucun')}
      </label>
      <label className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 text-sm font-semibold text-gray-800">
        <input type="checkbox" checked={alcool} onChange={(e) => onAlcool(e.target.checked)} />
        {t('alcool')}
      </label>
    </fieldset>
  );
}
