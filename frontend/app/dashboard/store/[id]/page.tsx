'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { espaceDAccueilLocal } from '@/lib/espace-utilisateur';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/**
 * Ancienne page de gestion d'une boutique, remplacée par l'espace commerçant.
 *
 * Le lien « Gérer » menait encore ici, vers l'interface précédente. On récupère
 * l'organisation propriétaire de la boutique pour rejoindre l'espace actuel, et
 * on mémorise la boutique choisie afin que le sélecteur se positionne dessus.
 */
export default function AncienneGestionBoutique() {
  const router = useRouter();
  const params = useParams();
  const storeId = params?.id as string;

  useEffect(() => {
    const rediriger = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const reponse = await fetch(`${API_URL}/stores/${storeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (reponse.ok) {
          const donnees = await reponse.json();
          const boutique = donnees.store || donnees;
          const orgId = boutique?.orgId;

          if (orgId) {
            localStorage.setItem(`currentStoreId:${orgId}`, storeId);
            router.replace(`/merchant/${orgId}/dashboard`);
            return;
          }
        }
      } catch {
        // On retombe sur l'espace d'accueil ci-dessous.
      }

      router.replace(espaceDAccueilLocal());
    };

    if (storeId) rediriger();
    else router.replace(espaceDAccueilLocal());
  }, [storeId, router]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto mb-4" />
        <p className="text-gray-400">Ouverture de votre boutique...</p>
      </div>
    </div>
  );
}
