import type { Request } from "express";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";

// Résout le livreur rattaché au compte. Sans ce contrôle, n'importe quel
// utilisateur authentifié pourrait manipuler les courses des autres.
export async function livreurDuCompte(userId: string) {
  const livreur = await db.courier.findUnique({ where: { userId } });

  if (!livreur) {
    throw new ApiError(404, "Aucun profil livreur associé à ce compte", "DRIVER_NOT_FOUND");
  }

  return livreur;
}

// Vérifie que la course appartient bien au livreur du compte.
export async function courseDuLivreur(userId: string, deliveryId: string, autoriserProposition = false) {
  const livreur = await livreurDuCompte(userId);

  const course = await db.orderDelivery.findUnique({ where: { id: deliveryId } });

  if (!course) {
    throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
  }

  if (course.driverId !== livreur.id) {
    // Une course sans livreur n'est pas publique. Seuls le détail et
    // l'acceptation admettent une proposition personnelle encore valable.
    const proposition = autoriserProposition && !course.driverId && course.status === "PENDING"
      ? await db.deliveryOffer.findFirst({
          where: { deliveryId, driverId: livreur.id, status: "PENDING", expiresAt: { gt: new Date() } },
          select: { id: true },
        })
      : null;
    if (!proposition) {
      throw new ApiError(403, "Cette course ne vous est pas attribuée ou proposée", "FORBIDDEN");
    }
  }

  return { livreur, course };
}

/** Le livreur du compte connecté à la requête (voir `livreurDuCompte`). */
export function livreurConnecte(req: Request) {
  return livreurDuCompte(req.user?.userId as string);
}

/** La course du livreur connecté à la requête (voir `courseDuLivreur`). */
export function courseDuLivreurConnecte(req: Request, deliveryId: string, autoriserProposition = false) {
  return courseDuLivreur(req.user?.userId as string, deliveryId, autoriserProposition);
}
