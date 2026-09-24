'use client';

/**
 * Le dossier d'un livreur : ses pièces, et où en est leur examen.
 *
 * Un livreur s'inscrivait et pouvait recevoir une course dans la minute, sans
 * que personne n'ait vu son permis. Il attend désormais la validation de la
 * plateforme — encore faut-il qu'il puisse déposer ses pièces et suivre ce
 * qu'on en fait, ce qu'aucun écran ne permettait.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Clock, FileText, Upload, X } from 'lucide-react';
import { useDonneesModifiees } from '@/lib/temps-reel';

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

const ETATS: Record<string, { titre: string; texte: string; couleur: string }> = {
  PENDING: {
    titre: 'Dossier en cours de validation',
    texte:
      'Déposez les pièces demandées. Tant que la plateforme ne les a pas validées, vous ne pouvez pas prendre de course.',
    couleur: 'border-amber-700/50 bg-amber-900/20 text-amber-200',
  },
  ACTIVE: {
    titre: 'Compte validé',
    texte: 'Vous pouvez vous mettre en ligne et recevoir des courses.',
    couleur: 'border-green-700/50 bg-green-900/20 text-green-200',
  },
  REJECTED: {
    titre: 'Dossier refusé',
    texte: 'Corrigez les pièces signalées et déposez-les à nouveau.',
    couleur: 'border-red-700/50 bg-red-900/20 text-red-200',
  },
  SUSPENDED: {
    titre: 'Compte suspendu',
    texte: 'Vous ne recevez plus de course.',
    couleur: 'border-red-700/50 bg-red-900/20 text-red-200',
  },
  INACTIVE: {
    titre: 'Compte désactivé',
    texte: 'Contactez la plateforme pour le rétablir.',
    couleur: 'border-gray-700 bg-gray-800 text-gray-300',
  },
};

const MARQUES: Record<string, { icone: typeof Check; classe: string; libelle: string }> = {
  APPROVED: { icone: Check, classe: 'text-green-400', libelle: 'Validée' },
  REJECTED: { icone: X, classe: 'text-red-400', libelle: 'Refusée' },
  EXPIRED: { icone: AlertCircle, classe: 'text-amber-400', libelle: 'Expirée' },
  PENDING: { icone: Clock, classe: 'text-gray-400', libelle: "En attente d'examen" },
};

export function DossierLivreur({ surChangement }: { surChangement?: () => void }) {
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

  useEffect(() => {
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

    setEnvoi(true);

    try {
      const token = localStorage.getItem('driverToken');
      let reponse: Response;

      if (modeUpload === 'file') {
        const formData = new FormData();
        formData.append('type', formulaire.type);
        formData.append('file', fichier!);
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
        setErreur(lu?.error || 'Dépôt impossible');
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

  const etat = ETATS[dossier.status] || ETATS.PENDING;
  const deposees = new Map(dossier.documents.map((piece) => [piece.type, piece]));

  return (
    <div className="space-y-4">
      <div role="status" className={`rounded-lg border px-4 py-3 ${etat.couleur}`}>
        <p className="font-semibold">{etat.titre}</p>
        <p className="text-sm">{dossier.statusReason || etat.texte}</p>
      </div>

      {/* Validé, le dossier n'a plus besoin d'être déroulé à chaque visite. */}
      {dossier.status !== 'ACTIVE' && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-orange-500" />
            Vos pièces
          </h2>

          <ul className="space-y-2">
            {dossier.piecesAttendues.map((attendue) => {
              const piece = deposees.get(attendue.type);
              const marque = piece ? MARQUES[piece.status] || MARQUES.PENDING : null;
              const Icone = marque?.icone;

              return (
                <li
                  key={attendue.type}
                  className="flex items-start justify-between gap-3 rounded bg-gray-700/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium">{attendue.libelle}</p>
                    {piece ? (
                      <>
                        <p className={`text-xs ${marque?.classe}`}>{marque?.libelle}</p>
                        {piece.reviewNote && (
                          <p className="text-xs text-red-300 mt-1">{piece.reviewNote}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">Pas encore déposée</p>
                    )}
                  </div>

                  {Icone && <Icone size={18} className={`flex-shrink-0 ${marque?.classe}`} />}
                </li>
              );
            })}
          </ul>

          <form onSubmit={deposer} className="space-y-3 border-t border-gray-700 pt-4">
            {erreur && (
              <p role="status" className="text-sm text-red-400">
                {erreur}
              </p>
            )}

            <div>
              <label htmlFor="piece-type" className="block text-sm text-gray-400 mb-1">
                Pièce à déposer
              </label>
              <select
                id="piece-type"
                value={formulaire.type}
                onChange={(e) => setFormulaire({ ...formulaire, type: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              >
                <option value="">Choisir…</option>
                {dossier.piecesAttendues.map((attendue) => (
                  <option key={attendue.type} value={attendue.type}>
                    {attendue.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-gray-700/30 border border-gray-600 rounded p-3">
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setModeUpload('file')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition ${
                    modeUpload === 'file'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Fichier
                </button>
                <button
                  type="button"
                  onClick={() => setModeUpload('link')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition ${
                    modeUpload === 'link'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Lien URL
                </button>
              </div>

              {modeUpload === 'file' ? (
                <div>
                  <label htmlFor="piece-fichier" className="block text-sm text-gray-400 mb-1">
                    Sélectionner un fichier (JPG, PNG, PDF)
                  </label>
                  <input
                    id="piece-fichier"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setFichier(e.target.files?.[0] || null)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm file:bg-gray-600 file:border-0 file:px-2 file:py-1 file:text-white file:cursor-pointer"
                  />
                  {fichier && (
                    <p className="text-xs text-gray-400 mt-1">
                      Fichier sélectionné: {fichier.name} ({Math.round(fichier.size / 1024)} KB)
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label htmlFor="piece-lien" className="block text-sm text-gray-400 mb-1">
                    Lien vers le document
                  </label>
                  <input
                    id="piece-lien"
                    type="url"
                    value={formulaire.documentUrl}
                    onChange={(e) => setFormulaire({ ...formulaire, documentUrl: e.target.value })}
                    placeholder="https://…"
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="piece-expiration" className="block text-sm text-gray-400 mb-1">
                Date d&apos;expiration (si la pièce en a une)
              </label>
              <input
                id="piece-expiration"
                type="date"
                value={formulaire.expiryDate}
                onChange={(e) => setFormulaire({ ...formulaire, expiryDate: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={envoi}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              <Upload size={16} />
              {envoi ? 'Dépôt…' : 'Déposer la pièce'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
