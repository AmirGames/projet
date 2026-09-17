import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * La note du livreur.
 *
 * `Driver.rating` valait 5,00 pour tout le monde : c'était la valeur par défaut
 * de la colonne, et aucune route ne l'écrivait. Le livreur lisait « 5 » sur son
 * tableau de bord le jour de son inscription, la plateforme classait ses
 * livreurs sur un chiffre identique pour tous, et le client qui avait reçu son
 * repas une heure en retard et froid n'avait nulle part où le dire.
 *
 * Une note va de 1 à 5, se donne une fois par course remise, et par le client
 * de cette course. Ce que ça coûte : un livreur qui n'a jamais été noté n'a pas
 * de note — et c'est bien ce qu'il faut afficher, plutôt qu'un 5 sur 5 qu'il
 * n'a pas gagné. C'est `avis` qui le dit, et les écrans s'en servent.
 */

export const NOTE_MIN = 1;
export const NOTE_MAX = 5;

/** Longueur du commentaire : de quoi dire ce qui s'est passé, pas un roman. */
export const COMMENTAIRE_MAX = 500;

/**
 * La moyenne d'un livreur, recalculée depuis ses notes.
 *
 * Recalculée, et non ajustée au fil de l'eau : une moyenne entretenue par
 * additions successives dérive au premier incident — une note écrite deux fois,
 * une transaction interrompue — et plus rien ne permet de la remettre d'aplomb.
 * Ici la vérité est dans les notes, et `Driver.rating` n'en est que le reflet.
 */
export async function recalculerMoyenne(driverId: string) {
  const bilan = await db.driverRating.aggregate({
    where: { driverId },
    _avg: { note: true },
    _count: { _all: true },
  });

  const avis = bilan._count._all;
  // Sans note, on revient à la valeur par défaut de la colonne. Ce n'est pas
  // une note : `totalRatings` à zéro est ce qui dit « pas encore noté ».
  const moyenne = avis > 0 ? Math.round((bilan._avg.note ?? 0) * 100) / 100 : 5;

  await db.driver.update({
    where: { id: driverId },
    data: { rating: moyenne, totalRatings: avis },
  });

  return { moyenne, avis };
}

interface Demande {
  orderId: string;
  customerId: string;
  note: number;
  commentaire?: string | null;
}

/**
 * Noter le livreur d'une commande.
 *
 * Trois refus, et ils sont la raison d'être de cette fonction : une commande
 * qui n'est pas celle du client, une course qui n'est pas remise, et une note
 * déjà donnée. Sans eux, n'importe qui noterait n'importe quel livreur autant
 * de fois qu'il le voudrait.
 */
export async function noterLivreur({ orderId, customerId, note, commentaire }: Demande) {
  if (!Number.isInteger(note) || note < NOTE_MIN || note > NOTE_MAX) {
    throw new ApiError(400, `La note va de ${NOTE_MIN} à ${NOTE_MAX}`, "INVALID_RATING");
  }

  if (commentaire && commentaire.length > COMMENTAIRE_MAX) {
    throw new ApiError(
      400,
      `Le commentaire dépasse ${COMMENTAIRE_MAX} caractères`,
      "COMMENT_TOO_LONG"
    );
  }

  const commande = await db.order.findFirst({
    where: { id: orderId, customerId, deletedAt: null },
    select: { id: true },
  });

  if (!commande) {
    throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
  }

  const course = await db.orderDelivery.findUnique({
    where: { orderId },
    select: { id: true, status: true, driverId: true, rating: { select: { id: true } } },
  });

  if (!course || !course.driverId) {
    throw new ApiError(404, "Cette commande n'a pas de livreur", "DELIVERY_NOT_FOUND");
  }

  // Noter avant la remise, c'est noter une livraison qui n'a pas eu lieu.
  if (course.status !== "DELIVERED") {
    throw new ApiError(
      409,
      "Le livreur se note une fois la commande remise",
      "DELIVERY_NOT_COMPLETED"
    );
  }

  if (course.rating) {
    throw new ApiError(409, "Cette livraison est déjà notée", "ALREADY_RATED");
  }

  const enregistree = await db.driverRating.create({
    data: {
      deliveryId: course.id,
      driverId: course.driverId,
      customerId,
      note,
      commentaire: commentaire?.trim() || null,
    },
  });

  const bilan = await recalculerMoyenne(course.driverId);

  return { note: enregistree, ...bilan };
}

/** Ce qu'un livreur lit de ses propres notes. */
export async function notesDuLivreur(driverId: string, limite = 20) {
  const [livreur, notes] = await Promise.all([
    db.driver.findUnique({
      where: { id: driverId },
      select: { rating: true, totalRatings: true },
    }),
    db.driverRating.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      take: limite,
      // Le livreur lit ce qu'on lui reproche, jamais qui le lui reproche : une
      // note nominative se règle à la course suivante.
      select: { id: true, note: true, commentaire: true, createdAt: true },
    }),
  ]);

  const avis = livreur?.totalRatings ?? 0;

  return {
    moyenne: avis > 0 ? Number(livreur?.rating) : null,
    avis,
    notes,
  };
}
