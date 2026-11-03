import limiteNamur from "./data/limite-commune-namur.json";

type Coord = [number, number];

// GeoJSON Polygon is [rings][points][longitude, latitude]. The source file is
// the official AGDP commune geometry, served by SPW in EPSG:4326.
const commune = limiteNamur.features[0];
const anneaux = commune.geometry.coordinates as Coord[][];

/** Codes postaux des sections de la commune de Namur pour le pilote initial. */
export const CODES_POSTAUX_PILOTE_NAMUR = new Set([
  "5000", "5001", "5002", "5003", "5004",
  "5020", "5021", "5022", "5024",
  "5100", "5101",
]);

export function estDansZonePiloteNamur(codePostal: string | null | undefined): boolean {
  return CODES_POSTAUX_PILOTE_NAMUR.has((codePostal || "").trim());
}

function surSegment(point: Coord, debut: Coord, fin: Coord): boolean {
  const [x, y] = point;
  const [x1, y1] = debut;
  const [x2, y2] = fin;
  const produitVectoriel = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(produitVectoriel) > 1e-10) return false;
  return x >= Math.min(x1, x2) - 1e-10 && x <= Math.max(x1, x2) + 1e-10
    && y >= Math.min(y1, y2) - 1e-10 && y <= Math.max(y1, y2) + 1e-10;
}

/** Rayon-casting, avec les points exactement sur un anneau inclus. */
function dansAnneau(point: Coord, anneau: Coord[]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const a = anneau[j];
    const b = anneau[i];
    if (surSegment(point, a, b)) return true;

    const coupeRayon = (a[1] > point[1]) !== (b[1] > point[1]);
    if (coupeRayon) {
      const longitudeIntersection = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < longitudeIntersection) dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * Vérifie les coordonnées WGS84 contre le polygone officiel de la commune.
 * Le code postal reste également vérifié par la règle du pilote.
 */
export function coordonneesDansCommuneNamur(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }

  const point: Coord = [longitude, latitude];
  const [exterieur, ...trous] = anneaux;
  if (!exterieur || !dansAnneau(point, exterieur)) return false;
  return !trous.some((trou) => dansAnneau(point, trou));
}

export function adresseDansZonePiloteNamur(adresse: {
  codePostal: string | null | undefined;
  latitude: number;
  longitude: number;
}): boolean {
  return estDansZonePiloteNamur(adresse.codePostal)
    && coordonneesDansCommuneNamur(adresse.latitude, adresse.longitude);
}
