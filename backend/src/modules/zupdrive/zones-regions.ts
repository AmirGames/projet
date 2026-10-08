import type { Region } from "./chauffeur-onboarding.service";

/**
 * Zone approximative de chaque région : un cercle (centre + rayon) qui la couvre
 * largement. Les régions n'ont pas de frontière précise en base ; ces cercles
 * ne servent qu'à mesurer un éloignement important (contrôle de conformité
 * « anomalie géographique »), jamais à décider dans quelle région tombe un
 * trajet (c'est le code postal, voir regionDuCodePostal).
 */
export const ZONES_REGIONS: Record<Region, { latitude: number; longitude: number; rayonKm: number }> = {
  BRUXELLES: { latitude: 50.8503, longitude: 4.3517, rayonKm: 15 },
  WALLONIE: { latitude: 50.15, longitude: 4.75, rayonKm: 110 },
  FLANDRE: { latitude: 51.05, longitude: 4.2, rayonKm: 120 },
};

const RAYON_TERRE_KM = 6371;

/** Distance à vol d'oiseau (formule de haversine), en kilomètres. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance (km) d'un point au bord de la zone de la région ; 0 s'il est dedans. */
export function distanceALaZoneKm(region: Region, point: { latitude: number; longitude: number }): number {
  const zone = ZONES_REGIONS[region];
  return Math.max(0, distanceKm(zone, point) - zone.rayonKm);
}
