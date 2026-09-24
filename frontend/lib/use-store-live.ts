'use client';

import { useConnexionTempsReel, useSalon, useTempsReel } from '@/lib/temps-reel';

export interface ChangementDisponibilite {
  productId: string;
  storeId?: string;
  name: string;
  isAvailable: boolean;
}

/** Une déclinaison telle que le serveur la pousse. */
export interface DeclinaisonEnDirect {
  id: string;
  label: string;
  price: number | null;
  prixEffectif: number;
  isAvailable: boolean;
  displayOrder: number;
}

export interface ChangementDeclinaisons {
  productId: string;
  storeId?: string;
  variantes: DeclinaisonEnDirect[];
}

/**
 * Suit en direct les changements de menu d'une boutique.
 *
 * Sans cela, un client qui garde la page ouverte peut mettre au panier un
 * plat épuisé depuis dix minutes et ne l'apprendre qu'au moment de commander.
 *
 * La connexion est anonyme si le visiteur n'a pas de compte : la vitrine est
 * publique, et la disponibilité d'un plat l'est aussi.
 */
export function useStoreLive(
  storeId: string | undefined,
  surChangement: (changement: ChangementDisponibilite) => void,
  surDeclinaisons?: (changement: ChangementDeclinaisons) => void
) {
  const connecte = useConnexionTempsReel();

  useSalon('store', storeId);

  // La connexion est partagée par tout l'onglet, qui peut suivre d'autres
  // boutiques : on ne retient que celle-ci.
  const estDIci = (donnees: { storeId?: string }) => !donnees.storeId || donnees.storeId === storeId;

  useTempsReel<ChangementDisponibilite>(
    'produit-disponibilite',
    (donnees) => {
      if (estDIci(donnees)) surChangement(donnees);
    },
    Boolean(storeId)
  );

  // Une déclinaison épuisée doit disparaître des choix comme un plat
  // disparaît du panier : sans cela, le client la retient et la commande
  // échoue au dernier moment.
  useTempsReel<ChangementDeclinaisons>(
    'produit-declinaisons',
    (donnees) => {
      if (estDIci(donnees)) surDeclinaisons?.(donnees);
    },
    Boolean(storeId)
  );

  return { connecte };
}
