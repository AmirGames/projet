'use client';

import { useEffect, type DependencyList } from 'react';

/**
 * Lance un chargement après le rendu, puis chaque fois que `deps` change :
 * `useEffectChargement(() => { charger(); }, [charger])`.
 *
 * Un `useEffect` qui appelle une fonction de chargement est signalé par la
 * règle react-hooks/set-state-in-effect dès que cette fonction contient un
 * setState, même placé après un `await` : le compilateur ne suit pas
 * l'asynchronisme. Or l'état ne change ici qu'au fil de la requête, comme
 * dans un écouteur — ce que la règle admet —, plus au besoin l'indicateur de
 * chargement d'une relecture. Ce hook nomme ce cas au lieu de le taire.
 *
 * Les dépendances sont vérifiées comme celles d'un effet
 * (`additionalHooks` de react-hooks/exhaustive-deps, eslint.config.mjs).
 */
export function useEffectChargement(effet: () => void, deps: DependencyList) {
  // Les dépendances sont celles de l'appelant, vérifiées chez lui.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effet, deps);
}
