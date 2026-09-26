import { distanceKm, estUnPoint, Point } from "../utils/geo";

/**
 * Plusieurs courses pour un même livreur : une tournée.
 *
 * Un livreur qui part d'un commerce avec une commande pour une rue revenait
 * à vide chercher la suivante, destinée à la rue d'à côté. Il peut désormais
 * en porter jusqu'à trois à la fois, à deux conditions :
 *
 * - le client est proche d'un client déjà dans la tournée (à 2 km au plus),
 *   ou sur le trajet (le détour reste sous 2 km) ;
 * - la commande part du même commerce, ou d'un commerce sur le trajet (même
 *   limite de détour).
 *
 * Le détour se mesure sur la tournée entière : ce qu'elle rallonge avec la
 * course en plus, retraits et remises compris, dans le meilleur ordre.
 */

/** Au-delà, une course de plus ferait trop attendre les clients déjà servis. */
export const MAX_COURSES_PAR_LIVREUR = 3;
/** Clients « au même endroit ». */
export const RAYON_CLIENTS_KM = 2;
/** Ce qu'une course de plus peut rallonger la tournée. */
export const DETOUR_MAX_KM = 2;
/** Deux retraits plus proches que cela : le même commerce. */
export const MEME_COMMERCE_KM = 0.1;

/** Une course vue par la tournée : où la prendre, où la remettre, où elle en est. */
export interface CourseTournee {
  id: string;
  retrait: Point;
  remise: Point;
  /** Déjà récupérée : il ne reste que la remise. */
  recuperee: boolean;
}

export interface Arret {
  deliveryId: string;
  type: "RETRAIT" | "REMISE";
  point: Point;
}

/**
 * Le meilleur ordre des arrêts, au plus proche d'abord, depuis le point de
 * départ : on ne remet jamais une commande qu'on n'a pas encore prise. À
 * trois courses (six arrêts au plus), c'est assez proche de l'optimal pour
 * la ville, et instantané.
 */
export function ordonner(depart: Point | null, courses: CourseTournee[]) {
  const restants: Arret[] = [];
  for (const c of courses) {
    if (!c.recuperee) restants.push({ deliveryId: c.id, type: "RETRAIT", point: c.retrait });
    restants.push({ deliveryId: c.id, type: "REMISE", point: c.remise });
  }

  const recuperees = new Set(courses.filter((c) => c.recuperee).map((c) => c.id));
  const ordre: Arret[] = [];
  let ici = depart;
  let km = 0;

  while (restants.length > 0) {
    const possibles = restants.filter((a) => a.type === "RETRAIT" || recuperees.has(a.deliveryId));
    // Sans point de départ (GPS inconnu), le premier arrêt possible ouvre la marche.
    const suivant = ici
      ? possibles.reduce((best, a) => (distanceKm(ici!, a.point) < distanceKm(ici!, best.point) ? a : best))
      : possibles[0];
    if (ici) km += distanceKm(ici, suivant.point);
    ordre.push(suivant);
    if (suivant.type === "RETRAIT") recuperees.add(suivant.deliveryId);
    restants.splice(restants.indexOf(suivant), 1);
    ici = suivant.point;
  }

  return { arrets: ordre, km };
}

/**
 * Cette course peut-elle rejoindre ces courses ? Renvoie le détour qu'elle
 * coûte, ou null si elle n'a rien à faire dans la tournée.
 *
 * depart : où se trouve le livreur (ou, pour un lot pas encore attribué, le
 * premier commerce).
 */
export function detourPourRejoindre(depart: Point | null, courses: CourseTournee[], nouvelle: CourseTournee) {
  if (courses.length === 0 || courses.length >= MAX_COURSES_PAR_LIVREUR) return null;
  if (!estUnPoint(nouvelle.retrait) || !estUnPoint(nouvelle.remise)) return null;
  if (courses.some((c) => !estUnPoint(c.retrait) || !estUnPoint(c.remise))) return null;

  const avant = ordonner(depart, courses).km;
  const apres = ordonner(depart, [...courses, nouvelle]).km;
  const detour = Math.max(0, apres - avant);
  const surLeTrajet = detour <= DETOUR_MAX_KM;

  const memeCommerce = courses.some((c) => distanceKm(c.retrait, nouvelle.retrait) <= MEME_COMMERCE_KM);
  const clientProche = courses.some((c) => distanceKm(c.remise, nouvelle.remise) <= RAYON_CLIENTS_KM);

  if (!(memeCommerce || surLeTrajet)) return null;
  if (!(clientProche || surLeTrajet)) return null;
  return Number(detour.toFixed(2));
}

/** Une course de la base, telle que la tournée la lit. */
export function versCourseTournee(c: {
  id: string;
  status: string;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
}): CourseTournee {
  return {
    id: c.id,
    retrait: { latitude: c.pickupLat, longitude: c.pickupLng } as Point,
    remise: { latitude: c.deliveryLat, longitude: c.deliveryLng } as Point,
    recuperee: c.status === "PICKED_UP",
  };
}
