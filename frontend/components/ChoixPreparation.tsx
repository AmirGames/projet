'use client';

import { useTranslations } from 'next-intl';
import { Minus, Plus } from 'lucide-react';
import { ReglagesCuisine } from './ReglagesCuisine';
import { heure } from '@/lib/reponse-commande';
import type { EtatCuisine } from '@/lib/use-preparation-cuisine';

export function ChoixPreparation({ storeId, valeur, surChangement, envoi, cuisine, indisponible, invalide }: {
  storeId: string; valeur: string; surChangement: (valeur: string) => void; envoi: boolean;
  cuisine: EtatCuisine | null; indisponible: boolean; invalide: boolean;
}) {
  const t = useTranslations('reponseCommande');
  const tCuisine = useTranslations('cuisinePreparation');
  const minutes = Number(valeur);
  return (
            <div>
              <p className="text-xs text-gray-500 mb-2">{t('tempsPreparation')}</p>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={tCuisine('moins')} disabled={envoi || minutes <= 1} onClick={() => surChangement(String(Math.max(1, minutes - 5)))} className="rounded-lg border p-3 disabled:opacity-50"><Minus size={18} /></button>
                <label className="flex items-center gap-2 font-semibold">
                  <span className="sr-only">{t('dureeLibre')}</span>
                  <input aria-label={t('dureeLibre')} type="number" min={1} max={240} step={1} value={valeur} onChange={(e) => surChangement(e.target.value)} disabled={envoi} className="w-20 rounded-lg border border-gray-300 bg-white p-3 text-center text-lg" />
                  {tCuisine('minutes')}
                </label>
                <button type="button" aria-label={tCuisine('plus')} disabled={envoi || minutes >= 240} onClick={() => surChangement(String(Math.min(240, minutes + 5)))} className="rounded-lg border p-3 disabled:opacity-50"><Plus size={18} /></button>
              </div>
              {cuisine && <p className="mt-2 text-xs text-gray-600">{tCuisine(cuisine.source === 'HISTORIQUE' ? 'historique' : 'parDefaut', { n: cuisine.habituelle })} · {tCuisine('enCours', { n: cuisine.commandesEnCours })}</p>}
              {cuisine?.rush && <p className="mt-2 text-sm text-amber-800">{tCuisine('rushActif', { n: cuisine.rush.supplementMinutes, heure: heure(cuisine.rush.jusqua) })}</p>}
              {indisponible && <p className="mt-2 text-xs text-amber-800">{tCuisine('indisponible')}</p>}
              {cuisine && <ReglagesCuisine storeId={storeId} etat={cuisine} />}
              <p className="mt-2 text-xs text-gray-600">{t('delaiAnnonceClient')}</p>
              {invalide && <p role="alert" className="mt-2 text-sm text-red-600">{t('dureeInvalide')}</p>}
            </div>
  );
}
