'use client';

/**
 * Noter une course ZupDrive terminée : le passager note son chauffeur, le
 * chauffeur note son passager. Une fois, dans les 7 jours ; le serveur en
 * décide, l'écran ne fait que proposer.
 *
 * Le commentaire n'est lu que par l'équipe ZupDrive : c'est dit au moment de
 * l'écrire, pour qu'on sache à qui on parle.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { appelerZupDrive } from '@/lib/zupdrive';

const NOTES = [1, 2, 3, 4, 5] as const;

interface Props {
  /** La route de l'API qui reçoit la note. */
  chemin: string;
  /** « Comment s'est passé votre trajet avec Karim ? » */
  question: string;
  onNote?: (note: number) => void;
}

export function Etoiles({ valeur, taille = 18 }: { valeur: number; taille?: number }) {
  return (
    <span className="inline-flex" aria-label={`${valeur}/5`}>
      {NOTES.map((n) => (
        <Star
          key={n}
          size={taille}
          className={n <= Math.round(valeur) ? 'text-amber-500' : 'text-slate-300'}
          fill={n <= Math.round(valeur) ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  );
}

export function NoterCourseDrive({ chemin, question, onNote }: Props) {
  const t = useTranslations('noterCourseDrive');
  const [choisie, setChoisie] = useState(0);
  const [survolee, setSurvolee] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');

  const envoyer = async () => {
    if (!choisie) return;
    setEnvoi(true);
    setErreur('');
    try {
      await appelerZupDrive(chemin, {
        method: 'POST',
        corps: { note: choisie, ...(commentaire.trim() ? { commentaire: commentaire.trim() } : {}) },
      });
      onNote?.(choisie);
    } catch (err) {
      // Le message du serveur dit ce qui ne va pas (déjà notée, délai passé).
      setErreur(err instanceof Error ? err.message : t('erreur'));
    } finally {
      setEnvoi(false);
    }
  };

  const affichee = survolee || choisie;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-noter>
      <p className="text-sm font-semibold text-slate-900">{question}</p>
      <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setSurvolee(0)} role="radiogroup" aria-label={t('note')}>
        {NOTES.map((valeur) => (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={choisie === valeur}
            aria-label={t('etoiles', { n: valeur, libelle: t(`libelle.${valeur}`) })}
            title={t(`libelle.${valeur}`)}
            onMouseEnter={() => setSurvolee(valeur)}
            onFocus={() => setSurvolee(valeur)}
            onClick={() => setChoisie(valeur)}
            className="rounded p-1 transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <Star
              size={26}
              className={valeur <= affichee ? 'text-amber-500' : 'text-slate-300'}
              fill={valeur <= affichee ? 'currentColor' : 'none'}
            />
          </button>
        ))}
        {affichee > 0 && <span className="ml-1 text-sm text-slate-500">{t(`libelle.${affichee}`)}</span>}
      </div>

      {/* Le commentaire n'apparaît qu'une fois la note choisie. */}
      {choisie > 0 && (
        <>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={t('commentaire')}
            aria-label={t('commentaire')}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">{t('commentairePrive')}</p>
          <button
            type="button"
            onClick={envoyer}
            disabled={envoi}
            className="mt-3 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {envoi ? t('envoi') : t('envoyer')}
          </button>
        </>
      )}
      {erreur && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
