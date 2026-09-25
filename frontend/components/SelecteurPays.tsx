'use client';

import { PAYS, type Pays } from '@/lib/pays-infos';

interface Props {
  pays: Pays;
  onChange: (pays: Pays) => void;
  /** Classes du <select>, pour suivre le style du formulaire. */
  className?: string;
  id?: string;
}

/** Choix du pays dans un formulaire, prérempli par la détection. */
export function SelecteurPays({ pays, onChange, className = '', id = 'pays' }: Props) {
  return (
    <select
      id={id}
      value={pays}
      onChange={(e) => onChange(e.target.value as Pays)}
      className={className}
    >
      {(Object.keys(PAYS) as Pays[]).map((code) => (
        <option key={code} value={code}>
          {PAYS[code].drapeau} {PAYS[code].nom}
        </option>
      ))}
    </select>
  );
}
