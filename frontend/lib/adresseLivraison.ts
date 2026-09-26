import { useMemo, useSyncExternalStore } from 'react';

/**
 * L'adresse de livraison choisie par le client, gardée d'une visite à l'autre.
 *
 * Comme sur les grandes plateformes, on la demande une fois sur l'accueil :
 * elle sert ensuite à trouver les restaurants proches et pré-remplit le
 * tunnel de commande. Elle vit dans le navigateur, donc un invité en profite
 * autant qu'un client connecté.
 */

export interface AdresseLivraison {
  /** Ce qu'on affiche : « Rue Asty Moulin 63, Namur ». */
  label: string;
  street: string;
  city: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

const CLE = 'zupone.adresseLivraison';

function lireBrut(): string | null {
  try {
    return localStorage.getItem(CLE);
  } catch {
    return null;
  }
}

function analyser(brut: string | null): AdresseLivraison | null {
  if (!brut) return null;
  try {
    const adresse = JSON.parse(brut);
    return adresse && typeof adresse.label === 'string' ? adresse : null;
  } catch {
    return null;
  }
}

export function lireAdresseLivraison(): AdresseLivraison | null {
  return analyser(lireBrut());
}

const sansAbonnement = () => () => {};

/**
 * L'adresse enregistrée, lue au rendu : `undefined` au rendu serveur et à
 * l'hydratation (le serveur ne voit pas le stockage du navigateur), puis
 * l'adresse ou `null`.
 */
export function useAdresseLivraisonEnregistree(): AdresseLivraison | null | undefined {
  const brut = useSyncExternalStore<string | null | undefined>(sansAbonnement, lireBrut, () => undefined);
  return useMemo(() => (brut === undefined ? undefined : analyser(brut)), [brut]);
}

export function enregistrerAdresseLivraison(adresse: AdresseLivraison): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(adresse));
  } catch {
    // Navigation privée ou stockage bloqué : l'adresse vaut pour la visite.
  }
}

export function oublierAdresseLivraison(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    // Rien à faire.
  }
}
