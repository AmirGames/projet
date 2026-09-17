'use client';

/**
 * Noter son livreur, une fois la commande reçue.
 *
 * La note du livreur valait 5,00 pour tout le monde : c'était la valeur par
 * défaut de la colonne, et rien ne l'écrivait. Le client qui avait attendu une
 * heure n'avait nulle part où le dire, et celui qui avait été bien livré non
 * plus.
 *
 * Les étoiles s'affichent là où le client regarde déjà — sur le suivi de sa
 * commande, au moment où elle vient d'arriver —, plutôt que sur une page qu'il
 * faudrait penser à ouvrir.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const NOTES = [1, 2, 3, 4, 5] as const;

/** Ce que chaque étoile veut dire, pour que le client ne devine pas. */
const LIBELLES: Record<number, string> = {
  1: 'Très mauvaise',
  2: 'Mauvaise',
  3: 'Correcte',
  4: 'Bonne',
  5: 'Excellente',
};

export interface MaNote {
  note: number;
  commentaire?: string | null;
}

interface Props {
  orderId: string;
  prenomLivreur?: string | null;
  /** La note déjà donnée : les étoiles ne se redemandent pas. */
  maNote?: MaNote | null;
  onNote?: (note: MaNote) => void;
}

export function NoterLivreur({ orderId, prenomLivreur, maNote, onNote }: Props) {
  const [choisie, setChoisie] = useState(0);
  const [survolee, setSurvolee] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  if (maNote) {
    return (
      <div className="border-t border-gray-700 pt-4">
        <p className="text-sm text-gray-400 mb-2">Votre note</p>
        <Etoiles valeur={maNote.note} />
        {maNote.commentaire && (
          <p className="text-sm text-gray-300 mt-2 italic">« {maNote.commentaire} »</p>
        )}
      </div>
    );
  }

  const envoyer = async () => {
    if (!choisie) return;

    setEnvoi(true);
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/client/deliveries/${orderId}/rating`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          note: choisie,
          ...(commentaire.trim() ? { commentaire: commentaire.trim() } : {}),
        }),
      });

      const donnees = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        // Le message du serveur dit ce qui ne va pas — déjà notée, course non
        // remise. Le remplacer par « une erreur est survenue » le perdrait.
        setErreur(donnees?.message || donnees?.error || 'La note n’a pas pu être enregistrée');
        return;
      }

      onNote?.({ note: choisie, commentaire: commentaire.trim() || null });
    } catch {
      setErreur('La note n’a pas pu être envoyée : vérifiez votre connexion.');
    } finally {
      setEnvoi(false);
    }
  };

  const affichee = survolee || choisie;

  return (
    <div className="border-t border-gray-700 pt-4">
      <p className="text-sm text-white font-semibold">
        Comment s’est passée votre livraison{prenomLivreur ? ` avec ${prenomLivreur}` : ''} ?
      </p>

      <div
        className="flex items-center gap-2 mt-3"
        onMouseLeave={() => setSurvolee(0)}
        role="radiogroup"
        aria-label="Note du livreur"
      >
        {NOTES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={choisie === valeur}
            aria-label={`${valeur} étoile${valeur > 1 ? 's' : ''} — ${LIBELLES[valeur]}`}
            title={LIBELLES[valeur]}
            onMouseEnter={() => setSurvolee(valeur)}
            onFocus={() => setSurvolee(valeur)}
            onClick={() => setChoisie(valeur)}
            className="p-1 rounded transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <Star
              size={28}
              className={valeur <= affichee ? 'text-orange-500' : 'text-gray-600'}
              fill={valeur <= affichee ? 'currentColor' : 'none'}
            />
          </button>
        ))}

        {affichee > 0 && <span className="text-sm text-gray-400 ml-1">{LIBELLES[affichee]}</span>}
      </div>

      {/* Le commentaire n'apparaît qu'une fois la note choisie : demandé avant,
          il transforme un geste d'une seconde en formulaire. */}
      {choisie > 0 && (
        <div className="mt-3 space-y-3">
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Un mot sur la livraison (facultatif)"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
          />

          <button
            type="button"
            onClick={envoyer}
            disabled={envoi}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg text-sm text-white transition"
          >
            {envoi ? 'Envoi…' : 'Envoyer ma note'}
          </button>
        </div>
      )}

      {erreur && <p className="text-sm text-red-400 mt-2">{erreur}</p>}
    </div>
  );
}

/** Les étoiles en lecture seule : la note donnée, ou celle d'un livreur. */
export function Etoiles({ valeur, taille = 16 }: { valeur: number; taille?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${valeur} sur 5`}>
      {NOTES.map((n) => (
        <Star
          key={n}
          size={taille}
          className={n <= Math.round(valeur) ? 'text-orange-500' : 'text-gray-600'}
          fill={n <= Math.round(valeur) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}
