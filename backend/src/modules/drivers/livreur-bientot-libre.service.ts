import { distanceKm, estUnPoint, Point } from "../../utils/geo";

/**
 * Le livreur qui termine sa livraison peut déjà recevoir la course suivante.
 *
 * Un livreur « bientôt libre » est un livreur qui n'a qu'une course, déjà
 * récupérée, et qui est sur le point de la clore :
 *
 * - il est à la porte du client, à moins de 1 km par défaut (la remise du code
 *   suit), ou
 * - le client ne répond pas et l'attente de six minutes se termine dans moins
 *   de 3 minutes.
 *
 * La course qu'on lui propose ne s'ajoute pas à sa tournée : elle est réservée
 * et ne lui est attribuée qu'une fois la livraison en cours terminée. Sinon la
 * commande en cours passerait pour un retrait à faire, et l'adresse du client
 * serait masquée au livreur à sa porte (voir DispatchService.etatTournee).
 */

export interface ReglesBientotLibre {
  /** Distance au client en deçà de laquelle le livreur est considéré proche de la fin. */
  rayonKm: number;
  /** Temps restant d'attente à la porte en deçà duquel il est considéré proche de la fin. */
  secondes: number;
}

export const REGLES_BIENTOT_LIBRE_PAR_DEFAUT: ReglesBientotLibre = { rayonKm: 1, secondes: 180 };

/** Vitesse supposée pour estimer le temps restant à la porte (vélo / ville). */
export const VITESSE_ESTIMEE_KMH = 15;
/** Le temps de remettre la commande, une fois arrivé. */
export const REMISE_ESTIMEE_SECONDES = 60;
/** Au-delà, une réservation qui n'a pas abouti est relâchée. */
export const RESERVATION_MAX_MS = 20 * 60 * 1000;

/** Les réglages à 0 et 0 désactivent la fonction. */
export function bientotLibreActif(regles: ReglesBientotLibre): boolean {
  return regles.rayonKm > 0 || regles.secondes > 0;
}

/** Ce qu'il faut savoir de sa course en cours pour juger s'il est bientôt libre. */
export interface CourseEnCours {
  status: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  nearCustomerNotifiedAt: Date | null;
  /** Fin de l'attente à la porte (null : le client n'a pas été attendu). */
  attenteFinLe: Date | null;
  /** Le livreur s'est éloigné de l'adresse pendant l'attente. */
  customerWaitLeftAt: Date | null;
}

/**
 * Dans combien de secondes ce livreur sera libre, ou null s'il n'est pas
 * encore proche de la fin de sa course.
 */
export function libreDansSecondes(
  course: CourseEnCours,
  position: Point | null,
  maintenant: number,
  regles: ReglesBientotLibre = REGLES_BIENTOT_LIBRE_PAR_DEFAUT
): number | null {
  if (!bientotLibreActif(regles)) return null;
  // Pas encore récupérée : il n'est même pas parti chez le client.
  if (course.status !== "PICKED_UP") return null;
  // Parti de l'adresse pendant l'attente : on ne sait plus où il en est.
  if (course.customerWaitLeftAt) return null;

  // À la porte, client absent : l'attente a un terme connu.
  if (course.attenteFinLe) {
    const restant = Math.ceil((course.attenteFinLe.getTime() - maintenant) / 1000);
    return restant <= regles.secondes ? Math.max(0, restant) : null;
  }

  const adresse = { latitude: course.deliveryLat, longitude: course.deliveryLng };
  if (!position || !estUnPoint(position) || !estUnPoint(adresse)) return null;

  const distance = distanceKm(position, adresse);
  // Le client a déjà été prévenu que le livreur arrive (à moins de 300 m).
  if (!course.nearCustomerNotifiedAt && distance > regles.rayonKm) return null;

  return Math.round((distance / VITESSE_ESTIMEE_KMH) * 3600 + REMISE_ESTIMEE_SECONDES);
}
