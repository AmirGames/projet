/**
 * Ce que le client voit d'une livraison qui dérape.
 *
 * La surveillance des courses (surveillance-courses.service.ts) enregistre ses
 * constats en base (DeliveryIncident) ; le suivi du client les relit ici, sans
 * dépendre d'un événement temps réel qui a pu se perdre. Le client n'apprend
 * ni le détail ni la position du livreur : seulement que c'est en retard, et
 * depuis quand.
 *
 * Fichier à part, sans dépendance : le suivi des commandes l'importe, et le
 * service de surveillance importe déjà le suivi des commandes.
 */

/** Les constats à lire avec la course pour savoir si elle est en retard. */
export const INCIDENTS_POUR_LE_CLIENT = {
  where: {
    OR: [{ closedAt: null, phase: "LIVRAISON" }, { type: "COURSE_RETIREE" }],
  },
  select: { type: true, driverId: true, assignedAt: true, createdAt: true },
  orderBy: { createdAt: "asc" as const },
  take: 10,
};

/**
 * LIVRAISON : la commande est en route et n'arrive pas dans les temps.
 * NOUVEAU_LIVREUR : le premier livreur n'est pas venu, un autre prend le relais.
 */
export interface RetardClient {
  motif: "LIVRAISON" | "NOUVEAU_LIVREUR";
  depuis: Date;
}

export function retardPourLeClient(course: {
  status: string;
  driverId: string | null;
  assignedAt: Date | null;
  incidents?: { type: string; driverId: string; assignedAt: Date; createdAt: Date }[];
}): RetardClient | null {
  const incidents = course.incidents ?? [];

  if (course.status === "PICKED_UP") {
    // Seulement ceux du livreur actuel : un constat d'une attribution passée
    // ne dit rien de celle-ci.
    const enCours = incidents.find(
      (i) =>
        i.type !== "COURSE_RETIREE" &&
        i.driverId === course.driverId &&
        i.assignedAt.getTime() === course.assignedAt?.getTime()
    );
    return enCours ? { motif: "LIVRAISON", depuis: enCours.createdAt } : null;
  }

  // Recherche d'un nouveau livreur, ou nouveau livreur en route vers le commerce.
  if (course.status === "PENDING" || course.status === "ACCEPTED") {
    const retrait = incidents.find((i) => i.type === "COURSE_RETIREE");
    return retrait ? { motif: "NOUVEAU_LIVREUR", depuis: retrait.createdAt } : null;
  }

  return null;
}
