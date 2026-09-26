'use client';

import { useState, useSyncExternalStore } from 'react';
import { COOKIE_PAYS, PAYS_PAR_DEFAUT, paysValide, type Pays } from '@/lib/pays-infos';

/** Fuseaux horaires propres à un pays : l'indice le plus fiable, et gratuit. */
const PAYS_PAR_FUSEAU: Record<string, string> = {
  'Europe/Brussels': 'be',
  'Europe/Paris': 'fr',
  'Europe/Luxembourg': 'lu',
  'Europe/Zurich': 'ch',
  'Europe/Monaco': 'mc',
};

/**
 * Le pays, deviné sans rien demander (code ISO en minuscules, n'importe quel
 * pays).
 *
 * Le fuseau horaire d'abord : bien des Belges ont un navigateur réglé en
 * « fr-FR », mais leur système est à l'heure de Bruxelles. La langue ensuite
 * (« fr-BE », « nl-BE »), faute de mieux.
 */
export function devinerPaysNavigateur(): string | undefined {
  try {
    const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (fuseau && PAYS_PAR_FUSEAU[fuseau]) return PAYS_PAR_FUSEAU[fuseau];
  } catch {
    // Intl absent : on passe à la langue.
  }

  const langues = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  for (const langue of langues) {
    const region = (langue || '').split('-')[1];
    if (region && /^[a-z]{2}$/i.test(region)) return region.toLowerCase();
  }

  return undefined;
}

function lireCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const trouve = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE_PAYS}=`));
  return trouve ? decodeURIComponent(trouve.split('=')[1]) : null;
}

/** Retient le choix du visiteur pour les autres pages (un an). */
export function memoriserPays(pays: Pays) {
  document.cookie = `${COOKIE_PAYS}=${pays}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/**
 * Pays où opère la plateforme pour ce visiteur : choix explicite (?pays=),
 * cookie, fuseau horaire, puis la Belgique.
 */
export function paysDuNavigateur(): Pays {
  if (typeof window !== 'undefined') {
    const explicite = paysValide(new URLSearchParams(window.location.search).get('pays'));
    if (explicite) return explicite;
  }

  return paysValide(lireCookie()) || paysValide(devinerPaysNavigateur()) || PAYS_PAR_DEFAUT;
}

const sansAbonnement = () => () => {};

/**
 * Le pays du visiteur dans un formulaire. Commence par le pays par défaut
 * (rendu serveur identique), puis se cale sur le navigateur. Changer de pays
 * le mémorise.
 */
export function usePays(): [Pays, (pays: Pays) => void] {
  const duNavigateur = useSyncExternalStore(sansAbonnement, paysDuNavigateur, () => PAYS_PAR_DEFAUT);
  const [choisi, setPays] = useState<Pays | null>(null);
  const pays = choisi ?? duNavigateur;

  const choisir = (nouveau: Pays) => {
    setPays(nouveau);
    memoriserPays(nouveau);
  };

  return [pays, choisir];
}
