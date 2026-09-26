'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Bike, Clock, MapPin, Navigation, Store } from 'lucide-react';
import { Etoiles, NoterLivreur, type MaNote } from '@/components/NoterLivreur';
import { AttenteLivreur } from '@/components/AttenteLivreur';

// Leaflet touche `window` dès son chargement : il ne peut pas être rendu côté
// serveur.
const CarteTrajet = dynamic(() => import('@/components/CarteTrajet'), {
  ssr: false,
  loading: () => (
    <div className="h-[260px] w-full rounded-lg border border-gray-700 bg-gray-900 flex items-center justify-center text-sm text-gray-500">
      Chargement de la carte…
    </div>
  ),
});

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
  /** Le livreur n'envoie plus sa position : la pastille est figée. */
  gpsPerdu?: boolean;
  distanceRestanteKm?: number | null;
  distanceTotaleKm?: number | null;
  /** `rating` est nul tant que personne ne l'a noté : `avis` compte les notes. */
  driver?: {
    name: string;
    phone?: string;
    vehicleType?: string;
    rating?: number | null;
    avis?: number;
  } | null;
  /** Le code à donner au livreur à la porte. Nul une fois la course remise. */
  codeRemise?: string | null;
  /** CODE ou PHOTO, une fois la remise prouvée. */
  preuve?: string | null;
  /** La photo du dépôt, quand la remise s'est faite en son absence. */
  photoDepot?: string | null;
  /** Où le livreur a déposé la commande. */
  noteDepot?: string | null;
  /** Le livreur est à moins de 300 m : le client peut descendre. */
  livreurProche?: boolean;
  /** Le livreur attend à la porte : passé cette heure, dépôt en lieu sûr. */
  attenteFinLe?: string | null;
  /** L'heure du serveur à la lecture, pour corriger l'horloge du téléphone. */
  maintenant?: string | null;
  /** La note que ce client a déjà donnée à cette course, s'il l'a donnée. */
  maNote?: MaNote | null;
}

interface Props {
  course: Course;
  /** L'identifiant de la commande : c'est par lui que la note s'enregistre. */
  orderId?: string;
  /** Position poussée en direct, qui prend le pas sur celle de la course. */
  positionDirecte?: Point | null;
  /** Signal GPS du livreur perdu, poussé en direct ; prend le pas sur la course. */
  gpsPerduDirect?: boolean | null;
}

/**
 * Suivi d'une livraison : où en est le livreur, et dans combien de temps.
 *
 * Le trajet se pose désormais sur un vrai fond de carte, dès que le commerce
 * et l'adresse de livraison sont situés. Le plan dessiné à la main reste, mais
 * en repli : une commande dont les points manquent — une adresse que le service
 * n'a pas su situer — garde un trait d'avancement plutôt qu'un trou dans la
 * page.
 */

const LIBELLES: Record<string, string> = {
  PENDING: "En attente d'un livreur",
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

  if (secondes < 0) return "à l'instant";
  if (secondes < 60) return `il y a ${secondes} s`;
  if (secondes < 3600) return `il y a ${Math.floor(secondes / 60)} min`;

  return `il y a ${Math.floor(secondes / 3600)} h`;
}

export function SuiviLivraison({ course, orderId, positionDirecte, gpsPerduDirect }: Props) {
  // La note donnée reste à l'écran sans recharger la page : sans cela le client
  // ne saurait pas si son geste a été pris.
  const [maNote, setMaNote] = useState<MaNote | null>(course.maNote ?? null);
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
  const gpsPerdu = !livree && (gpsPerduDirect ?? course.gpsPerdu ?? false);

  // Sans le commerce et l'adresse, une carte ne montrerait qu'un fond vide :
  // le plan dessiné en dit alors davantage.
  const surLaCarte = !!course.retrait && !!course.destination;

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-5">
      {/* La pastille immobile ne veut pas dire que le livreur est arrêté :
          le dire, plutôt que de laisser le client s'inquiéter. */}
      {gpsPerdu && (
        <div role="status" className="bg-amber-900/30 border border-amber-700/50 text-amber-200 rounded-lg p-3 text-sm">
          Le livreur a momentanément perdu le signal GPS. Sa position s&apos;actualisera dès le retour
          du réseau{course.position?.misAJourLe ? ` (dernière position ${ilYA(course.position.misAJourLe)})` : ''}.
        </div>
      )}

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

      {/* Le code de remise : c'est lui qui prouve que le repas a bien changé de
          mains. Sans lui, une course se cloturait sur un simple clic. */}
      {!livree && course.codeRemise && (
        <div className="rounded-lg border border-orange-700/50 bg-orange-900/20 px-4 py-3">
          <p className="text-sm text-orange-200">Votre code de remise</p>
          <p className="text-3xl font-bold tracking-[0.3em] text-white">{course.codeRemise}</p>
          <p className="text-xs text-orange-200/80 mt-1">
            Donnez-le au livreur à la remise, et à personne d&apos;autre.
          </p>
        </div>
      )}

      {/* Le livreur est à la porte et n'arrive pas à le joindre. */}
      {!livree && course.status === 'PICKED_UP' && course.attenteFinLe && (
        <AttenteLivreur key={course.attenteFinLe} finLe={course.attenteFinLe} maintenant={course.maintenant} />
      )}

      {/* Prévenu à 300 m : le temps de descendre, le livreur est là. */}
      {!livree && course.status === 'PICKED_UP' && course.livreurProche && !course.attenteFinLe && (
        <div role="status" className="rounded-lg border border-green-700/60 bg-green-900/30 px-4 py-3">
          <p className="font-semibold text-green-200">Votre livreur est bientôt là</p>
          <p className="text-sm text-green-300/90">
            Il arrive dans un instant : vous pouvez descendre devant la porte.
          </p>
        </div>
      )}

      {livree && course.preuve && (
        <p className="text-sm text-green-300">
          {course.preuve === 'CODE'
            ? 'Remise confirmée par votre code.'
            : 'Dépôt confirmé par photo, en votre absence.'}
        </p>
      )}

      {/* La photo du dépôt : c'est au client qu'elle sert, pour retrouver
          son repas. */}
      {livree && course.photoDepot && (
        <div className="space-y-1">
          <img
            src={course.photoDepot}
            alt="Photo du dépôt de votre commande"
            className="w-full max-h-80 object-cover rounded-lg border border-gray-700"
          />
          {course.noteDepot && <p className="text-sm text-gray-400">Déposée : {course.noteDepot}</p>}
        </div>
      )}

      {/* Le trajet : commerce, livreur, vous. Sur la carte quand les points
          sont connus, en plan dessiné sinon. */}
      <div>
        {surLaCarte ? (
          <CarteTrajet
            retrait={course.retrait}
            destination={course.destination}
            livreur={position}
            livree={livree}
          />
        ) : (
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
        )}

        <div className={`flex items-start justify-between text-xs ${surLaCarte ? 'mt-2' : '-mt-2'}`}>
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
              ? "à l'instant"
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
            <p className="text-xs text-gray-400 flex items-center gap-1">
              {course.driver.vehicleType}
              {/* « 5 ★ » s'affichait pour tout le monde, y compris pour un
                  livreur qui n'avait jamais été noté. */}
              {course.driver.rating != null && (
                <>
                  <span>·</span>
                  <Etoiles valeur={course.driver.rating} taille={12} />
                  <span>
                    {course.driver.rating.toFixed(1).replace('.', ',')}
                    {course.driver.avis ? ` (${course.driver.avis})` : ''}
                  </span>
                </>
              )}
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

      {/* La note se demande une fois la commande reçue, là où le client
          regarde déjà — et non sur une page qu'il faudrait penser à ouvrir. */}
      {livree && course.driver && orderId && (
        <NoterLivreur
          orderId={orderId}
          prenomLivreur={course.driver.name?.split(' ')[0]}
          maNote={maNote}
          onNote={setMaNote}
        />
      )}

      {!position && !livree && (
        <p className="text-xs text-gray-500">
          La position du livreur s&apos;affichera dès qu&apos;il aura pris la route.
        </p>
      )}
    </div>
  );
}
