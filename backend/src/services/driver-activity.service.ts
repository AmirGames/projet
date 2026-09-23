import { db } from "./db";

/**
 * L'activité d'un livreur : l'historique de ses courses et les chiffres qui
 * en découlent.
 *
 * Une course qu'il a annulée perd son livreur (driverId repasse à null pour
 * qu'un autre la prenne) : elle ne se retrouve que par la proposition qu'il
 * avait acceptée. L'historique part donc des deux côtés, sans quoi les
 * annulations disparaissaient.
 */

export type FiltreHistorique = "ALL" | "ACTIVE" | "DELIVERED" | "CANCELLED";

export interface OptionsHistorique {
  filtre?: FiltreHistorique;
  depuis?: Date;
  jusqua?: Date;
  page?: number;
  parPage?: number;
}

const STATUTS_EN_COURS = ["ACCEPTED", "PICKED_UP"];

/** Les courses que ce livreur a prises, qu'il les ait menées au bout ou non. */
function coursesDuLivreur(driverId: string) {
  return {
    OR: [
      { driverId },
      { offers: { some: { driverId, status: "ACCEPTED" } } },
    ],
  };
}

/** Minutes entre deux instants, ou null s'il en manque un. */
function minutesEntre(debut?: Date | null, fin?: Date | null) {
  if (!debut || !fin) return null;
  return Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
}

export class DriverActivityService {
  static async historique(driverId: string, options: OptionsHistorique = {}) {
    const parPage = Math.min(Math.max(options.parPage ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const filtreStatut = (() => {
      switch (options.filtre) {
        case "ACTIVE":
          return { driverId, status: { in: STATUTS_EN_COURS } };
        case "DELIVERED":
          return { driverId, status: "DELIVERED" };
        case "CANCELLED":
          // Échouée entre ses mains, ou lâchée : plus de livreur, ou reprise
          // par un autre.
          return {
            OR: [
              { status: "FAILED" },
              { driverId: null },
              { driverId: { not: driverId } },
            ],
          };
        default:
          return {};
      }
    })();

    const periode =
      options.depuis || options.jusqua
        ? {
            createdAt: {
              ...(options.depuis ? { gte: options.depuis } : {}),
              ...(options.jusqua ? { lt: options.jusqua } : {}),
            },
          }
        : {};

    const where = { AND: [coursesDuLivreur(driverId), filtreStatut, periode] };

    const [courses, total, livrees] = await Promise.all([
      db.orderDelivery.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              deliveryAddress: true,
              deliveryCity: true,
              deliveryPostal: true,
              totalAmount: true,
              store: { select: { name: true, address: true, city: true } },
            },
          },
          rating: { select: { note: true, commentaire: true } },
          offers: {
            where: { driverId, status: "ACCEPTED" },
            select: { payout: true, distanceKm: true, respondedAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * parPage,
        take: parPage,
      }),
      db.orderDelivery.count({ where }),
      // Le cumul porte sur toute la période filtrée, pas seulement la page.
      db.orderDelivery.aggregate({
        where: { AND: [{ driverId, status: "DELIVERED" }, periode] },
        _sum: { driverPayout: true, distanceKm: true },
        _count: true,
      }),
    ]);

    const data = courses.map((c) => {
      const offre = c.offers[0];
      const aMoi = c.driverId === driverId;
      // Une course qu'il a lâchée a pu être reprise par un autre : pour lui,
      // elle est annulée, quel que soit son statut actuel.
      const statut = !aMoi ? "CANCELLED" : c.status === "FAILED" ? "CANCELLED" : c.status;

      return {
        id: c.id,
        orderId: c.orderId,
        status: statut,
        cancelledBy: statut === "CANCELLED" ? c.cancelledBy ?? null : null,
        cancellationReason: statut === "CANCELLED" ? c.cancellationReason ?? null : null,
        store: c.order?.store?.name ?? "",
        pickupAddress: [c.order?.store?.address, c.order?.store?.city].filter(Boolean).join(", "),
        // La ville suffit dans un historique : l'adresse exacte d'un client
        // n'a plus à rester sous les yeux une fois la course finie.
        deliveryCity: [c.order?.deliveryPostal, c.order?.deliveryCity].filter(Boolean).join(" "),
        distanceKm: c.distanceKm ?? offre?.distanceKm ?? null,
        payout: aMoi && c.status === "DELIVERED" ? Number(c.driverPayout ?? offre?.payout ?? 0) : 0,
        acceptedAt: c.assignedAt ?? offre?.respondedAt ?? null,
        pickedUpAt: c.pickupTime,
        deliveredAt: c.deliveryTime,
        durationMin: minutesEntre(c.assignedAt, c.deliveryTime),
        proofType: c.proofType,
        rating: c.rating ? { note: c.rating.note, commentaire: c.rating.commentaire } : null,
        createdAt: c.createdAt,
      };
    });

    return {
      data,
      pagination: { page, parPage, total, pages: Math.max(1, Math.ceil(total / parPage)) },
      resume: {
        livrees: livrees._count,
        gains: Number(livrees._sum.driverPayout ?? 0),
        distanceKm: Number(livrees._sum.distanceKm ?? 0),
      },
    };
  }
}
