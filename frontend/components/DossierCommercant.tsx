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

import { useCallback, useState } from 'react';
import { AlertTriangle, BadgeCheck, Check, Clock, FileText, Upload, X } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { useEffectChargement } from '@/lib/use-effect-chargement';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  fileName: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewNote: string | null;
  expiryDate: string | null;
}

interface Validation {
  valide: boolean;
  approvedAt: string | null;
  piecesManquantes: { type: string; libelle: string }[];
  dossierComplet: boolean;
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
  validation: Validation;
}

const MARQUES: Record<string, { icone: typeof Check; classe: string; libelle: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-400', libelle: 'Validé' },
  REJECTED: { icone: X, classe: 'text-red-400', libelle: 'Refusé' },
  PENDING: { icone: Clock, classe: 'text-gray-400', libelle: "En attente d'examen" },
  EXPIRED: { icone: AlertTriangle, classe: 'text-amber-400', libelle: 'Expiré' },
};

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR');

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
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [typePiece, setTypePiece] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurUpload, setErreurUpload] = useState('');

  const charger = useCallback(async () => {
    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/superowner/organizations/${orgId}/profile`, {
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

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Une pièce déposée par le commerçant, examinée par un collègue : le
  // dossier suit.
  useDonneesModifiees(['merchant-profile', 'organizations'], charger, { orgId });

  const statuer = async (piece: Piece, approuve: boolean) => {
    setErreur('');
    setEnCours(piece.id);

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(
        `${API_URL}/superowner/organizations/${orgId}/documents/${piece.id}`,
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

  /** Valide le commerce : il pourra ouvrir sa boutique et vendre. */
  const validerLeCommerce = async () => {
    setErreur('');
    setEnCours('commerce');

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(`${API_URL}/superowner/organizations/${orgId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}` },
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || 'Validation impossible');
        return;
      }

      await charger();
    } catch {
      setErreur('Le serveur ne répond pas');
    } finally {
      setEnCours('');
    }
  };

  const deposerDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreurUpload('');

    if (!typePiece || !fichier) {
      setErreurUpload('Choisissez une pièce et un fichier');
      return;
    }

    setEnvoi(true);

    try {
      const jeton = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('type', typePiece);
      formData.append('file', fichier);

      const reponse = await fetch(
        `${API_URL}/merchant-profile/${orgId}/documents/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}` },
          body: formData,
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreurUpload(lu?.error || 'Dépôt impossible');
        return;
      }

      setTypePiece('');
      setFichier(null);
      setAfficherFormulaire(false);
      await charger();
    } catch {
      setErreurUpload('Erreur de connexion');
    } finally {
      setEnvoi(false);
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

      {/* La validation d'abord : tant qu'elle manque, le commerce ne peut ni
          ouvrir ni vendre — c'est ce que la plateforme vient trancher ici. */}
      {dossier.validation?.valide ? (
        <p className="flex items-center gap-2 text-sm text-green-400">
          <BadgeCheck size={18} />
          Commerce validé
          {dossier.validation.approvedAt && ` le ${dateCourte(dossier.validation.approvedAt)}`}
        </p>
      ) : (
        dossier.validation && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-amber-300">En attente de validation</p>
              <p className="text-sm text-gray-300">
                {dossier.validation.dossierComplet
                  ? 'Toutes les pièces exigées sont validées : le commerce peut être validé.'
                  : `Reste à valider : ${dossier.validation.piecesManquantes
                      .map((piece) => piece.libelle)
                      .join(', ')}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={validerLeCommerce}
              disabled={!dossier.validation.dossierComplet || enCours === 'commerce'}
              title={
                dossier.validation.dossierComplet
                  ? undefined
                  : 'Validez d’abord les pièces exigées'
              }
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition"
            >
              Valider le commerce
            </button>
          </div>
        )
      )}

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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Justificatifs</h3>
          <button
            type="button"
            onClick={() => setAfficherFormulaire(!afficherFormulaire)}
            className="flex items-center gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded transition"
          >
            <Upload size={14} />
            Ajouter
          </button>
        </div>

        {afficherFormulaire && (
          <form onSubmit={deposerDocument} className="bg-gray-700/50 border border-gray-600 rounded p-4 space-y-3">
            {erreurUpload && (
              <p className="text-sm text-red-400">{erreurUpload}</p>
            )}

            <div>
              <label htmlFor="type-piece" className="block text-sm text-gray-400 mb-1">
                Type de pièce
              </label>
              <select
                id="type-piece"
                value={typePiece}
                onChange={(e) => setTypePiece(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
              >
                <option value="">Choisir…</option>
                <option value="registration">Extrait d'immatriculation (Kbis, BCE)</option>
                <option value="identity">Pièce d'identité du propriétaire</option>
                <option value="vat">Attestation de TVA</option>
                <option value="bank">Relevé d'identité bancaire</option>
                <option value="other">Autre document</option>
              </select>
            </div>

            <div>
              <label htmlFor="fichier-piece" className="block text-sm text-gray-400 mb-1">
                Fichier (JPG, PNG, PDF max 10MB)
              </label>
              <input
                id="fichier-piece"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setFichier(e.target.files?.[0] || null)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm file:bg-gray-600 file:border-0 file:px-2 file:py-1 file:text-white file:cursor-pointer"
              />
              {fichier && (
                <p className="text-xs text-gray-400 mt-1">
                  {fichier.name} ({Math.round(fichier.size / 1024)} KB)
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={envoi}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-medium py-2 rounded transition"
              >
                {envoi ? 'Envoi…' : 'Déposer'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAfficherFormulaire(false);
                  setTypePiece('');
                  setFichier(null);
                  setErreurUpload('');
                }}
                className="px-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded transition"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

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
                      <p className={`text-xs ${marque.classe}`}>
                        {marque.libelle}
                        {piece.expiryDate && ` · expire le ${dateCourte(piece.expiryDate)}`}
                      </p>
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
