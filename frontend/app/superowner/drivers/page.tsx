'use client';

/**
 * Les livreurs de la plateforme, et la validation de leur dossier.
 *
 * La plateforme n'avait aucune page sur ses livreurs : elle ne pouvait ni les
 * voir, ni les valider, ni les écarter. N'importe qui s'inscrivait et recevait
 * une course dans la minute.
 */

import { useCallback, useEffect, useState } from 'react';
import { Bike, Car, Check, ExternalLink, Truck, X } from 'lucide-react';

import { euro } from '@/lib/format';

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

const ETATS: { valeur: string; libelle: string }[] = [
  { valeur: 'PENDING', libelle: 'À valider' },
  { valeur: 'ACTIVE', libelle: 'Actifs' },
  { valeur: 'SUSPENDED', libelle: 'Suspendus' },
  { valeur: 'REJECTED', libelle: 'Refusés' },
  { valeur: 'ALL', libelle: 'Tous' },
];

const LIBELLES: Record<string, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  REJECTED: 'Refusé',
  SUSPENDED: 'Suspendu',
  INACTIVE: 'Désactivé',
};

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
  const [livreurs, setLivreurs] = useState<Livreur[]>([]);
  const [comptes, setComptes] = useState<Record<string, number>>({});
  const [filtre, setFiltre] = useState('PENDING');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [motif, setMotif] = useState('');

  const jeton = () => localStorage.getItem('accessToken');

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur('');

    try {
      const reponse = await fetch(`${API_URL}/api/superowner/drivers?status=${filtre}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (!reponse.ok) throw new Error('Chargement impossible');

      const lu = await reponse.json();
      setLivreurs(lu.drivers || []);
      setComptes(lu.counts || {});
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  }, [filtre]);

  useEffect(() => {
    charger();
  }, [charger]);

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
      setErreur('Dossier illisible');
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
        setErreur(lu?.error || 'Action refusée');
        return;
      }

      const id = chemin.split('/')[0];
      const rafraichi = await fetch(`${API_URL}/api/superowner/drivers/${id}`, {
        headers: { Authorization: `Bearer ${jeton()}` },
      });

      if (rafraichi.ok) setDossier(await rafraichi.json());
      await charger();
    } catch {
      setErreur('Erreur de connexion');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Truck className="w-8 h-8" />
          Livreurs
        </h1>
        <p className="text-gray-400 mt-2">
          Un livreur ne reçoit de course qu&apos;une fois son dossier validé.
        </p>
      </div>

      {erreur && (
        <div className="p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20">
          {erreur}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrer les livreurs">
        {ETATS.map((etat) => (
          <button
            key={etat.valeur}
            onClick={() => setFiltre(etat.valeur)}
            className={`px-4 py-2 rounded text-sm font-medium transition ${
              filtre === etat.valeur
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {etat.libelle}
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
          <p className="text-gray-400">Aucun livreur dans cet état</p>
        </div>
      ) : (
        <div className="space-y-3">
          {livreurs.map((livreur) => {
            const vehicule = VEHICULES[livreur.vehicleType] || VEHICULES.car;
            const IconeVehicule = vehicule.icone;
            const ouvert = dossier?.driver.id === livreur.id;

            return (
              <div
                key={livreur.id}
                className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => ouvrirDossier(livreur)}
                  className="w-full text-left p-5 hover:bg-gray-700/30 transition"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold">{livreur.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            COULEURS[livreur.status] || COULEURS.INACTIVE
                          }`}
                        >
                          {LIBELLES[livreur.status] || livreur.status}
                        </span>
                        {livreur.isOnline && (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-300">
                            En ligne
                          </span>
                        )}
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
                        {/* « 0/4 pièces validées » : l'accord suit le nombre
                            attendu, pas le nombre déjà validé. */}
                        <span>
                          {livreur.piecesValidees}/{livreur.piecesAttendues} pièce
                          {livreur.piecesAttendues > 1 ? 's' : ''} validée
                          {livreur.piecesAttendues > 1 ? 's' : ''}
                        </span>
                        <span>{livreur.totalDeliveries} course{livreur.totalDeliveries > 1 ? 's' : ''}</span>
                        <span>{euro(livreur.totalEarnings)} gagnés</span>
                        {/* La note manquait entièrement : la plateforme
                            classait ses livreurs sans jamais voir ce que les
                            clients en disaient. */}
                        <span className={livreur.rating != null && livreur.rating < 3 ? 'text-red-300' : ''}>
                          {livreur.rating == null
                            ? 'jamais noté'
                            : `${livreur.rating.toFixed(1).replace('.', ',')} ★ (${livreur.avis} avis)`}
                        </span>
                      </div>

                      {livreur.statusReason && (
                        <p className="text-xs text-red-300 mt-2">{livreur.statusReason}</p>
                      )}
                    </div>

                    <span className="text-sm text-gray-400">
                      {ouvert ? 'Replier' : 'Voir le dossier'}
                    </span>
                  </div>
                </button>

                {ouvert && dossier && (
                  <div className="border-t border-gray-700 p-5 space-y-4">
                    <h4 className="font-semibold text-white">Pièces du dossier</h4>

                    {dossier.documents.length === 0 ? (
                      <p className="text-sm text-gray-400">
                        Aucune pièce déposée pour le moment.
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
                                  {piece.status === 'APPROVED'
                                    ? 'validée'
                                    : piece.status === 'REJECTED'
                                      ? 'refusée'
                                      : 'à examiner'}
                                </span>
                              </p>
                              {piece.expiryDate && (
                                <p className="text-xs text-gray-500">
                                  Expire le{' '}
                                  {new Date(piece.expiryDate).toLocaleDateString('fr-FR')}
                                </p>
                              )}
                              {piece.reviewNote && (
                                <p className="text-xs text-red-300">{piece.reviewNote}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <a
                                href={piece.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
                              >
                                <ExternalLink size={12} />
                                Ouvrir
                              </a>
                              <button
                                onClick={() =>
                                  agir(`${livreur.id}/documents/${piece.id}`, { approuve: true })
                                }
                                aria-label={`Valider ${piece.libelle}`}
                                className="p-1.5 rounded bg-green-600/20 text-green-300 hover:bg-green-600/40"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                onClick={() =>
                                  agir(`${livreur.id}/documents/${piece.id}`, {
                                    approuve: false,
                                    // Un refus sans motif est refusé par le
                                    // serveur : on prend celui de la case.
                                    note: motif || 'Pièce illisible ou non conforme',
                                  })
                                }
                                aria-label={`Refuser ${piece.libelle}`}
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
                        Reste à valider :{' '}
                        {dossier.piecesAttendues
                          .filter((attendue) => dossier.piecesManquantes.includes(attendue.type))
                          .map((attendue) => attendue.libelle)
                          .join(', ')}
                      </p>
                    )}

                    <div className="border-t border-gray-700 pt-4 space-y-3">
                      <label htmlFor={`motif-${livreur.id}`} className="block text-sm text-gray-400">
                        Motif (pour un refus ou une suspension)
                      </label>
                      <input
                        id={`motif-${livreur.id}`}
                        value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Assurance expirée, permis illisible…"
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => agir(`${livreur.id}/approve`)}
                          disabled={!dossier.dossierComplet || livreur.status === 'ACTIVE'}
                          className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition"
                        >
                          Valider le livreur
                        </button>

                        {livreur.status === 'ACTIVE' ? (
                          <button
                            onClick={() =>
                              agir(`${livreur.id}/reject`, {
                                etat: 'SUSPENDED',
                                raison: motif || 'Suspension décidée par la plateforme',
                              })
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition"
                          >
                            Suspendre
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              agir(`${livreur.id}/reject`, {
                                etat: 'REJECTED',
                                raison: motif || 'Dossier non conforme',
                              })
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition"
                          >
                            Refuser le dossier
                          </button>
                        )}

                        {(livreur.status === 'SUSPENDED' || livreur.status === 'INACTIVE') && (
                          <button
                            onClick={() => agir(`${livreur.id}/reactivate`)}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-medium transition"
                          >
                            Rétablir
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
    </div>
  );
}
