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

/**
 * Le point est-il à l'intérieur du polygone ?
 *
 * Ray casting classique : on trace une demi-droite horizontale depuis le
 * point vers l'infini et on compte combien de fois elle traverse un bord du
 * polygone. Un nombre impair de traversées veut dire qu'on est dedans.
 *
 * Suffisant ici : les polygones sont des quartiers dessinés à la main, pas
 * des géométries qui traversent l'antiméridien ou un pôle.
 */
export function pointDansPolygone(point: Point, sommets: Point[]): boolean {
  if (sommets.length < 3) return false;

  let dedans = false;

  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i++) {
    const a = sommets[i];
    const b = sommets[j];

    const traverse =
      a.latitude > point.latitude !== b.latitude > point.latitude &&
      point.longitude <
        ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
          (b.latitude - a.latitude) +
          a.longitude;

    if (traverse) dedans = !dedans;
  }

  return dedans;
}

/**
 * Aire approximative du polygone, en degrés carrés (formule du lacet).
 *
 * Pas une vraie surface en km² — les degrés de longitude ne valent pas les
 * degrés de latitude — mais ça n'a pas besoin d'être exact : ça sert
 * uniquement à comparer deux polygones de la même boutique entre eux, pour
 * savoir lequel est « le plus petit » quand plusieurs zones se recouvrent.
 */
export function airePolygone(sommets: Point[]): number {
  if (sommets.length < 3) return 0;

  let aire = 0;
  for (let i = 0, j = sommets.length - 1; i < sommets.length; j = i++) {
    aire += sommets[j].longitude * sommets[i].latitude - sommets[i].longitude * sommets[j].latitude;
  }

  return Math.abs(aire / 2);
}
