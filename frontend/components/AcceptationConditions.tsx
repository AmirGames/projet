'use client';

import Link from 'next/link';

type Document = { href: string; libelle: string };

/**
 * Case d'acceptation des conditions, obligatoire avant inscription ou commande.
 * `required` bloque l'envoi d'un <form> ; hors formulaire, le parent désactive
 * son bouton tant que `coche` est faux. Les liens s'ouvrent dans un nouvel
 * onglet pour ne pas perdre la saisie en cours.
 */
export default function AcceptationConditions({
  coche,
  onChange,
  documents,
  clair = false,
}: {
  coche: boolean;
  onChange: (coche: boolean) => void;
  documents: Document[];
  clair?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${clair ? 'text-slate-700' : 'text-gray-300'}`}>
      <input
        type="checkbox"
        checked={coche}
        onChange={(e) => onChange(e.target.checked)}
        required
        className="mt-1 h-4 w-4 shrink-0"
      />
      <span>
        J&apos;ai lu et j&apos;accepte{' '}
        {documents.map((doc, i) => (
          <span key={doc.href}>
            {i > 0 && (i === documents.length - 1 ? ' et ' : ', ')}
            <Link href={doc.href} target="_blank" className="underline hover:no-underline">
              {doc.libelle}
            </Link>
          </span>
        ))}
        , et je prends connaissance de la{' '}
        <Link href="/confidentialite" target="_blank" className="underline hover:no-underline">
          politique de confidentialité
        </Link>
        .
      </span>
    </label>
  );
}
