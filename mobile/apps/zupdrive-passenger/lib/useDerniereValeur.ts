import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Une référence qui garde la dernière valeur rendue, lisible depuis un
 * écouteur ou un minuteur sans les relancer à chaque rendu.
 *
 * Elle est mise à jour après le rendu (et non pendant) : lire `ref.current`
 * dans un écouteur donne toujours la valeur du dernier rendu validé.
 */
export function useDerniereValeur<T>(valeur: T): MutableRefObject<T> {
  const ref = useRef(valeur);
  useEffect(() => {
    ref.current = valeur;
  });
  return ref;
}
