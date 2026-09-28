'use client';

import { useState } from 'react';

import { euro } from '@/lib/format';

/** Les pourcentages proposés d'un clic, calculés sur le montant des articles. */
export const POURCENTAGES_POURBOIRE = [5, 10, 15];
export const POURBOIRE_MAXIMUM = 50;

/** Le montant d'un pourcentage, arrondi au centime. */
export const montantDuPourcentage = (base: number, pourcentage: number) =>
  Math.round(base * pourcentage) / 100;

type Choix = 'aucun' | number | 'autre';

/**
 * Le choix du pourboire : « Aucun », 5 %, 10 %, 15 % — chacun avec son
 * montant écrit dessous — ou « Autre » pour saisir le sien.
 *
 * Sert au tunnel de commande et à la page de suivi, une fois livrée. Le
 * montant choisi remonte en euros ; `sansAucun` retire « Aucun » là où ne
 * rien choisir revient à ne pas payer (après la livraison).
 */
export function ChoixPourboire({
  base,
  onChange,
  sansAucun = false,
  initial,
}: {
  /** Le montant des articles, sur lequel se calculent les pourcentages. */
  base: number;
  onChange: (montant: number) => void;
  sansAucun?: boolean;
  initial?: Choix;
}) {
  const [choix, setChoix] = useState<Choix>(initial ?? (sansAucun ? 10 : 'aucun'));
  const [libre, setLibre] = useState('');

  const choisir = (suivant: Choix) => {
    setChoix(suivant);
    if (suivant === 'aucun') onChange(0);
    else if (suivant === 'autre') onChange(lireLibre(libre));
    else onChange(montantDuPourcentage(base, suivant));
  };

  const lireLibre = (texte: string) => {
    const saisi = Number(texte.replace(',', '.'));
    return Number.isFinite(saisi) ? Math.min(Math.max(saisi, 0), POURBOIRE_MAXIMUM) : 0;
  };

  const pastille = (actif: boolean) =>
    `min-w-[4.5rem] flex flex-col items-center rounded-xl border px-3 py-1.5 text-sm transition ${
      actif ? 'border-red-500 bg-red-500/20 text-red-100' : 'border-gray-600 text-gray-300 hover:border-gray-400'
    }`;

  return (
    <div>
      <div role="group" aria-label="Pourboire pour le livreur" className="flex flex-wrap gap-2">
        {!sansAucun && (
          <button type="button" aria-pressed={choix === 'aucun'} onClick={() => choisir('aucun')} className={pastille(choix === 'aucun')}>
            <span className="font-semibold">Aucun</span>
            <span className="text-xs opacity-70">&nbsp;</span>
          </button>
        )}
        {POURCENTAGES_POURBOIRE.map((pourcentage) => (
          <button
            key={pourcentage}
            type="button"
            aria-pressed={choix === pourcentage}
            aria-label={`${pourcentage} %, soit ${euro(montantDuPourcentage(base, pourcentage))}`}
            onClick={() => choisir(pourcentage)}
            className={pastille(choix === pourcentage)}
          >
            <span className="font-semibold">{pourcentage} %</span>
            <span className="text-xs opacity-80">{euro(montantDuPourcentage(base, pourcentage))}</span>
          </button>
        ))}
        <button type="button" aria-pressed={choix === 'autre'} onClick={() => choisir('autre')} className={pastille(choix === 'autre')}>
          <span className="font-semibold">Autre</span>
          <span className="text-xs opacity-70">montant</span>
        </button>
      </div>
      {choix === 'autre' && (
        <label className="mt-2 flex items-center gap-2 text-sm text-gray-300">
          Montant
          <input
            type="number"
            min={0}
            max={POURBOIRE_MAXIMUM}
            step="0.5"
            inputMode="decimal"
            autoFocus
            aria-label="Montant du pourboire"
            value={libre}
            onChange={(e) => {
              setLibre(e.target.value);
              onChange(lireLibre(e.target.value));
            }}
            className="w-24 bg-gray-700 border border-gray-600 rounded-full px-3 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
          €
        </label>
      )}
    </div>
  );
}
