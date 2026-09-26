'use client';

import { useSyncExternalStore } from 'react';

/**
 * Ce que seul le navigateur connaît — l'adresse de la page, le stockage
 * local —, lu sans effet : le rendu serveur et l'hydratation reçoivent la
 * valeur « serveur », puis React refait le rendu avec celle du navigateur.
 * Un écran ouvert par une navigation côté client l'a dès le premier rendu.
 */

const sansAbonnement = () => () => {};

/** Vrai une fois la page hydratée, faux au rendu serveur et à l'hydratation. */
export function useHydrate(): boolean {
  return useSyncExternalStore(sansAbonnement, () => true, () => false);
}

/** Une entrée du stockage local, `undefined` côté serveur. */
export function useStockageLocal(cle: string): string | null | undefined {
  return useSyncExternalStore<string | null | undefined>(
    sansAbonnement,
    () => {
      try {
        return localStorage.getItem(cle);
      } catch {
        return null;
      }
    },
    () => undefined
  );
}

/**
 * Un paramètre de l'adresse de la page (`?filtre=…`), `null` côté serveur.
 *
 * Lu ici plutôt qu'avec `useSearchParams`, qui obligerait à envelopper la
 * page d'une frontière Suspense pour se construire.
 */
export function useParametreAdresse(nom: string): string | null {
  return useSyncExternalStore(
    sansAbonnement,
    () => new URLSearchParams(window.location.search).get(nom),
    () => null
  );
}

/**
 * Le navigateur quitte-t-il la page ?
 *
 * Les requêtes encore en cours y sont coupées et rejettent avec
 * « Failed to fetch » sans que rien n'ait échoué : le visiteur est
 * simplement parti. Un chargement s'en sert pour ne pas consigner d'erreur
 * dans ce cas. `pageshow` remet l'indicateur à faux au retour par
 * « Précédent » (page restaurée depuis le cache).
 */
let departEnCours = false;

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    departEnCours = true;
  });
  window.addEventListener('pageshow', () => {
    departEnCours = false;
  });
}

export function quitteLaPage(): boolean {
  return departEnCours;
}
