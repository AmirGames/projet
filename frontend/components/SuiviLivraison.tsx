'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bike, Clock, MapPin, Navigation, Store } from 'lucide-react';

export interface Point {
  latitude: number;
  longitude: number;
}

export interface Course {
  status: string;
  boutique?: string | null;
  adresseLivraison?: string | null;
  retrait?: Point | null;
  destination?: Point | null;
  position?: (Point & { misAJourLe?: string | null }) | null;
  distanceRestanteKm?: number | null;
  distanceTotaleKm?: number | null;
  driver?: { name: string; phone?: string; vehicleType?: string; rating?: number } | null;
}

interface Props {
  course: Course;
  /** Position poussée en direct, qui prend le pas sur celle de la course. */
  positionDirecte?: Point | null;
}

/**
 * Suivi d'une livraison : où en est le livreur, et dans combien de temps.
 *
 * Le plan est dessiné à la main plutôt que posé sur un fond cartographique :
 * il n'a aucune dépendance, fonctionne hors ligne, et répond à la seule
 * question que se pose le client — « c'est encore loin ? ». Un vrai fond de
 * carte viendra se substituer à ce plan sans rien changer au reste.
 */

const LIBELLES: Record<string, string> = {
  PENDING: 'En attente d’un livreur',
  ACCEPTED: 'Livreur en route vers le commerce',
  PICKED_UP: 'Commande récupérée, en route vers vous',
  DELIVERED: 'Livrée',
  FAILED: 'Livraison interrompue',
};

/** Vitesse moyenne d'un deux-roues en ville, embouteillages compris. */
const KM_PAR_MINUTE = 0.25;

const distanceLisible = (km: number) =>
  km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`;

function ilYA(horodatage?: string | null) {
  if (!horodatage) return null;

  const secondes = Math.round((Date.now() - new Date(horodatage).getTime()) / 1000);

  if (secondes < 0) return 'à l’instant';
  if (secondes < 60) return `il y a ${secondes} s`;
  if (secondes < 3600) return `il y a ${Math.floor(secondes / 60)} min`;

  return `il y a ${Math.floor(secondes / 3600)} h`;
}

export function SuiviLivraison({ course, positionDirecte }: Props) {
  // Le battement sert à rafraîchir « il y a N secondes » sans nouvel appel.
  const [, setBattement] = useState(0);

  useEffect(() => {
    const minuteur = setInterval(() => setBattement((n) => n + 1), 10000);
    return () => clearInterval(minuteur);
  }, []);

  const position = positionDirecte || course.position || null;

  // La distance envoyée par le serveur date du dernier relevé ; dès qu'une
  // position arrive en direct, on la recalcule ici.
  const restante = useMemo(() => {
    if (positionDirecte && course.destination) {
      const dLat = (course.destination.latitude - positionDirecte.latitude) * 111;
      const dLng =
        (course.destination.longitude - positionDirecte.longitude) *
        111 *
        Math.cos((positionDirecte.latitude * Math.PI) / 180);

      return Number(Math.sqrt(dLat * dLat + dLng * dLng).toFixed(2));
    }

    return course.distanceRestanteKm ?? null;
  }, [positionDirecte, course.destination, course.distanceRestanteKm]);

  const minutes = restante != null ? Math.max(1, Math.round(restante / KM_PAR_MINUTE)) : null;

  // Part du trajet déjà parcourue, pour situer le livreur sur le plan.
  const avancement = useMemo(() => {
    if (course.status === 'DELIVERED') return 1;
    if (restante == null || !course.distanceTotaleKm || course.distanceTotaleKm === 0) return null;

    return Math.min(1, Math.max(0, 1 - restante / course.distanceTotaleKm));
  }, [restante, course.distanceTotaleKm, course.status]);

  const livree = course.status === 'DELIVERED';

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white">Suivi de la livraison</h3>
          <p className="text-sm text-gray-400">{LIBELLES[course.status] || course.status}</p>
        </div>

        {minutes != null && !livree && (
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold text-orange-500">{minutes} min</p>
            <p className="text-xs text-gray-500">estimé</p>
          </div>
        )}
      </div>

      {/* Plan du trajet : commerce, livreur, vous. */}
      <div>
        <svg viewBox="0 0 100 24" className="w-full h-16" role="img" aria-label="Avancement du livreur">
          <line x1="8" y1="16" x2="92" y2="16" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />

          {avancement != null && (
            <line
              x1="8"
              y1="16"
              x2={8 + 84 * avancement}
              y2="16"
              stroke="#ea580c"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}

          <circle cx="8" cy="16" r="3" fill="#4b5563" />
          <circle cx="92" cy="16" r="3" fill={livree ? '#16a34a' : '#4b5563'} />

          {avancement != null && (
            <circle cx={8 + 84 * avancement} cy="16" r="4" fill="#ea580c">
              {!livree && (
                <animate attributeName="r" values="4;5;4" dur="2s" repeatCount="indefinite" />
              )}
            </circle>
          )}
        </svg>

        <div className="flex items-start justify-between text-xs -mt-2">
          <span className="flex items-center gap-1 text-gray-400 max-w-[45%]">
            <Store size={12} className="flex-shrink-0" />
            <span className="truncate">{course.boutique || 'Le commerce'}</span>
          </span>
          <span className="flex items-center gap-1 text-gray-400 max-w-[45%] justify-end text-right">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="truncate">{course.adresseLivraison || 'Chez vous'}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Navigation size={12} /> Distance restante
          </p>
          <p className="text-white font-semibold mt-1">
            {livree ? 'Arrivée' : restante != null ? distanceLisible(restante) : 'En attente'}
          </p>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3">
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Clock size={12} /> Position reçue
          </p>
          <p className="text-white font-semibold mt-1">
            {positionDirecte
              ? 'à l’instant'
              : ilYA(course.position?.misAJourLe) || 'Pas encore'}
          </p>
        </div>
      </div>

      {course.driver && (
        <div className="flex items-center gap-3 border-t border-gray-700 pt-4">
          <div className="w-10 h-10 rounded-full bg-orange-600/20 text-orange-400 flex items-center justify-center flex-shrink-0">
            <Bike size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-semibold truncate">{course.driver.name}</p>
            <p className="text-xs text-gray-400">
              {course.driver.vehicleType}
              {course.driver.rating ? ` · ${course.driver.rating} ★` : ''}
            </p>
          </div>
          {course.driver.phone && !livree && (
            <a
              href={`tel:${course.driver.phone}`}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-white transition flex-shrink-0"
            >
              Appeler
            </a>
          )}
        </div>
      )}

      {!position && !livree && (
        <p className="text-xs text-gray-500">
          La position du livreur s&apos;affichera dès qu&apos;il aura pris la route.
        </p>
      )}
    </div>
  );
}
