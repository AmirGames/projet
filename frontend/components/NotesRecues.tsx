'use client';

/**
 * Ce que les clients ont dit des courses d'un livreur.
 *
 * Sa note se résumait à un chiffre — et à un chiffre faux, puisque personne ne
 * l'écrivait. Une moyenne sans les remarques ne dit pas quoi corriger : un
 * livreur noté 3 doit pouvoir lire pourquoi.
 *
 * Il lit ce qu'on lui reproche, jamais qui le lui reproche : le serveur ne
 * renvoie pas le client, parce qu'une note nominative se règlerait à la course
 * suivante.
 */

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { Etoiles } from '@/components/NoterLivreur';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Note {
  id: string;
  note: number;
  commentaire: string | null;
  createdAt: string;
}

export function NotesRecues() {
  const [moyenne, setMoyenne] = useState<number | null>(null);
  const [avis, setAvis] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const reponse = await fetch(`${API_URL}/api/drivers/ratings`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        });

        if (reponse.ok) {
          const { data } = await reponse.json();
          setMoyenne(data?.moyenne ?? null);
          setAvis(data?.avis ?? 0);
          setNotes(data?.notes || []);
        }
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  if (chargement) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Star size={18} className="text-orange-500" />
          Ce que disent les clients
        </h2>

        {moyenne != null && (
          <span className="flex items-center gap-2 text-sm text-gray-300">
            <Etoiles valeur={moyenne} taille={14} />
            {moyenne.toFixed(1).replace('.', ',')} · {avis} avis
          </span>
        )}
      </div>

      {avis === 0 ? (
        <p className="text-sm text-gray-500">
          Aucune note pour l'instant. Vos clients pourront vous noter une fois leur commande remise.
        </p>
      ) : (
        <ul className="space-y-3">
          {notes.map((ligne) => (
            <li key={ligne.id} className="border-b border-gray-700 last:border-0 pb-3 last:pb-0">
              <div className="flex items-center gap-2">
                <Etoiles valeur={ligne.note} taille={14} />
                <span className="text-xs text-gray-500">
                  {new Date(ligne.createdAt).toLocaleDateString('fr-FR')}
                </span>
              </div>
              {ligne.commentaire && (
                <p className="text-sm text-gray-300 mt-1">{ligne.commentaire}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
