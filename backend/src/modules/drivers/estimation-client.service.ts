import { db } from "../../services/db";
import { finAttente } from "./delivery-proof.service";
import { planifierTournee, positionExploitable, versCoursePlanifiable } from "./planification-livraison.service";
import { ordonner } from "./tournee.service";

export const CHAMPS_COURSE_ESTIMATION = {
  id: true, status: true, pickupLat: true, pickupLng: true, deliveryLat: true, deliveryLng: true,
  ordreRemise: true, customerWaitStartedAt: true, customerWaitLeftAt: true,
} as const;

export const CHAMPS_LIVREUR_ESTIMATION = {
  vehicleType: true, latitude: true, longitude: true, lastLocationUpdate: true, gpsLostAt: true,
  deliveries: {
    where: { status: { in: ["ACCEPTED", "PICKED_UP"] as string[] } },
    select: { ...CHAMPS_COURSE_ESTIMATION, order: { select: { status: true, estimatedReadyAt: true } } },
    // Cinq courses maximum configurables. Une sixième invalide l'estimation.
    take: 6,
  },
} as const;

interface CourseEstimee {
  id: string;
  status: string;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  ordreRemise?: number | null;
  customerWaitStartedAt?: Date | null;
  customerWaitLeftAt?: Date | null;
  order?: { status: string; estimatedReadyAt: Date | null };
}
interface LivreurEstime {
  vehicleType: string;
  latitude: number | null;
  longitude: number | null;
  lastLocationUpdate: Date | null;
  gpsLostAt: Date | null;
  deliveries: CourseEstimee[];
}
interface CommandeEstimee {
  status: string;
  deliveryType: string;
  deliveryMode?: string | null;
  estimatedReadyAt: Date | null;
  delivery: (CourseEstimee & { reservedDriverId?: string | null; driver?: LivreurEstime | null }) | null;
}

type Etape = "CONFIRMATION" | "PREPARATION" | "RECHERCHE_LIVREUR" | "LIVREUR_EN_APPROCHE" | "COLLECTE"
  | "AUTRE_LIVRAISON" | "EN_ROUTE" | "ATTENTE_CLIENT" | "LIVREE" | "ANNULEE" | "LIVRAISON_COMMERCANT";
type Motif = "GPS_INDISPONIBLE" | "PREPARATION_INCONNUE" | "PREPARATION_EN_RETARD" | "TRAJET_INCONNU" | null;
export interface EstimationClient {
  etape: Etape;
  fourchette: { debut: string; fin: string } | null;
  motif: Motif;
  calculeeLe: string;
  valideJusqua: string;
}

const GPS_MAX_MS = 120_000;
const PREPARATION_DEPASSEE_MS = 120_000;

/** Résumé public : aucune autre adresse, identité ou étape détaillée de tournée. */
export function estimerPourClient(commande: CommandeEstimee, reserve: LivreurEstime | null = null, maintenant = Date.now()): EstimationClient | null {
  if (commande.deliveryType !== "DELIVERY") return null;
  const course = commande.delivery;
  const livreur = course?.driver ?? reserve;
  const resultat: EstimationClient = {
    etape: "RECHERCHE_LIVREUR", fourchette: null, motif: null,
    calculeeLe: new Date(maintenant).toISOString(), valideJusqua: new Date(maintenant + 60_000).toISOString(),
  };
  if (["REJECTED", "CANCELLED"].includes(commande.status) || ["FAILED", "CANCELLED"].includes(course?.status ?? "")) return { ...resultat, etape: "ANNULEE" };
  if (commande.status === "COMPLETED" || course?.status === "DELIVERED") return { ...resultat, etape: "LIVREE" };
  if (commande.status === "PENDING") return { ...resultat, etape: "CONFIRMATION" };
  if (commande.deliveryMode === "OWN") return { ...resultat, etape: "LIVRAISON_COMMERCANT" };

  const preparation = commande.status !== "READY" && course?.status !== "PICKED_UP";
  resultat.etape = preparation ? "PREPARATION" : "RECHERCHE_LIVREUR";
  if (preparation && commande.estimatedReadyAt && commande.estimatedReadyAt.getTime() < maintenant - PREPARATION_DEPASSEE_MS) {
    return { ...resultat, motif: "PREPARATION_EN_RETARD" };
  }
  // Ne pas inventer le temps nécessaire pour trouver un livreur.
  if (!course || !livreur) return resultat;
  const actives = livreur.deliveries ?? [];
  const reservation = !course.driver && reserve != null && actives.length > 0;
  const cible = { ...course, order: { status: commande.status, estimatedReadyAt: commande.estimatedReadyAt } };
  const courses = [...actives.filter((c) => c.id !== course.id), cible];
  if (courses.length > 5 || !["PENDING", "ACCEPTED", "PICKED_UP"].includes(course.status)) return { ...resultat, motif: "TRAJET_INCONNU" };

  if (reservation) resultat.etape = "AUTRE_LIVRAISON";
  else if (course.customerWaitStartedAt) resultat.etape = "ATTENTE_CLIENT";
  else if (course.status === "PICKED_UP") resultat.etape = "EN_ROUTE";
  else if (!preparation) resultat.etape = "LIVREUR_EN_APPROCHE";

  const ageGps = livreur.lastLocationUpdate ? maintenant - livreur.lastLocationUpdate.getTime() : Infinity;
  if (livreur.gpsLostAt || !Number.isFinite(ageGps) || ageGps < -30_000 || ageGps >= GPS_MAX_MS || !positionExploitable(livreur)) {
    return { ...resultat, motif: "GPS_INDISPONIBLE" };
  }
  resultat.valideJusqua = new Date(maintenant + Math.min(60_000, GPS_MAX_MS - Math.max(0, ageGps))).toISOString();
  if (resultat.etape === "ATTENTE_CLIENT") return resultat;
  for (const c of courses) {
    if (c.customerWaitLeftAt) return { ...resultat, motif: "TRAJET_INCONNU" };
    if (c.status !== "PICKED_UP" && c.order?.status !== "READY") {
      if (!c.order?.estimatedReadyAt) return { ...resultat, motif: "PREPARATION_INCONNUE" };
      if (c.order.estimatedReadyAt.getTime() < maintenant - PREPARATION_DEPASSEE_MS) return { ...resultat, motif: "PREPARATION_EN_RETARD" };
    }
  }
  const convertir = (c: CourseEstimee) => ({ ...versCoursePlanifiable(c), attenteJusqua: finAttente({ customerWaitStartedAt: c.customerWaitStartedAt ?? null }) });
  const planifiables = courses.map(convertir);
  let plan;
  if (reservation) {
    // La réservation commence après la tournée actuelle : aucun retrait
    // de la nouvelle commande ne passe avant les remises déjà engagées.
    const enCours = actives.map(convertir);
    const avant = planifierTournee(livreur, enCours, livreur.vehicleType, maintenant);
    const fin = ordonner(livreur, enCours).arrets.at(-1)?.point;
    plan = avant && fin ? planifierTournee(fin, [convertir(cible)], livreur.vehicleType, maintenant, avant.finSecondes) : null;
  } else {
    plan = planifierTournee(livreur, planifiables, livreur.vehicleType, maintenant);
    if (plan) {
      const arrets = ordonner(livreur, planifiables).arrets;
      if (course.status === "PICKED_UP" && arrets.some((a) => a.type === "RETRAIT")) resultat.etape = "COLLECTE";
      else if (course.status === "PICKED_UP" && arrets[0]?.deliveryId !== course.id) resultat.etape = "AUTRE_LIVRAISON";
    }
  }
  const secondes = plan?.remises.get(course.id);
  if (secondes == null || !Number.isFinite(secondes)) return { ...resultat, motif: "TRAJET_INCONNU" };
  // Marge explicite et arrondi à cinq minutes, sans borne située dans le passé.
  const marge = Math.max(120_000, secondes * 1000 * 0.2);
  const cibleMs = maintenant + secondes * 1000;
  const debut = Math.max(Math.ceil(maintenant / 60_000) * 60_000, Math.floor((cibleMs - marge) / 300_000) * 300_000);
  const fin = Math.max(debut + 300_000, Math.ceil((cibleMs + marge) / 300_000) * 300_000);
  return { ...resultat, fourchette: { debut: new Date(debut).toISOString(), fin: new Date(fin).toISOString() } };
}

/** À appeler uniquement après contrôle de l'accès à la commande. */
export async function estimationCommandeAutorisee(commande: CommandeEstimee) {
  const id = commande.delivery?.reservedDriverId;
  const reserve = id && !commande.delivery?.driver && !["COMPLETED", "REJECTED", "CANCELLED"].includes(commande.status)
    ? await db.courier.findUnique({ where: { id }, select: CHAMPS_LIVREUR_ESTIMATION }) : null;
  return estimerPourClient(commande, reserve);
}
