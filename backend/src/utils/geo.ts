/**
 * Distances à la surface du globe.
 *
 * La formule de haversine était recopiée dans plusieurs fichiers, avec des
 * arrondis différents : une même course pouvait afficher deux distances selon
 * la page. Elle vit ici une fois pour toutes.
 */

const RAYON_TERRE_KM = 6371;

export interface Point {
  latitude: number;
  longitude: number;
}

const radians = (degres: number) => (degres * Math.PI) / 180;

/**
 * Distance à vol d'oiseau, en kilomètres.
 *
 * C'est une borne basse : la route réelle est toujours plus longue. Pour la
 * rémunération d'une course, cela sous-estime la distance parcourue — un
 * service d'itinéraire donnera un chiffre plus juste le jour où l'on en
 * branchera un.
 */
export function distanceKm(depart: Point, arrivee: Point): number {
  const dLat = radians(arrivee.latitude - depart.latitude);
  const dLng = radians(arrivee.longitude - depart.longitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(depart.latitude)) *
      Math.cos(radians(arrivee.latitude)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((RAYON_TERRE_KM * c).toFixed(2));
}

/** Un point n'est exploitable que si ses deux coordonnées sont des nombres. */
export function estUnPoint(valeur: {
  latitude?: number | null;
  longitude?: number | null;
}): valeur is Point {
  return typeof valeur.latitude === "number" && typeof valeur.longitude === "number";
}
