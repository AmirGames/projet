import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm } from "../../utils/geo";

/**
 * La distance et la durée d'un trajet ZupDrive, pour son devis.
 *
 * Deux fournisseurs, choisis par ROUTING_PROVIDER :
 * - « estimation » (par défaut) : distance à vol d'oiseau × COEFFICIENT_DETOUR,
 *   durée à VITESSE_MOYENNE_KMH. Aucun service externe, aucune clé.
 * - « osrm » : un serveur OSRM (OSRM_API_URL), le moteur d'itinéraire libre
 *   d'OpenStreetMap. La vraie route, sa durée, et son tracé pour la carte.
 *   Le serveur de démonstration public n'est pas fait pour la production :
 *   hébergez votre propre instance (image Docker officielle, données de la
 *   Belgique).
 *
 * En développement et en test, une estimation prend le relais si OSRM ne
 * répond pas. En production, un tarif au kilomètre ne doit jamais être calculé
 * sur une distance estimée : le devis échoue sans itinéraire routier réel.
 */

/** Détour moyen de la route par rapport à la ligne droite, en ville. */
export const COEFFICIENT_DETOUR = 1.3;
/** Vitesse moyenne retenue pour la durée estimée, en km/h. */
const VITESSE_MOYENNE_KMH = 25;
/** Au-delà, le fournisseur est jugé injoignable. */
export const DELAI_FOURNISSEUR_MS = 3000;

export interface Point {
  latitude: number;
  longitude: number;
}

export interface Itineraire {
  distanceMetres: number;
  dureeSecondes: number;
  /** Le tracé de la route (points [latitude, longitude]), si le fournisseur le donne. */
  trace: [number, number][] | null;
  source: "osrm" | "estimation";
}

export function estimer(depart: Point, arrivee: Point): Itineraire {
  const distanceMetres = Math.round(distanceKm(depart, arrivee) * 1000 * COEFFICIENT_DETOUR);
  const dureeSecondes = Math.round((distanceMetres / 1000 / VITESSE_MOYENNE_KMH) * 3600);
  return { distanceMetres, dureeSecondes, trace: null, source: "estimation" };
}

async function parOsrm(base: string, depart: Point, arrivee: Point): Promise<Itineraire> {
  const coordonnees = `${depart.longitude},${depart.latitude};${arrivee.longitude},${arrivee.latitude}`;
  const url = `${base.replace(/\/+$/, "")}/route/v1/driving/${coordonnees}?overview=simplified&geometries=geojson`;
  const reponse = await fetch(url, { signal: AbortSignal.timeout(DELAI_FOURNISSEUR_MS) });
  if (!reponse.ok) throw new Error(`OSRM HTTP ${reponse.status}`);

  const lu = (await reponse.json()) as {
    code?: string;
    routes?: { distance: number; duration: number; geometry?: { coordinates?: [number, number][] } }[];
  };
  const route = lu.routes?.[0];
  if (lu.code !== "Ok" || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
    throw new Error(`OSRM sans itinéraire (${lu.code})`);
  }
  return {
    distanceMetres: Math.round(route.distance),
    dureeSecondes: Math.round(route.duration),
    // GeoJSON donne [longitude, latitude] ; la carte attend [latitude, longitude].
    trace: route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]) ?? null,
    source: "osrm",
  };
}

export async function calculerItineraire(depart: Point, arrivee: Point): Promise<Itineraire> {
  const fournisseur = process.env.ROUTING_PROVIDER || "estimation";
  const base = process.env.OSRM_API_URL;
  const production = process.env.NODE_ENV === "production";

  const refuserDevisSansRoute = () => {
    throw new ApiError(
      503,
      "Le calcul d'itinéraire est temporairement indisponible. Réessayez dans quelques instants.",
      "ROUTING_PROVIDER_UNAVAILABLE"
    );
  };

  if (production && fournisseur !== "osrm") {
    logger.error("Devis ZupDrive refusé : ROUTING_PROVIDER=osrm est requis en production");
    refuserDevisSansRoute();
  }

  if (fournisseur === "osrm") {
    if (!base) {
      logger.warn("ROUTING_PROVIDER=osrm sans OSRM_API_URL");
      if (production) refuserDevisSansRoute();
    } else {
      try {
        return await parOsrm(base, depart, arrivee);
      } catch (err) {
        logger.warn("Itinéraire OSRM indisponible", {
          error: err instanceof Error ? err.message : err,
        });
        if (production) refuserDevisSansRoute();
      }
    }
  }
  return estimer(depart, arrivee);
}
