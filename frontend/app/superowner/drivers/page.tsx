'use client';

/**
 * Les livreurs de la plateforme, et la validation de leur dossier.
 *
 * La plateforme n'avait aucune page sur ses livreurs : elle ne pouvait ni les
 * voir, ni les valider, ni les écarter. N'importe qui s'inscrivait et recevait
 * une course dans la minute.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, Car, Check, Eye, ExternalLink, Truck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { euro } from '@/lib/format';
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal';
import { useDonneesModifiees } from '@/lib/temps-reel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Livreur {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleType: string;
  vehiclePlate: string | null;
  status: string;
  statusReason: string | null;
  approvedAt: string | null;
  isOnline: boolean;
  /** Nulle tant que personne ne l'a noté. */
  rating: number | null;
  avis: number;
  totalDeliveries: number;
  totalEarnings: number;
  courses: number;
  piecesDeposees: number;
  piecesValidees: number;
  piecesAttendues: number;
  dossierComplet: boolean;
  createdAt: string;
}

interface Piece {
  id: string;
  type: string;
  libelle: string;
  documentUrl: string;
  expiryDate: string | null;
  status: string;
  reviewNote: string | null;
}

interface Dossier {
  driver: Livreur;
  documents: Piece[];
  piecesAttendues: { type: string; libelle: string }[];
  piecesManquantes: string[];
  dossierComplet: boolean;
}

const COULEURS: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-300',
  ACTIVE: 'bg-green-500/20 text-green-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  SUSPENDED: 'bg-red-500/20 text-red-300',
  INACTIVE: 'bg-gray-700 text-gray-300',
};

const VEHICULES: Record<string, { icone: typeof Car; libelle: string }> = {
  car: { icone: Car, libelle: 'Voiture' },
  scooter: { icone: Truck, libelle: 'Scooter' },
  bike: { icone: Bike, libelle: 'Vélo' },
};

export default function LivreursPage() {
  const t = useTranslations('superownerDrivers');
  const tCommon = useTranslations('common');

  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [filtre, setFiltre] = useState('PENDING');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [motif, setMotif] = useState('');
  const [previewPiece, setPreviewPiece] = useState<Piece | null>(null);

  const jeton = () => localStorage.getItem('accessToken');

  // silencieux : une relecture en direct garde la page affichée.
  const charger = useCallback(async (silencieux = false) => {
    // Une relecture en direct ne doit pas effacer le refus qu'on vient d'afficher.
    if (!silencieux) {
      setChargement(true);
      setErreur('');
    }

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/drivers?status=${filtre}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (!reponse.ok) throw new Error(t('loadError'));

      const lu = await reponse.json();
      setLivreurs(lu.drivers || []);
      setComptes(lu.counts || {});
    } catch (err) {
      setErreur(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setChargement(false);
    }
  }, [filtre, t, tCommon]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Un livreur qui s'inscrit ou dépose une pièce, validé par un collègue :
  // la file suit, et le dossier ouvert avec elle.
  const dossierOuvert = useRef<string | null>(null);
  dossierOuvert.current = dossier?.driver.id ?? null;

  useDonneesModifiees('drivers', async (modification) => {
    charger(true);

    const id = dossierOuvert.current;
    if (!id || (modification?.id && modification.id !== id)) return;

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/drivers/${id}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });
      if (reponse.ok && dossierOuvert.current === id) setDossier(await reponse.json());
    } catch {
      // Le dossier affiché reste celui d'avant ; la relecture suivante corrigera.
    }
  });

  const ouvrirDossier = async (livreur: Livreur) => {
    if (dossier?.driver.id === livreur.id) {
      setDossier(null);
      return;
    }

    setMotif('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/drivers/${livreur.id}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (reponse.ok) setDossier(await reponse.json());
    } catch {
      setErreur(t('loadError'));
    }
  };

  /** Chaque geste recharge la liste et le dossier : l'écran suit l'état réel. */
  const agir = async (chemin: string, corps?: unknown) => {
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/drivers/${chemin}`, {
        method: chemin.includes('/documents/') ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton()}` },
        body: JSON.stringify(corps ?? {}),
      });

      const lu = await reponse.json().catch(() => null);

      if (!reponse.ok) {
        setErreur(lu?.error || t('actionFailed'));
        return;
      }

      const id = chemin.split('/')[0];
      const rafraichi = await fetch(`${API_URL}/api/superowner/drivers/${id}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (rafraichi.ok) setDossier(await rafraichi.json());
      await charger();
    } catch {
      setErreur(t('connectionError'));
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'PENDING':
        return t('statusPending');
      case 'ACTIVE':
        return t('statusActive');
      case 'SUSPENDED':
        return t('statusSuspended');
      case 'REJECTED':
        return t('statusRejected');
      case 'INACTIVE':
        return tCommon('inactive');
      default:
        return status;
    }
  };

  const getDocumentStatus = (status: string): string => {
    switch (status) {
      case 'APPROVED':
        return t('documentApproved');
      case 'REJECTED':
        return t('documentRejected');
      default:
        return t('documentPending');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Truck className="w-8 h-8" />
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-2">
          {t('subtitle')}
        </p>
      </div>

      {erreur && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('filterDrivers')}>
        {[
          { valeur: 'PENDING', key: 'statusPending' },
          { valeur: 'ACTIVE', key: 'statusActive' },
          { valeur: 'SUSPENDED', key: 'statusSuspended' },
          { valeur: 'REJECTED', key: 'statusRejected' },
          { valeur: 'ALL', key: 'statusAll' },
        ].map((etat) => (
          <button
            key={etat.valeur}
            onClick={() => setFiltre(etat.valeur)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              filtre === etat.valeur
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {t(etat.key)}
            {comptes[etat.valeur] !== undefined && (
              <span className="ml-2 text-xs opacity-75">{comptes[etat.valeur]}</span>
            )}
          </button>
        ))}
      </div>

      {chargement ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : livreurs.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg">
          <p className="text-gray-400">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {livreurs.map((livreur) => {
            const ouvert = dossier?.driver.id === livreur.id;
            const vehicule = VEHICULES[livreur.vehicleType] || {
              icone: Car,
              libelle: livreur.vehicleType,
            };
            const IconeVehicule = vehicule.icone;

            return (
              <div key={livreur.id} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => ouvrirDossier(livreur)}
                  className="w-full px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-700/50 transition"
                >
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-semibold">{livreur.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          COULEURS[livreur.status] || COULEURS.INACTIVE
                        }`}
                      >
                        {getStatusLabel(livreur.status)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-400">
                      {livreur.email} · {livreur.phone}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <IconeVehicule size={14} />
                        {vehicule.libelle}
                        {livreur.vehiclePlate ? ` · ${livreur.vehiclePlate}` : ''}
                      </span>
                      <span>
                        {/* « 0/4 pièces validées » : l'accord suit le nombre attendu. */}
                        {livreur.piecesValidees}/{livreur.piecesAttendues} {t('piecesLabel', { count: livreur.piecesAttendues })}
                        {livreur.piecesAttendues > 1 ? 's' : ''}
                      </span>
                      <span>
                        {livreur.totalDeliveries} {livreur.totalDeliveries > 1 ? t('deliveries_plural') : t('delivery')}
                      </span>
                      <span>{euro(livreur.totalEarnings)} {t('earned')}</span>
                      <span className={livreur.rating != null && livreur.rating < 3 ? 'text-red-300' : ''}>
                        {livreur.rating == null
                          ? t('neverRated')
                          : `${livreur.rating.toFixed(1).replace('.', ',')} ★ (${livreur.avis} ${t('reviews')})`}
                      </span>
                    </div>

                    {livreur.statusReason && (
                      <p className="text-xs text-red-300 mt-2">{livreur.statusReason}</p>
                    )}
                  </div>

                  <span className="text-sm text-gray-400 flex-shrink-0">
                    {ouvert ? t('collapse') : t('viewFile')}
                  </span>
                </button>

                {ouvert && dossier && (
                  <div className="border-t border-gray-700 p-5 space-y-4">
                    <h4 className="font-semibold text-white">{t('documentsParts')}</h4>

                    {dossier.documents.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        {t('noDocuments')}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dossier.documents.map((piece) => (
                          <li
                            key={piece.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded bg-gray-700/40 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-white">
                                {piece.libelle}
                                <span
                                  className={`ml-2 text-xs ${
                                    piece.status === 'APPROVED'
                                      ? 'text-green-400'
                                      : piece.status === 'REJECTED'
                                        ? 'text-red-400'
                                        : 'text-gray-400'
                                  }`}
                                >
                                  {getDocumentStatus(piece.status)}
                                </span>
                              </p>
                              {piece.expiryDate && (
                                <p className="text-xs text-gray-500">
                                  {t('expiresOn')} {new Date(piece.expiryDate).toLocaleDateString('fr-FR')}
                                </p>
                              )}
                              {piece.reviewNote && (
                                <p className="text-xs text-red-300">{piece.reviewNote}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setPreviewPiece(piece)}
                                className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                                aria-label={t('preview')}
                              >
                                <Eye size={12} />
                                {t('preview')}
                              </button>
                              <a
                                href={piece.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300"
                                title={t('downloadDocument')}
                              >
                                <ExternalLink size={12} />
                              </a>
                              <button
                                onClick={() =>
                                  agir(`${livreur.id}/documents/${piece.id}`, { approuve: true })
                                }
                                aria-label={t('approveDocument', { name: piece.libelle })}
                                className="p-1.5 rounded bg-green-600/20 text-green-300 hover:bg-green-600/40"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() =>
                                  agir(`${livreur.id}/documents/${piece.id}`, {
                                    approuve: false,
                                    note: motif || t('defaultRejectReason'),
                                  })
                                }
                                aria-label={t('rejectDocument', { name: piece.libelle })}
                                className="p-1.5 rounded bg-red-600/20 text-red-300 hover:bg-red-600/40"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {dossier.piecesManquantes.length > 0 && (
                      <p className="text-sm text-amber-300">
                        {t('remainingToValidate')}:{' '}
                        {dossier.piecesAttendues
                          .filter((attendue) => dossier.piecesManquantes.includes(attendue.type))
                          .map((attendue) => attendue.libelle)
                          .join(', ')}
                      </p>
                    )}

                    <div className="border-t border-gray-700 pt-4 space-y-3">
                      <label htmlFor={`motif-${livreur.id}`} className="block text-sm text-gray-400">
                        {t('reasonLabel')}
                      </label>
                      <input
                        id={`motif-${livreur.id}`}
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder={t('reasonPlaceholder')}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => agir(`${livreur.id}/approve`)}
                          disabled={!dossier.dossierComplet || livreur.status === 'ACTIVE'}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition"
                        >
                          {t('approveDriver')}
                        </button>

                        {livreur.status === 'ACTIVE' ? (
                          <button
                            onClick={() =>
                              agir(`${livreur.id}/reject`, {
                                etat: 'SUSPENDED',
                                raison: motif || t('defaultSuspendReason'),
                              })
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition"
                          >
                            {t('suspendDriver')}
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              agir(`${livreur.id}/reject`, {
                                etat: 'REJECTED',
                                raison: motif || t('defaultRejectDriverReason'),
                              })
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition"
                          >
                            {t('rejectDriver')}
                          </button>
                        )}

                        {(livreur.status === 'SUSPENDED' || livreur.status === 'INACTIVE') && (
                          <button
                            onClick={() => agir(`${livreur.id}/reactivate`)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition"
                          >
                            {t('reactivate')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {previewPiece && (
        <DocumentPreviewModal
          documentUrl={previewPiece.documentUrl}
          libelle={previewPiece.libelle}
          onClose={() => setPreviewPiece(null)}
        />
      )}
    </div>
  );
}
