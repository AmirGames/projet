'use client';

/**
 * Le dossier d'un livreur : ses pièces, et où en est leur examen.
 *
 * Un livreur s'inscrivait et pouvait recevoir une course dans la minute, sans
 * que personne n'ait vu son permis. Il attend désormais la validation de la
 * plateforme — encore faut-il qu'il puisse déposer ses pièces et suivre ce
 * qu'on en fait, ce qu'aucun écran ne permettait.
 */

import { useCallback, useState } from 'react';
import { AlertCircle, Check, Clock, FileText, Upload, X } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';
import { erreurDeTaille, reduireImage } from '@/lib/reduire-image';
import { useEffectChargement } from '@/lib/use-effect-chargement';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  expiryDate: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  reviewNote: string | null;
  reviewedAt: string | null;
}

interface Dossier {
  status: string;
  statusReason: string | null;
  dossierComplet: boolean;
  piecesAttendues: { type: string; libelle: string }[];
  piecesManquantes: string[];
  documents: Piece[];
}

// Titre et texte de chaque état : `etats.<statut>.titre|texte` des traductions.
const ETATS: Record<string, { couleur: string }> = {
  PENDING: {
    couleur: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  ACTIVE: {
    couleur: 'border-green-200 bg-green-50 text-green-800',
  },
  REJECTED: {
    couleur: 'border-red-200 bg-red-50 text-red-800',
  },
  SUSPENDED: {
    couleur: 'border-red-200 bg-red-50 text-red-800',
  },
  INACTIVE: {
    couleur: 'border-gray-200 bg-white text-gray-700',
  },
};

// Libellé de chaque état de pièce : `pieces.<statut>` des traductions.
const MARQUES: Record<string, { icone: typeof Check; classe: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-600' },
  REJECTED: { icone: X, classe: 'text-red-600' },
  EXPIRED: { icone: AlertCircle, classe: 'text-amber-600' },
  PENDING: { icone: Clock, classe: 'text-gray-500' },
};

export function DossierLivreur({ surChangement }: { surChangement?: () => void }) {
  const t = useTranslations('dossierLivreur');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const [formulaire, setFormulaire] = useState({ type: '', documentUrl: '', expiryDate: '' });
  const [fichier, setFichier] = useState<File | null>(null);
  const [modeUpload, setModeUpload] = useState<'link' | 'file'>('file');

  const charger = useCallback(async () => {
    try {
      const token = localStorage.getItem('driverToken');
      const reponse = await fetch(`${API_URL}/api/drivers/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (reponse.ok) {
        const lu = await reponse.json();
        setDossier(lu.data);
      }
    } catch {
      // Le dossier n'est pas indispensable à l'écran : on n'affiche rien plutôt
      // que de bloquer la page.
    } finally {
      setChargement(false);
    }
  }, []);

  useEffectChargement(() => {
    charger();
  }, [charger]);

  // La plateforme examine une pièce, valide ou refuse le compte : le livreur
  // le voit sans recharger.
  useDonneesModifiees('drivers', charger);

  const deposer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    if (!formulaire.type) {
      setErreur('Choisissez une pièce');
      return;
    }

    if (modeUpload === 'file' && !fichier) {
      setErreur('Choisissez un fichier');
      return;
    }

    if (modeUpload === 'link' && !formulaire.documentUrl) {
      setErreur('Donnez un lien vers le document');
      return;
    }

    const aEnvoyer = modeUpload === 'file' ? await reduireImage(fichier!) : null;
    const trop = aEnvoyer && erreurDeTaille(aEnvoyer);
    if (trop) {
      setErreur(trop);
      return;
    }

    setEnvoi(true);

    try {
      const token = localStorage.getItem('driverToken');
      let reponse: Response;

      if (modeUpload === 'file' && aEnvoyer) {
        const formData = new FormData();
        formData.append('type', formulaire.type);
        formData.append('file', aEnvoyer, fichier!.name);
        if (formulaire.expiryDate) {
          formData.append('expiryDate', formulaire.expiryDate);
        }

        reponse = await fetch(`${API_URL}/api/drivers/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
      } else {
        reponse = await fetch(`${API_URL}/api/drivers/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: formulaire.type,
            documentUrl: formulaire.documentUrl,
            expiryDate: formulaire.expiryDate
              ? new Date(formulaire.expiryDate).toISOString()
              : undefined,
          }),
        });
      }

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('depotImpossible'));
        return;
      }

      setFormulaire({ type: '', documentUrl: '', expiryDate: '' });
      setFichier(null);
      await charger();
      surChangement?.();
    } catch {
      setErreur('Erreur de connexion');
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement || !dossier) return null;

  const statutConnu = ETATS[dossier.status] ? dossier.status : 'PENDING';
  const etat = ETATS[statutConnu];
  const deposees = new Map(dossier.documents.map((piece) => [piece.type, piece]));

  return (
    <div className="space-y-4">
      <div role="status" className={`rounded-lg border px-4 py-3 ${etat.couleur}`}>
        <p className="font-semibold">{t(`etats.${statutConnu}.titre`)}</p>
        <p className="text-sm">{dossier.statusReason || t(`etats.${statutConnu}.texte`)}</p>
      </div>

      {/* Validé, le dossier n'a plus besoin d'être déroulé à chaque visite. */}
      {dossier.status !== 'ACTIVE' && (
        <div className="bg-white ring-1 ring-gray-200 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText size={20} className="text-orange-500" />
            {t('vosPieces')}
          </h2>

          <ul className="space-y-2">
            {dossier.piecesAttendues.map((attendue) => {
              const piece = deposees.get(attendue.type);
              const marque = piece ? MARQUES[piece.status] || MARQUES.PENDING : null;
              const Icone = marque?.icone;

              return (
                <li
                  key={attendue.type}
                  className="flex items-start justify-between gap-3 rounded bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-gray-900 text-sm font-medium">{attendue.libelle}</p>
                    {piece ? (
                      <>
                        <p className={`text-xs ${marque?.classe}`}>{t(`pieces.${MARQUES[piece.status] ? piece.status : 'PENDING'}`)}</p>
                        {piece.reviewNote && (
                          <p className="text-xs text-red-700 mt-1">{piece.reviewNote}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">{t('pasEncore')}</p>
                    )}
                  </div>

                  {Icone && <Icone size={18} className={`flex-shrink-0 ${marque?.classe}`} />}
                </li>
              );
            })}
          </ul>

          <form onSubmit={deposer} className="space-y-3 border-t border-gray-200 pt-4">
            {erreur && (
              <p role="status" className="text-sm text-red-600">
                {erreur}
              </p>
            )}

            <div>
              <label htmlFor="piece-type" className="block text-sm text-gray-500 mb-1">
                {t('pieceADeposer')}
              </label>
              <select
                id="piece-type"
                value={formulaire.type}
                onChange={(e) => setFormulaire({ ...formulaire, type: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
              >
                <option value="">{t('choisir')}</option>
                {dossier.piecesAttendues.map((attendue) => (
                  <option key={attendue.type} value={attendue.type}>
                    {attendue.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-50 border border-gray-300 rounded p-3">
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setModeUpload('file')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition ${
                    modeUpload === 'file'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('fichier')}
                </button>
                <button
                  type="button"
                  onClick={() => setModeUpload('link')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition ${
                    modeUpload === 'link'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('lienUrl')}
                </button>
              </div>

              {modeUpload === 'file' ? (
                <div>
                  <label htmlFor="piece-fichier" className="block text-sm text-gray-500 mb-1">
                    {t('selectionner')}
                  </label>
                  {/* Une clé par mode : sans elle, React réutilisait ce champ
                      libre pour le champ du lien (contrôlé), et le signalait. */}
                  <input
                    key="fichier"
                    id="piece-fichier"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setFichier(e.target.files?.[0] || null)}
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900 text-sm file:bg-gray-200 file:border-0 file:px-2 file:py-1 file:text-gray-900 file:cursor-pointer"
                  />
                  {fichier && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('fichierSelectionne', { nom: fichier.name, ko: Math.round(fichier.size / 1024) })}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label htmlFor="piece-lien" className="block text-sm text-gray-500 mb-1">
                    {t('lienDocument')}
                  </label>
                  <input
                    key="lien"
                    id="piece-lien"
                    type="url"
                    value={formulaire.documentUrl}
                    onChange={(e) => setFormulaire({ ...formulaire, documentUrl: e.target.value })}
                    placeholder="https://…"
                    className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="piece-expiration" className="block text-sm text-gray-500 mb-1">
                {t('expiration')}
              </label>
              <input
                id="piece-expiration"
                type="date"
                value={formulaire.expiryDate}
                onChange={(e) => setFormulaire({ ...formulaire, expiryDate: e.target.value })}
                className="w-full bg-gray-100 border border-gray-300 rounded px-3 py-2 text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={envoi}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              <Upload size={16} />
              {envoi ? t('depot') : t('deposer')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
