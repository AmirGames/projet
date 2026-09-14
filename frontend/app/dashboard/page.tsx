'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { espaceDAccueilLocal } from '@/lib/espace-utilisateur';

/**
 * Ancien tableau de bord commerçant, remplacé par /merchant/:orgId.
 *
 * La page est conservée en simple redirection : d'anciens liens, favoris et
 * redirections pointent encore ici. Elle n'affiche plus d'interface, ce qui
 * supprime au passage la double barre de navigation (celle du site plus
 * l'en-tête que cette page dessinait elle-même).
 */
export default function AncienTableauDeBord() {
  const router = useRouter();

  useEffect(() => {
    router.replace(espaceDAccueilLocal());
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600 mx-auto mb-4" />
        <p className="text-gray-400">Redirection vers votre espace...</p>
      </div>
    </div>
  );
}
