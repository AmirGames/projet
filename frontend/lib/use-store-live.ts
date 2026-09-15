'use client';

import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ChangementDisponibilite {
  productId: string;
  name: string;
  isAvailable: boolean;
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
  surChangement: (changement: ChangementDisponibilite) => void
) {
  const [connecte, setConnecte] = useState(false);

  // Le rappel est relu à chaque événement plutôt que capturé à l'ouverture :
  // sinon il garde la version d'origine et travaille sur un menu périmé.
  const rappel = useRef(surChangement);
  rappel.current = surChangement;

  useEffect(() => {
    if (!storeId) return;

    let jeton: string | null = null;
    try {
      jeton = localStorage.getItem('accessToken');
    } catch {
      // Stockage refusé : on se connecte en anonyme, ce qui suffit ici.
    }

    const socket = io(API_URL, {
      auth: jeton ? { token: jeton } : {},
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnecte(true);
      socket.emit('join-store', storeId);
    });

    socket.on('disconnect', () => setConnecte(false));

    socket.on('produit-disponibilite', (donnees: ChangementDisponibilite) => {
      rappel.current(donnees);
    });

    return () => {
      socket.emit('leave-store', storeId);
      socket.disconnect();
    };
  }, [storeId]);

  return { connecte };
}
