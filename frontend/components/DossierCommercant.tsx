'use client';

/**
 * Le dossier d'un commerçant, vu par la plateforme.
 *
 * Le commerçant peut désormais déposer ses justificatifs — encore faut-il que
 * quelqu'un les examine. Une pièce qu'on dépose et que personne ne peut valider
 * resterait « en attente » pour toujours, et ne prouverait rien.
 *
 * L'IBAN n'arrive jamais entier : l'API n'en rend que les quatre derniers
 * caractères.
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, FileText, X } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  fileName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
}

interface Dossier {
  legalName: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  billingAddress: string | null;
  billingPostalCode: string | null;
  billingCity: string | null;
  billingCountry: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  accountHolder: string | null;
  ibanMasque: string | null;
  documents: Piece[];
  piecesAExaminer: number;
  manquePourFacturer: string[];
  manquePourEtrePaye: string[];
}

const MARQUES: Record<string, { icone: typeof Check; classe: string; libelle: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-400', libelle: 'Validé' },
  REJECTED: { icone: X, classe: 'text-red-400', libelle: 'Refusé' },
  PENDING: { icone: Clock, classe: 'text-gray-400', libelle: 'En attente d’examen' },
};

function Ligne({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{libelle}</p>
      <p className="text-sm text-white">{valeur || <span className="text-gray-600">—</span>}</p>
    </div>
  );
}

export function DossierCommercant({ orgId }: { orgId: string }) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState('');
  const [motif, setMotif] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/api/superowner/organizations/${orgId}/profile`, {
        headers: { Authorization: `Bearer ${jeton}` },
      });

      if (!reponse.ok) return;

      const lu = await reponse.json();
      setDossier(lu.data);
    } catch {
      // Le dossier n'est pas indispensable à la fiche : mieux vaut ne rien
      // afficher que de faire tomber la page entière.
    }
  }, [orgId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const statuer = async (piece: Piece, approuve: boolean) => {
    setErreur('');
    setEnCours(piece.id);

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(
        `${API_URL}/api/superowner/organizations/${orgId}/documents/${piece.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
          body: JSON.stringify({ approuve, note: motif[piece.id] || undefined }),
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || 'Examen impossible');
        return;
      }

      setMotif((actuel) => ({ ...actuel, [piece.id]: '' }));
      await charger();
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setEnCours('');
    }
  };

  if (!dossier) return null;

  const adresse = [dossier.billingAddress, dossier.billingPostalCode, dossier.billingCity]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <FileText size={20} className="text-orange-500" />
        Dossier du commerçant
        {dossier.piecesAExaminer > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold">
            {dossier.piecesAExaminer} pièce{dossier.piecesAExaminer > 1 ? 's' : ''} à examiner
          </span>
        )}
      </h2>

      {erreur && (
        <p role="status" className="text-sm text-red-400">
          {erreur}
        </p>
      )}

      {(dossier.manquePourFacturer.length > 0 || dossier.manquePourEtrePaye.length > 0) && (
        <p className="text-sm text-amber-300">
          Dossier incomplet : il manque{' '}
          {[...dossier.manquePourFacturer, ...dossier.manquePourEtrePaye].join(', ')}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Ligne libelle="Raison sociale" valeur={dossier.legalName} />
        <Ligne libelle="Immatriculation" valeur={dossier.registrationNumber} />
        <Ligne libelle="Numéro de TVA" valeur={dossier.vatNumber} />
        <Ligne libelle="Adresse de facturation" valeur={adresse || null} />
        <Ligne libelle="Pays" valeur={dossier.billingCountry} />
        <Ligne
          libelle="Propriétaire"
          valeur={[dossier.ownerFirstName, dossier.ownerLastName].filter(Boolean).join(' ') || null}
        />
        <Ligne libelle="E-mail du propriétaire" valeur={dossier.ownerEmail} />
        <Ligne libelle="Téléphone du propriétaire" valeur={dossier.ownerPhone} />
        <Ligne libelle="Titulaire du compte" valeur={dossier.accountHolder} />
        {/* Quatre caractères : de quoi rapprocher un virement d'un compte, pas
            de quoi s'en servir. */}
        <Ligne libelle="IBAN" valeur={dossier.ibanMasque} />
      </div>

      <div className="border-t border-gray-700 pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Justificatifs</h3>

        {dossier.documents.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune pièce déposée.</p>
        ) : (
          <ul className="space-y-2">
            {dossier.documents.map((piece) => {
              const marque = MARQUES[piece.status] || MARQUES.PENDING;
              const Icone = marque.icone;

              return (
                <li key={piece.id} className="rounded bg-gray-700/50 px-3 py-2 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium">{piece.libelle}</p>
                      <p className={`text-xs ${marque.classe}`}>{marque.libelle}</p>
                      {piece.reviewNote && (
                        <p className="text-xs text-red-300 mt-1">{piece.reviewNote}</p>
                      )}
                      <a
                        href={piece.documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-orange-400 hover:underline break-all"
                      >
                        {piece.fileName || piece.documentUrl}
                      </a>
                    </div>
                    <Icone size={18} className={`flex-shrink-0 ${marque.classe}`} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={motif[piece.id] || ''}
                      onChange={(e) => setMotif({ ...motif, [piece.id]: e.target.value })}
                      placeholder="Motif (obligatoire pour refuser)"
                      aria-label={`Motif pour ${piece.libelle}`}
                      className="flex-1 min-w-[12rem] bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white placeholder-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => statuer(piece, true)}
                      disabled={enCours === piece.id}
                      className="px-3 py-1 bg-green-600/80 hover:bg-green-600 disabled:opacity-40 rounded text-sm text-white transition"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => statuer(piece, false)}
                      disabled={enCours === piece.id}
                      className="px-3 py-1 bg-red-600/80 hover:bg-red-600 disabled:opacity-40 rounded text-sm text-white transition"
                    >
                      Refuser
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
