'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Une référence qui suit la dernière valeur reçue au rendu.
 *
 * Pour un rappel lu par un écouteur (WebSocket, carte, minuteur) qui ne doit
 * pas être redéclaré chaque fois que le parent recrée ce rappel. La référence
 * est mise à jour après le rendu — écrire dans une ref pendant le rendu est
 * interdit — et avant les effets de l'écran, qui la lisent donc à jour.
 */
export function useDerniereValeur<T>(valeur: T) {
  const ref = useRef(valeur);
  useLayoutEffect(() => {
    ref.current = valeur;
  });
  return ref;
}
