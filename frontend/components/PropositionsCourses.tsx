'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, Timer, Wallet } from 'lucide-react';

import { euro } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Cadence d'envoi de la position. Assez fréquente pour un suivi utile, assez
 *  espacée pour ne pas vider la batterie. */
const INTERVALLE_POSITION_MS = 15000;

/** Filet de sécurité si la connexion temps réel tombe. */
const INTERVALLE_RELEVE_MS = 10000;

interface Proposition {
  id: string;
  deliveryId: string;
  distanceKm: number | null;
  payout: number;
  expiresAt: string;
  boutique?: { name?: string; address?: string; city?: string } | null;
  adresse?: string | null;
  ville?: string | null;
  codePostal?: string | null;
}

interface Props {
  /** Le livreur accepte des courses seulement s'il est en ligne. */
  enLigne: boolean;
  /** Appelé après une acceptation, pour rafraîchir la page appelante. */
  surAcceptation?: () => void;
}

/**
 * Courses proposées au livreur, et envoi de sa position.
 *
 * Une proposition ne vit que quelques dizaines de secondes : elle arrive par
 * la connexion temps réel pour être vue tout de suite, et un relevé
 * périodique prend le relais si cette connexion tombe.
 *
 * La position est envoyée tant que le livreur est en ligne, course ou non :
 * c'est elle qui décide à qui la prochaine course sera proposée.
 */
export function PropositionsCourses({ enLigne, surAcceptation }: Props) {
  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [positionRefusee, setPositionRefusee] = useState(false);

  const jeton = useRef<string | null>(null);

  useEffect(() => {
    jeton.current = localStorage.getItem('driverToken') || localStorage.getItem('accessToken');
  }, []);

  const relever = useCallback(async () => {
    if (!jeton.current) return;

    try {
      const reponse = await fetch(`${API_URL}/api/drivers/offers`, {
        headers: { Authorization: `Bearer ${jeton.current}` },
      });

      if (!reponse.ok) return;

      const donnees = await reponse.json();
      setPropositions(donnees.data || []);
    } catch {
      // Un relevé manqué n'est pas grave : le suivant arrive dans dix secondes.
    }
  }, []);

  // Relevé périodique des propositions.
  useEffect(() => {
    if (!enLigne) {
      setPropositions([]);
      return;
    }

    relever();
    const minuteur = setInterval(relever, INTERVALLE_RELEVE_MS);
    return () => clearInterval(minuteur);
  }, [enLigne, relever]);

  // Envoi de la position.
  useEffect(() => {
    if (!enLigne || typeof navigator === 'undefined' || !navigator.geolocation) return;

    const envoyer = () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          setPositionRefusee(false);

          try {
            await fetch(`${API_URL}/api/drivers/location`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${jeton.current}`,
              },
              body: JSON.stringify({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
            });
          } catch {
            // Hors réseau : la position repartira au prochain envoi.
          }
        },
        () => setPositionRefusee(true),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    };

    envoyer();
    const minuteur = setInterval(envoyer, INTERVALLE_POSITION_MS);
    return () => clearInterval(minuteur);
  }, [enLigne]);

  // Le compte à rebours a besoin d'un battement de seconde.
  useEffect(() => {
    if (propositions.length === 0) return;

    const minuteur = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuteur);
  }, [propositions.length]);

  const repondre = async (propositionId: string, reponse: 'accept' | 'decline') => {
    setEnCours(propositionId);
    setErreur('');

    try {
      const resultat = await fetch(`${API_URL}/api/drivers/offers/${propositionId}/${reponse}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jeton.current}` },
      });

      const donnees = await resultat.json();

      if (!resultat.ok) {
        setErreur(donnees.error || "La réponse n'a pas été enregistrée.");
        await relever();
        return;
      }

      setPropositions((liste) => liste.filter((p) => p.id !== propositionId));

      if (reponse === 'accept') surAcceptation?.();
    } catch {
      setErreur('Serveur injoignable. Vérifiez votre connexion.');
    } finally {
      setEnCours(null);
    }
  };

  if (!enLigne) return null;

  const visibles = propositions.filter((p) => new Date(p.expiresAt).getTime() > maintenant);

  return (
    <div className="space-y-3">
      {positionRefusee && (
        <div className="bg-amber-900/30 border border-amber-700/50 text-amber-200 rounded-lg p-3 text-sm">
          Localisation refusée. Sans votre position, aucune course ne peut vous être proposée.
        </div>
      )}

      {erreur && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-200 rounded-lg p-3 text-sm">
          {erreur}
        </div>
      )}

      {visibles.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center text-gray-400">
          <Navigation size={28} className="mx-auto mb-2 text-gray-600" />
          <p>En attente d&apos;une course...</p>
          <p className="text-xs text-gray-500 mt-1">
            Vous serez prévenu dès qu&apos;une commande est prête près de vous.
          </p>
        </div>
      )}

      {visibles.map((proposition) => {
        const restant = Math.max(
          0,
          Math.ceil((new Date(proposition.expiresAt).getTime() - maintenant) / 1000)
        );

        return (
          <div
            key={proposition.id}
            className="bg-gray-800 border-2 border-orange-600 rounded-lg p-4 space-y-3 animate-pulse-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-white truncate">
                  {proposition.boutique?.name || 'Course à prendre'}
                </p>
                <p className="text-sm text-gray-400 truncate">
                  {proposition.boutique?.address}
                  {proposition.boutique?.city ? `, ${proposition.boutique.city}` : ''}
                </p>
              </div>

              <span
                title="Temps restant pour répondre"
                className={`flex items-center gap-1 px-2 py-1 rounded font-mono text-sm flex-shrink-0 ${
                  restant <= 10 ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-200'
                }`}
              >
                <Timer size={14} />
                {restant}s
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-gray-300">
                <MapPin size={14} className="text-orange-500" />
                {proposition.distanceKm != null ? `${proposition.distanceKm} km` : 'distance inconnue'}
              </span>
              <span className="flex items-center gap-1 font-semibold text-green-400">
                <Wallet size={14} />
                {euro(proposition.payout)}
              </span>
            </div>

            <div className="text-sm text-gray-400 border-t border-gray-700 pt-2">
              <p className="text-xs uppercase tracking-wide text-gray-500">Livraison</p>
              <p className="text-gray-300">
                {proposition.adresse}
                {proposition.codePostal || proposition.ville
                  ? `, ${[proposition.codePostal, proposition.ville].filter(Boolean).join(' ')}`
                  : ''}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => repondre(proposition.id, 'accept')}
                disabled={enCours === proposition.id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
              >
                {enCours === proposition.id ? '...' : 'Accepter'}
              </button>
              <button
                type="button"
                onClick={() => repondre(proposition.id, 'decline')}
                disabled={enCours === proposition.id}
                className="px-5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 py-3 rounded-lg transition"
              >
                Refuser
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
