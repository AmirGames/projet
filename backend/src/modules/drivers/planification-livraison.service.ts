import { distanceKm, Point } from "../../utils/geo";
import { secondesAvantRetrait } from "./livreur-bientot-libre.service";
import { CourseTournee, detourPourRejoindre, ordonner, ReglesTournee, versCourseTournee } from "./tournee.service";

/** Estimation locale : aucun trafic temps réel ni distance routière facturée. */
const FACTEUR_ROUTE = 1.3;
const RETRAIT_SECONDES = 60;
const REMISE_SECONDES = 60;
/** Un regroupement ne doit pas décaler un client existant de plus de cinq minutes. */
export const RETARD_REGROUPEMENT_MAX_SECONDES = 5 * 60;

export interface CoursePlanifiable extends CourseTournee {
  preteA?: Date | null;
  attenteJusqua?: Date | null;
}

type CourseSource = Parameters<typeof versCourseTournee>[0] & {
  order?: { status?: string; estimatedReadyAt?: Date | null } | null;
};

export function versCoursePlanifiable(course: CourseSource): CoursePlanifiable {
  return {
    ...versCourseTournee(course),
    preteA: course.order?.status === "READY" ? null : course.order?.estimatedReadyAt,
  };
}

/** Écarte les GPS invalides plutôt que de leur attribuer un trajet nul. */
export function positionExploitable(point: { latitude?: number | null; longitude?: number | null }): point is Point {
  return typeof point.latitude === "number" && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
    && typeof point.longitude === "number" && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}

/**
 * Même ordre que le parcours livreur : tous les retraits avant les remises,
 * et respect des remises déjà figées. Les durées sont relatives à maintenant.
 */
export function planifierTournee(
  depart: Point,
  courses: CoursePlanifiable[],
  vehicule: string,
  maintenant: number,
  libreDansSecondes = 0
) {
  if (!positionExploitable(depart) || courses.some((c) =>
    (!c.recuperee && !positionExploitable(c.retrait)) || !positionExploitable(c.remise)
  )) return null;

  const retraits = new Map<string, number>();
  const remises = new Map<string, number>();
  const parId = new Map(courses.map((c) => [c.id, c]));
  let ici = depart;
  let secondes = Math.max(0, libreDansSecondes);
  for (const arret of ordonner(depart, courses).arrets) {
    secondes += secondesAvantRetrait(distanceKm(ici, arret.point) * FACTEUR_ROUTE, 0, vehicule);
    const course = parId.get(arret.deliveryId)!;
    if (arret.type === "RETRAIT") {
      const pret = course.preteA?.getTime();
      if (pret != null && Number.isFinite(pret)) secondes = Math.max(secondes, (pret - maintenant) / 1000);
      secondes += RETRAIT_SECONDES;
      retraits.set(course.id, Math.ceil(secondes));
    } else {
      const finAttente = course.attenteJusqua?.getTime();
      if (finAttente != null && Number.isFinite(finAttente)) secondes = Math.max(secondes, (finAttente - maintenant) / 1000);
      secondes += REMISE_SECONDES;
      remises.set(course.id, Math.ceil(secondes));
    }
    ici = arret.point;
  }
  return { retraits, remises, finSecondes: Math.ceil(secondes) };
}

/** Compare le trajet avant/après : distance ET attente au restaurant. */
export function evaluerRegroupement(
  depart: Point,
  courses: CoursePlanifiable[],
  nouvelle: CoursePlanifiable,
  regles: ReglesTournee,
  vehicule: string,
  maintenant: number
) {
  const detourKm = detourPourRejoindre(depart, courses, nouvelle, regles);
  // La limite de détour reste un plafond, même pour deux clients voisins.
  if (detourKm == null || detourKm > regles.detourMaxKm) return null;
  const avant = planifierTournee(depart, courses, vehicule, maintenant);
  const apres = planifierTournee(depart, [...courses, nouvelle], vehicule, maintenant);
  if (!avant || !apres) return null;

  let retardTotalSecondes = 0;
  let retardMaxSecondes = 0;
  for (const [id, secondes] of avant.remises) {
    const retard = Math.max(0, apres.remises.get(id)! - secondes);
    retardTotalSecondes += retard;
    retardMaxSecondes = Math.max(retardMaxSecondes, retard);
  }
  if (retardMaxSecondes > RETARD_REGROUPEMENT_MAX_SECONDES) return null;
  return {
    detourKm,
    retraitSecondes: apres.retraits.get(nouvelle.id)!,
    livraisonSecondes: apres.remises.get(nouvelle.id)!,
    retardMaxSecondes,
    // Une seconde gagnée sur la nouvelle livraison ne doit pas coûter
    // plusieurs secondes aux clients déjà engagés.
    scoreSecondes: apres.remises.get(nouvelle.id)! + retardTotalSecondes,
  };
}
