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
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const NOTES = [1, 2, 3, 4, 5] as const;

/** Ce que chaque étoile veut dire, pour que le client ne devine pas. */
// Le libellé de chaque note : `libelles.<note>` des traductions.

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
  const t = useTranslations('noterLivreur');
  const [choisie, setChoisie] = useState(0);
  const [survolee, setSurvolee] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  if (maNote) {
    return (
      <div className="border-t border-gray-200 pt-4">
        <p className="text-sm text-gray-500 mb-2">{t('votreNote')}</p>
        <Etoiles valeur={maNote.note} />
        {maNote.commentaire && (
          <p className="text-sm text-gray-600 mt-2 italic">« {maNote.commentaire} »</p>
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
        setErreur(donnees?.message || donnees?.error || t('erreurEnregistrement'));
        return;
      }

      onNote?.({ note: choisie, commentaire: commentaire.trim() || null });
    } catch {
      setErreur(t('erreurEnvoi'));
    } finally {
      setEnvoi(false);
    }
  };

  const affichee = survolee || choisie;

  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-sm text-gray-900 font-semibold">
        {prenomLivreur ? t('questionAvec', { prenom: prenomLivreur }) : t('question')}
      </p>

      <div
        className="flex items-center gap-2 mt-3"
        onMouseLeave={() => setSurvolee(0)}
        role="radiogroup"
        aria-label={t('note')}
      >
        {NOTES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={choisie === valeur}
            aria-label={t('etoiles', { n: valeur, libelle: t(`libelles.${valeur}`) })}
            title={t(`libelles.${valeur}`)}
            onMouseEnter={() => setSurvolee(valeur)}
            onFocus={() => setSurvolee(valeur)}
            onClick={() => setChoisie(valeur)}
            className="p-1 rounded transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <Star
              size={28}
              className={valeur <= affichee ? 'text-orange-500' : 'text-gray-300'}
              fill={valeur <= affichee ? 'currentColor' : 'none'}
            />
          </button>
        ))}

        {affichee > 0 && <span className="text-sm text-gray-500 ml-1">{t(`libelles.${affichee}`)}</span>}
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
            placeholder={t('commentaire')}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500"
          />

          <button
            type="button"
            onClick={envoyer}
            disabled={envoi}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg text-sm text-white transition"
          >
            {envoi ? t('envoi') : t('envoyer')}
          </button>
        </div>
      )}

      {erreur && <p className="text-sm text-red-600 mt-2">{erreur}</p>}
    </div>
  );
}

/** Les étoiles en lecture seule : la note donnée, ou celle d'un livreur. */
export function Etoiles({ valeur, taille = 16 }: { valeur: number; taille?: number }) {
  const t = useTranslations('noterLivreur');

  return (
    <span className="flex items-center gap-0.5" aria-label={t('surCinq', { valeur })}>
      {NOTES.map((n) => (
        <Star
          key={n}
          size={taille}
          className={n <= Math.round(valeur) ? 'text-orange-500' : 'text-gray-300'}
          fill={n <= Math.round(valeur) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}
