'use client';

/**
 * Une pièce ZupDrive à examiner : celle d'un chauffeur, d'une société ou
 * d'un véhicule de société. Aperçu dans la page, validation, refus avec un
 * motif obligatoire. La décision elle-même appartient à l'API, qui la
 * vérifie et la journalise.
 */

import { Check, Eye, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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
  APPROVED: 'text-green-600',
  REJECTED: 'text-red-600',
  EXPIRED: 'text-red-600',
  PENDING: 'text-amber-700',
};

const date = (valeur: string, locale: string) => new Date(valeur).toLocaleDateString(locale);

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
  const locale = useLocale();
  const t = useTranslations('superownerChauffeurs');

  return (
    <li className="rounded bg-gray-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-900">
            {piece.libelle}
            {facultative && <span className="ml-2 text-xs text-gray-500">{t('optional')}</span>}
            {piece.renouvellement && <span className="ml-2 text-xs text-blue-700">{t('renewal')}</span>}
            {versionEnVigueur && <span className="ml-2 text-xs text-gray-500">{t('currentVersion')}</span>}
            <span className={`ml-2 text-xs ${COULEURS_PIECE[piece.statut] || 'text-gray-500'}`}>
              {t(`documentStatus.${piece.statut}`)}
            </span>
          </p>
          {piece.dateExpiration && <p className="text-xs text-gray-500">{t('expiresOn', { date: date(piece.dateExpiration, locale) })}</p>}
          {piece.noteExamen && <p className="text-xs text-red-700">{piece.noteExamen}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Aperçu dans la page ; l'adresse signée est redemandée à l'ouverture. */}
          <button type="button" onClick={onVoir} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
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
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
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
