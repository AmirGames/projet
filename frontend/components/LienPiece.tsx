'use client';

import type { MouseEvent, ReactNode } from 'react';

import { estPiecePrivee, ouvrirPiece } from '@/lib/fichiers-prives';

/**
 * Un lien vers une pièce déposée. Une pièce privée ne s'ouvre pas à son
 * adresse brute (l'API exige une session) : au clic, on demande une adresse
 * signée et on l'ouvre dans un nouvel onglet.
 */
export function LienPiece({
  adresse,
  className,
  title,
  children,
}: {
  adresse: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const ouvrir = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!estPiecePrivee(adresse)) return;
    e.preventDefault();
    void ouvrirPiece(adresse);
  };

  return (
    <a href={adresse} target="_blank" rel="noreferrer" onClick={ouvrir} className={className} title={title}>
      {children}
    </a>
  );
}
