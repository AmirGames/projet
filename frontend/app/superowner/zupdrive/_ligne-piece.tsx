'use client';

/**
 * Une pièce ZupDrive à examiner : celle d'un chauffeur, d'une société ou
 * d'un véhicule de société. Aperçu dans la page, validation, refus avec un
 * motif obligatoire. La décision elle-même appartient à l'API, qui la
 * vérifie et la journalise.
 */

import { Check, Eye, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface PieceAExaminer {
  id: string;
  type: string;
  libelle: string;
  url: string;
  statut: string;
  noteExamen: string | null;
  /** Nouvelle version déposée alors que l'ancienne est encore en vigueur. */
  renouvellement?: boolean;
  dateExpiration: string | null;
}

const COULEURS_PIECE: Record<string, string> = {
  APPROVED: 'text-green-400',
  REJECTED: 'text-red-400',
  EXPIRED: 'text-red-400',
  PENDING: 'text-amber-300',
};

const date = (valeur: string) => new Date(valeur).toLocaleDateString('fr-FR');

export function LignePieceAExaminer({
  piece,
  facultative,
  versionEnVigueur,
  note,
  envoi,
  onNote,
  onExaminer,
  onVoir,
}: {
  piece: PieceAExaminer;
  facultative: boolean;
  /** Une nouvelle version de cette pièce attend l'examen : celle-ci reste en vigueur d'ici là. */
  versionEnVigueur: boolean;
  note: string;
  envoi: boolean;
  onNote: (note: string) => void;
  onExaminer: (approuve: boolean) => void;
  onVoir: () => void;
}) {
  const t = useTranslations('superownerChauffeurs');

  return (
    <li className="rounded bg-gray-700/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white">
            {piece.libelle}
            {facultative && <span className="ml-2 text-xs text-gray-400">{t('optional')}</span>}
            {piece.renouvellement && <span className="ml-2 text-xs text-blue-300">{t('renewal')}</span>}
            {versionEnVigueur && <span className="ml-2 text-xs text-gray-400">{t('currentVersion')}</span>}
            <span className={`ml-2 text-xs ${COULEURS_PIECE[piece.statut] || 'text-gray-400'}`}>
              {t(`documentStatus.${piece.statut}`)}
            </span>
          </p>
          {piece.dateExpiration && <p className="text-xs text-gray-500">{t('expiresOn', { date: date(piece.dateExpiration) })}</p>}
          {piece.noteExamen && <p className="text-xs text-red-300">{piece.noteExamen}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Aperçu dans la page ; l'adresse signée est redemandée à l'ouverture. */}
          <button type="button" onClick={onVoir} className="flex items-center gap-1 text-xs text-blue-400 hover:underline">
            <Eye size={12} />
            {t('view')}
          </button>
          {/* Une version expirée ne se valide pas : il faut la version à jour. */}
          {piece.statut !== 'APPROVED' && piece.statut !== 'EXPIRED' && (
            <button
              onClick={() => onExaminer(true)}
              disabled={envoi}
              className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500 disabled:opacity-50"
            >
              <Check size={12} />
              {t('approveDocument')}
            </button>
          )}
        </div>
      </div>
      {piece.statut !== 'REJECTED' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder={t('documentReasonPlaceholder')}
            aria-label={`${t('documentReasonPlaceholder')} — ${piece.libelle}`}
            className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-white"
          />
          <button
            onClick={() => onExaminer(false)}
            disabled={envoi}
            className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500 disabled:opacity-50"
          >
            <X size={12} />
            {t('rejectDocument')}
          </button>
        </div>
      )}
    </li>
  );
}
