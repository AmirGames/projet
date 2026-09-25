'use client';

/**
 * Le délai de repentir, entre « Payer » et l'envoi au commerçant.
 *
 * Un dessert oublié se remarquait une fois la commande partie, trop tard pour
 * y revenir. Pendant quelques secondes, le client relit ce qu'il envoie : il
 * peut revenir à la boutique compléter son panier, ou laisser partir la
 * commande sans attendre. Le compte à rebours écoulé, elle part d'elle-même.
 */

import { useEffect, useRef, useState } from 'react';
import { Clock, MapPin, ShoppingBag } from 'lucide-react';

import type { LignePanier } from '@/lib/paniers';

export const DUREE_DU_DELAI = 10;

interface Props {
  lieu: string;
  precisionLieu?: string;
  horaire: string;
  boutique: string;
  lignes: LignePanier[];
  /** La commande part au commerçant (bouton ou fin du compte à rebours). */
  surPartir: () => void;
  /** Le client revient en arrière : rien n'est envoyé. */
  surRetour: () => void;
}

export function DelaiAnnulation({
  lieu,
  precisionLieu,
  horaire,
  boutique,
  lignes,
  surPartir,
  surRetour,
}: Props) {
  const [restant, setRestant] = useState(DUREE_DU_DELAI);
  // Une seule issue : un clic sur « Parfait » au moment où le délai expire ne
  // doit pas envoyer la commande deux fois.
  const tranche = useRef(false);

  const partir = () => {
    if (tranche.current) return;
    tranche.current = true;
    surPartir();
  };

  const retour = () => {
    if (tranche.current) return;
    tranche.current = true;
    surRetour();
  };

  useEffect(() => {
    const debut = Date.now();
    const minuteur = setInterval(() => {
      const reste = Math.max(0, DUREE_DU_DELAI - Math.floor((Date.now() - debut) / 1000));
      setRestant(reste);
      if (reste === 0) clearInterval(minuteur);
    }, 200);
    return () => clearInterval(minuteur);
  }, []);

  useEffect(() => {
    if (restant === 0) partir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restant]);

  const ecoule = ((DUREE_DU_DELAI - restant) / DUREE_DU_DELAI) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delai-titre"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-3xl bg-white text-gray-900 shadow-2xl p-6 space-y-4">
        <h2 id="delai-titre" className="text-2xl font-bold">
          Commande en cours…
        </h2>

        <div className="flex gap-4 border-b border-gray-200 pb-4">
          <MapPin className="shrink-0 mt-0.5 text-gray-600" size={22} />
          <div className="min-w-0">
            <p className="font-medium truncate">{lieu}</p>
            {precisionLieu && <p className="text-sm text-gray-500 truncate">{precisionLieu}</p>}
          </div>
        </div>

        <div className="flex gap-4 border-b border-gray-200 pb-4">
          <Clock className="shrink-0 mt-0.5 text-gray-600" size={22} />
          <p className="font-medium">{horaire}</p>
        </div>

        <div className="flex gap-4">
          <ShoppingBag className="shrink-0 mt-0.5 text-gray-600" size={22} />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{boutique}</p>
            <ul className="text-sm text-gray-500 space-y-0.5 max-h-40 overflow-y-auto">
              {lignes.map((ligne, i) => (
                <li key={`${ligne.productId}-${ligne.variantId ?? ''}-${i}`}>
                  {ligne.quantity}x&nbsp;&nbsp;{ligne.name}
                  {ligne.variantNom ? ` (${ligne.variantNom})` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button
          type="button"
          onClick={partir}
          className="relative w-full overflow-hidden rounded-xl bg-gray-700 py-4 text-lg font-semibold text-white"
        >
          {/* La barre se remplit à mesure que le délai s'écoule. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-black transition-[width] duration-200 ease-linear"
            style={{ width: `${ecoule}%` }}
          />
          <span className="relative">
            Parfait (00:{String(restant).padStart(2, '0')})
          </span>
        </button>

        <button
          type="button"
          onClick={retour}
          className="w-full py-2 text-lg font-semibold hover:underline"
        >
          Retour
        </button>
      </div>
    </div>
  );
}
