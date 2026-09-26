import { distanceKm, estUnPoint, Point } from "../utils/geo";

/**
 * Plusieurs courses pour un même livreur : une tournée.
 *
 * Un livreur qui part d'un commerce avec une commande pour une rue revenait
 * à vide chercher la suivante, destinée à la rue d'à côté. Il peut désormais
 * en porter plusieurs à la fois (trois par défaut), à deux conditions :
 *
 * - le client est proche d'un client déjà dans la tournée (2 km par défaut),
 *   ou sur le trajet (le détour reste sous 2 km par défaut) ;
 * - la commande part du même commerce, ou d'un commerce sur le trajet (même
 *   limite de détour).
 *
 * Les trois valeurs se règlent dans l'espace plateforme.
 *
 * Le détour se mesure sur la tournée entière : ce qu'elle rallonge avec la
 * course en plus, retraits et remises compris, dans le meilleur ordre.
 */

/**
 * Les règles de la tournée, réglables depuis l'espace plateforme
 * (SystemConfig). Ces valeurs servent de repli.
 */
export interface ReglesTournee {
  /** Au-delà, une course de plus ferait trop attendre les clients déjà servis. 1 : pas de tournée. */
  maxCourses: number;
  /** Clients « au même endroit ». */
  rayonClientsKm: number;
  /** Ce qu'une course de plus peut rallonger la tournée. */
  detourMaxKm: number;
}

export const REGLES_TOURNEE_PAR_DEFAUT: ReglesTournee = { maxCourses: 3, rayonClientsKm: 2, detourMaxKm: 2 };
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
 * L'ordre des arrêts, au plus proche d'abord, depuis le point de départ :
 * tous les retraits, puis toutes les remises. On ne remet jamais une
 * commande qu'on n'a pas encore prise, et l'adresse des clients reste
 * masquée tant qu'une commande de la tournée attend au commerce. À
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
    // Tous les retraits d'abord : le livreur ne connaît l'adresse d'un client
    // qu'une fois toutes les commandes de la tournée en main.
    const retraits = restants.filter((a) => a.type === "RETRAIT");
    const possibles = retraits.length > 0 ? retraits : restants.filter((a) => recuperees.has(a.deliveryId));
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
export function detourPourRejoindre(
  depart: Point | null,
  courses: CourseTournee[],
  nouvelle: CourseTournee,
  regles: ReglesTournee = REGLES_TOURNEE_PAR_DEFAUT
) {
  if (courses.length === 0 || courses.length >= regles.maxCourses) return null;
  if (!estUnPoint(nouvelle.retrait) || !estUnPoint(nouvelle.remise)) return null;
  if (courses.some((c) => !estUnPoint(c.retrait) || !estUnPoint(c.remise))) return null;

  const avant = ordonner(depart, courses).km;
  const apres = ordonner(depart, [...courses, nouvelle]).km;
  const detour = Math.max(0, apres - avant);
  const surLeTrajet = detour <= regles.detourMaxKm;

  const memeCommerce = courses.some((c) => distanceKm(c.retrait, nouvelle.retrait) <= MEME_COMMERCE_KM);
  const clientProche = courses.some((c) => distanceKm(c.remise, nouvelle.remise) <= regles.rayonClientsKm);

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
