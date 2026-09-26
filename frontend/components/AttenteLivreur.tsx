'use client';

import { useEffect, useState } from 'react';

/**
 * Le livreur est à la porte et n'arrive pas à joindre le client : six minutes
 * de compte à rebours, après quoi la commande est déposée en lieu sûr.
 *
 * `maintenant` est l'heure du serveur au moment de la lecture : l'écart avec
 * l'horloge du téléphone est corrigé, sans quoi une montre mal réglée
 * annoncerait une échéance fausse.
 */
export function AttenteLivreur({ finLe, maintenant }: { finLe: string; maintenant?: string | null }) {
  const [ecart] = useState(() => (maintenant ? new Date(maintenant).getTime() - Date.now() : 0));
  const [instant, setInstant] = useState(() => Date.now());

  useEffect(() => {
    const minuteur = setInterval(() => setInstant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, []);

  const reste = Math.max(0, new Date(finLe).getTime() - (instant + ecart));
  const minutes = Math.floor(reste / 60000);
  const secondes = Math.floor((reste % 60000) / 1000);

  return (
    <div role="alert" className="rounded-lg border border-amber-600/60 bg-amber-900/30 px-4 py-3">
      <p className="font-semibold text-amber-200">Votre livreur est devant chez vous et vous attend</p>
      {reste > 0 ? (
        <>
          <p className="text-3xl font-bold text-white tabular-nums my-1">
            {minutes}:{String(secondes).padStart(2, '0')}
          </p>
          <p className="text-sm text-amber-100/90">
            Il n&apos;arrive pas à vous joindre. Descendez ou appelez-le : passé ce délai, il déposera votre
            commande en lieu sûr et vous enverra la photo.
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-100/90 mt-1">
          Le délai est écoulé : votre livreur dépose la commande en lieu sûr. La photo et l&apos;endroit
          s&apos;afficheront ici.
        </p>
      )}
    </div>
  );
}
