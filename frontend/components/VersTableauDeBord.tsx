'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DOMAINE_LIVREUR } from '@/lib/domaines';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Sur le domaine livreur, l'accueil présente le métier à ceux qui ne livrent
 * pas encore. Un livreur connecté, lui, vient travailler : il part droit vers
 * son tableau de bord, qui le renvoie à la connexion si sa session a expiré.
 *
 * Ailleurs (site sur un seul domaine, développement), la page reste une page
 * de présentation : un client connecté qui la lit n'a pas à être emmené dans
 * l'espace livreur.
 */
export function VersTableauDeBord() {
  const router = useRouter();

  useEffect(() => {
    if (!DOMAINE_LIVREUR || window.location.hostname !== DOMAINE_LIVREUR) return;

    let jeton: string | null = null;
    try {
      jeton = localStorage.getItem('accessToken');
    } catch {
      return;
    }
    if (!jeton) return;

    // Connecté ne veut pas dire livreur : un superowner, un client ou un
    // commerçant n'a pas de profil livreur, et /driver le renverrait ici en
    // boucle. On ne part vers le tableau de bord que si le profil existe.
    let annule = false;
    fetch(`${API_URL}/api/drivers/me`, { headers: { Authorization: `Bearer ${jeton}` } })
      .then((reponse) => {
        if (reponse.ok && !annule) router.replace('/driver');
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [router]);

  return null;
}
