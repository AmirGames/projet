'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTempsReel } from '@/lib/temps-reel';
import { appliquerPanierDistant, synchroniserPaniers, type PanierDistant } from '@/lib/paniers';

/** Au plus une relecture complète par demi-minute au retour sur l'onglet. */
const RELECTURE_MIN_MS = 30000;

/**
 * Tient les paniers du navigateur à jour avec ceux du compte.
 *
 * Un panier commencé sur le téléphone apparaît ici, et inversement, sans
 * recharger la page : le serveur annonce chaque modification
 * (« panier-modifie ») à tous les appareils connectés du compte. Sans compte,
 * rien ne change : le panier reste dans ce navigateur.
 */
export default function SynchroPaniers() {
  const { user } = useAuth();
  const connecte = Boolean(user);

  useEffect(() => {
    if (!connecte) return;
    synchroniserPaniers();

    let derniere = Date.now();
    const auRetour = () => {
      if (Date.now() - derniere < RELECTURE_MIN_MS) return;
      derniere = Date.now();
      synchroniserPaniers();
    };
    window.addEventListener('focus', auRetour);
    return () => window.removeEventListener('focus', auRetour);
  }, [connecte, user?.id]);

  useTempsReel<PanierDistant>('panier-modifie', appliquerPanierDistant, connecte);
  // Ce qui a changé pendant une coupure n'a pas été annoncé : on relit.
  useTempsReel('connect', () => synchroniserPaniers(), connecte);

  return null;
}
