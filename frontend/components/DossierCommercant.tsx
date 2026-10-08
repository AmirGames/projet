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
import { AlertTriangle, BadgeCheck, Check, Clock, Eye, FileText, Upload, X } from 'lucide-react';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { LienPiece } from '@/components/LienPiece';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { erreurDeTaille, reduireImage } from '@/lib/reduire-image';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useLocale, useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

// Le libellé : `pieces.<statut>` des traductions.
const MARQUES: Record<string, { icone: typeof Check; classe: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-600' },
  REJECTED: { icone: X, classe: 'text-red-600' },
  PENDING: { icone: Clock, classe: 'text-gray-500' },
  EXPIRED: { icone: AlertTriangle, classe: 'text-amber-600' },
};

function Ligne({ libelle, valeur }: { libelle: string; valeur: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{libelle}</p>
      <p className="text-sm text-gray-900">{valeur || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}

export function DossierCommercant({ orgId }: { orgId: string }) {
  const t = useTranslations('dossierCommercant');
  const tFichiers = useTranslations('fichiers');
  const locale = useLocale();
  const dateCourte = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState('');
  const [motif, setMotif] = useState<Record<string, string>>({});
  const [apercu, setApercu] = useState<{ documentUrl: string; libelle: string } | null>(null);
  // La date en cours de modification, par pièce (format AAAA-MM-JJ).
  const [echeance, setEcheance] = useState<Record<string, string>>({});
  // Demain : une date du jour serait déjà passée pour le serveur (minuit UTC).
  const [dateMin, setDateMin] = useState('');
  const [afficherFormulaire, setAfficherFormulaire] = useState(false);
  const [typePiece, setTypePiece] = useState('');
  const [fichier, setFichier] = useState<File | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreurUpload, setErreurUpload] = useState('');

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

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // Une pièce déposée par le commerçant, examinée par un collègue : le
  // dossier suit.
  useDonneesModifiees(['merchant-profile', 'organizations'], charger, { orgId });

  const changerEcheance = async (piece: Piece) => {
    const date = echeance[piece.id];
    if (!date) return;

    setErreur('');
    setEnCours(piece.id);

    try {
      const jeton = localStorage.getItem('accessToken');
      const reponse = await fetch(
        `${API_URL}/api/superowner/organizations/${orgId}/documents/${piece.id}/expiry`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
          body: JSON.stringify({ expiryDate: date }),
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('modificationImpossible'));
        return;
      }

      setEcheance(({ [piece.id]: _, ...reste }) => reste);
      await charger();
    } catch {
      setErreur(t('modificationImpossible'));
    } finally {
      setEnCours('');
    }
  };

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
        setErreur(lu?.error || t('examenImpossible'));
        return;
      }

      setMotif((actuel) => ({ ...actuel, [piece.id]: '' }));
      await charger();
    } catch {
      setErreur(t('serveurMuet'));
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
      const reponse = await fetch(`${API_URL}/api/superowner/organizations/${orgId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton}` },
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('validationImpossible'));
        return;
      }

      await charger();
    } catch {
      setErreur(t('serveurMuet'));
    } finally {
      setEnCours('');
    }
  };

  const deposerDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreurUpload('');

    if (!typePiece || !fichier) {
      setErreurUpload(t('choisirPieceFichier'));
      return;
    }

    const aEnvoyer = await reduireImage(fichier);
    const trop = erreurDeTaille(aEnvoyer);
    if (trop) {
      setErreurUpload(tFichiers(trop));
      return;
    }

    setEnvoi(true);

    try {
      const jeton = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('type', typePiece);
      formData.append('file', aEnvoyer, fichier.name);

      const reponse = await fetch(
        `${API_URL}/api/merchant-profile/${orgId}/documents/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${jeton}` },
          body: formData,
        }
      );

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreurUpload(lu?.error || t('depotImpossible'));
        return;
      }

      setTypePiece('');
      setFichier(null);
      setAfficherFormulaire(false);
      await charger();
    } catch {
      setErreurUpload(t('erreurConnexion'));
    } finally {
      setEnvoi(false);
    }
  };

  if (!dossier) return null;

  const adresse = [dossier.billingAddress, dossier.billingPostalCode, dossier.billingCity]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-5">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <FileText size={20} className="text-orange-500" />
        {t('titre')}
        {dossier.piecesAExaminer > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-500/40 text-xs font-semibold">
            {t('piecesAExaminer', { n: dossier.piecesAExaminer })}
          </span>
        )}
      </h2>

      {/* La validation d'abord : tant qu'elle manque, le commerce ne peut ni
          ouvrir ni vendre — c'est ce que la plateforme vient trancher ici. */}
      {dossier.validation?.valide ? (
        <p className="flex items-center gap-2 text-sm text-green-600">
          <BadgeCheck size={18} />
          {dossier.validation.approvedAt
            ? t('valideLe', { date: dateCourte(dossier.validation.approvedAt) })
            : t('valide')}
        </p>
      ) : (
        dossier.validation && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-100 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-amber-700">{t('enAttente')}</p>
              <p className="text-sm text-gray-700">
                {dossier.validation.dossierComplet
                  ? t('toutValide')
                  : t('resteAValider', { liste: dossier.validation.piecesManquantes.map((piece) => piece.libelle).join(', ') })}
              </p>
            </div>
            <button
              type="button"
              onClick={validerLeCommerce}
              disabled={!dossier.validation.dossierComplet || enCours === 'commerce'}
              title={
                dossier.validation.dossierComplet
                  ? undefined
                  : t('validezDabord')
              }
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-white transition"
            >
              {t('validerCommerce')}
            </button>
          </div>
        )
      )}

      {erreur && (
        <p role="status" className="text-sm text-red-600">
          {erreur}
        </p>
      )}

      {(dossier.manquePourFacturer.length > 0 || dossier.manquePourEtrePaye.length > 0) && (
        <p className="text-sm text-amber-700">
          {t('incomplet', { liste: [...dossier.manquePourFacturer, ...dossier.manquePourEtrePaye].join(', ') })}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Ligne libelle={t('raisonSociale')} valeur={dossier.legalName} />
        <Ligne libelle={t('immatriculation')} valeur={dossier.registrationNumber} />
        <Ligne libelle={t('numeroTva')} valeur={dossier.vatNumber} />
        <Ligne libelle={t('adresseFacturation')} valeur={adresse || null} />
        <Ligne libelle={t('pays')} valeur={dossier.billingCountry} />
        <Ligne
          libelle={t('proprietaire')}
          valeur={[dossier.ownerFirstName, dossier.ownerLastName].filter(Boolean).join(' ') || null}
        />
        <Ligne libelle={t('emailProprietaire')} valeur={dossier.ownerEmail} />
        <Ligne libelle={t('telephoneProprietaire')} valeur={dossier.ownerPhone} />
        <Ligne libelle={t('titulaire')} valeur={dossier.accountHolder} />
        {/* Quatre caractères : de quoi rapprocher un virement d'un compte, pas
            de quoi s'en servir. */}
        <Ligne libelle="IBAN" valeur={dossier.ibanMasque} />
      </div>

      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{t('justificatifs')}</h3>
          <button
            type="button"
            onClick={() => setAfficherFormulaire(!afficherFormulaire)}
            className="flex items-center gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white px-2 py-1 rounded-sm transition"
          >
            <Upload size={14} />
            {t('ajouter')}
          </button>
        </div>

        {afficherFormulaire && (
          <form onSubmit={deposerDocument} className="bg-gray-50 border border-gray-300 rounded-sm p-4 space-y-3">
            {erreurUpload && (
              <p className="text-sm text-red-600">{erreurUpload}</p>
            )}

            <div>
              <label htmlFor="type-piece" className="block text-sm text-gray-500 mb-1">
                {t('typePiece')}
              </label>
              <select
                id="type-piece"
                value={typePiece}
                onChange={(e) => setTypePiece(e.target.value)}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 text-sm"
              >
                <option value="">{t('choisir')}</option>
                <option value="registration">{t('registration')}</option>
                <option value="identity">{t('identity')}</option>
                <option value="vat">{t('vat')}</option>
                <option value="bank">{t('bank')}</option>
                <option value="other">{t('other')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="fichier-piece" className="block text-sm text-gray-500 mb-1">
                {t('fichier')}
              </label>
              <input
                id="fichier-piece"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setFichier(e.target.files?.[0] || null)}
                className="w-full bg-gray-100 border border-gray-300 rounded-sm px-3 py-2 text-gray-900 text-sm file:bg-gray-200 file:border-0 file:px-2 file:py-1 file:text-gray-900 file:cursor-pointer"
              />
              {fichier && (
                <p className="text-xs text-gray-500 mt-1">
                  {fichier.name} ({Math.round(fichier.size / 1024)} KB)
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={envoi}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-medium py-2 rounded-sm transition"
              >
                {envoi ? t('envoi') : t('deposer')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAfficherFormulaire(false);
                  setTypePiece('');
                  setFichier(null);
                  setErreurUpload('');
                }}
                className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium rounded-sm transition"
              >
                {t('annuler')}
              </button>
            </div>
          </form>
        )}

        {dossier.documents.length === 0 ? (
          <p className="text-sm text-gray-500">{t('aucunePiece')}</p>
        ) : (
          <ul className="space-y-2">
            {dossier.documents.map((piece) => {
              const marque = MARQUES[piece.status] || MARQUES.PENDING;
              const Icone = marque.icone;

              return (
                <li key={piece.id} className="rounded-sm bg-gray-50 px-3 py-2 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-gray-900 text-sm font-medium">{piece.libelle}</p>
                      <p className={`text-xs ${marque.classe}`}>
                        {t(`pieces.${MARQUES[piece.status] ? piece.status : 'PENDING'}`)}
                        {piece.expiryDate && t('expireLe', { date: dateCourte(piece.expiryDate) })}
                        {piece.expiryDate && echeance[piece.id] === undefined && (
                          <button
                            type="button"
                            onClick={() => {
                              setDateMin(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
                              setEcheance({ ...echeance, [piece.id]: piece.expiryDate!.slice(0, 10) });
                            }}
                            className="ml-2 text-blue-600 hover:underline"
                          >
                            {t('modifier')}
                          </button>
                        )}
                      </p>
                      {echeance[piece.id] !== undefined && (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <input
                            type="date"
                            value={echeance[piece.id]}
                            min={dateMin}
                            onChange={(e) => setEcheance({ ...echeance, [piece.id]: e.target.value })}
                            aria-label={t('nouvelleDate', { piece: piece.libelle })}
                            className="bg-white border border-gray-300 rounded-sm px-2 py-1 text-xs text-gray-900"
                          />
                          <button
                            type="button"
                            onClick={() => changerEcheance(piece)}
                            disabled={enCours === piece.id || !echeance[piece.id]}
                            className="px-2 py-1 bg-gray-900 hover:bg-black disabled:opacity-50 text-white rounded-sm text-xs"
                          >
                            {t('enregistrer')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEcheance(({ [piece.id]: _, ...reste }) => reste)}
                            className="px-2 py-1 text-gray-500 hover:text-gray-900 text-xs"
                          >
                            {t('annuler')}
                          </button>
                        </div>
                      )}
                      {piece.reviewNote && (
                        <p className="text-xs text-red-700 mt-1">{piece.reviewNote}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setApercu(piece)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Eye size={12} />
                          {t('apercu')}
                        </button>
                        <LienPiece
                          adresse={piece.documentUrl}
                          className="text-xs text-orange-600 hover:underline break-all"
                        >
                          {piece.fileName || piece.documentUrl}
                        </LienPiece>
                      </div>
                    </div>
                    <Icone size={18} className={`shrink-0 ${marque.classe}`} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={motif[piece.id] || ''}
                      onChange={(e) => setMotif({ ...motif, [piece.id]: e.target.value })}
                      placeholder={t('motifPlaceholder')}
                      aria-label={t('motifPour', { piece: piece.libelle })}
                      className="flex-1 min-w-48 bg-white border border-gray-300 rounded-sm px-2 py-1 text-sm text-gray-900 placeholder-gray-400"
                    />
                    <button
                      type="button"
                      onClick={() => statuer(piece, true)}
                      disabled={enCours === piece.id}
                      className="px-3 py-1 bg-green-600/80 hover:bg-green-600 disabled:opacity-50 rounded-sm text-sm text-white transition"
                    >
                      {t('valider')}
                    </button>
                    <button
                      type="button"
                      onClick={() => statuer(piece, false)}
                      disabled={enCours === piece.id}
                      className="px-3 py-1 bg-red-600/80 hover:bg-red-600 disabled:opacity-50 rounded-sm text-sm text-white transition"
                    >
                      {t('refuser')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {apercu && (
        <DocumentPreviewModal
          documentUrl={apercu.documentUrl}
          libelle={apercu.libelle}
          onClose={() => setApercu(null)}
        />
      )}
    </div>
  );
}
