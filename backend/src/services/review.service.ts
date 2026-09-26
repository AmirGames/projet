import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

import { etatModeration } from "./etat-moderation";

export interface NoteDuCommerce {
  /** Moyenne des avis publiés, ou null tant que personne n'a noté. */
  rating: number | null;
  totalRatings: number;
  /** Part des avis à 4 ou 5 étoiles, ou null sans avis. */
  satisfactionPercentage: number | null;
}

/**
 * La vraie note de chaque commerce, en une requête pour toute une liste.
 *
 * Les listes de boutiques renvoyaient les colonnes `Store.rating` et
 * `Store.totalRatings`, que rien ne met à jour : 5,00 et 0 pour tout le monde,
 * d'où « ★ 5 (0 avis) » sur une boutique qui avait pourtant des avis. On
 * calcule ici sur les avis publiés du commerce lui-même, sans ceux des plats.
 */
export async function notesDesCommerces(storeIds: string[]): Promise<Map<string, NoteDuCommerce>> {
  const notes = new Map<string, NoteDuCommerce>();
  if (storeIds.length === 0) return notes;

  const [moyennes, satisfaits] = await Promise.all([
    db.review.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds }, productId: null, status: "APPROVED" },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    db.review.groupBy({
      by: ["storeId"],
      where: { storeId: { in: storeIds }, productId: null, status: "APPROVED", rating: { gte: 4 } },
      _count: { _all: true },
    }),
  ]);

  const satisfaitsPar = new Map(satisfaits.map((s) => [s.storeId, s._count._all]));

  for (const id of storeIds) notes.set(id, { rating: null, totalRatings: 0, satisfactionPercentage: null });
  for (const m of moyennes) {
    const total = m._count._all;
    if (total === 0) continue;
    notes.set(m.storeId, {
      rating: Math.round((m._avg.rating ?? 0) * 10) / 10,
      totalRatings: total,
      satisfactionPercentage: Math.round(((satisfaitsPar.get(m.storeId) ?? 0) / total) * 100),
    });
  }

  return notes;
}

/** Remplace, sur chaque boutique, la note figée en base par la vraie. */
export async function avecLaVraieNote<T extends { id: string }>(stores: T[]): Promise<(T & NoteDuCommerce)[]> {
  const notes = await notesDesCommerces(stores.map((s) => s.id));
  return stores.map((s) => ({ ...s, ...notes.get(s.id)! }));
}

export class ReviewService {
  /**
   * Les avis d'une boutique, vus du commerçant, avec leur état de modération.
   *
   * filtre « signales » : ceux qui attendent la décision de la plateforme ;
   * « retires » : ceux qu'elle a retirés.
   */
  static async getReviews(
    storeId: string,
    options?: { skip?: number; take?: number; productId?: string; filtre?: "signales" | "retires" }
  ) {
    const skip = options?.skip || 0;
    const take = options?.take || 50;

    const whereClause: any = { storeId };
    if (options?.productId) {
      whereClause.productId = options.productId;
    }
    if (options?.filtre === "signales") {
      whereClause.reports = { some: { decision: null } };
    } else if (options?.filtre === "retires") {
      whereClause.status = "REMOVED";
    }

    const [reviews, total] = await Promise.all([
      db.review.findMany({
        where: whereClause,
        skip,
        take,
        include: {
          product: { select: { name: true, sku: true } },
          customer: { select: { name: true, email: true } },
          reports: { select: { createdAt: true, decision: true, decisionNote: true, decidedAt: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.review.count({ where: whereClause }),
    ]);

    return {
      data: reviews.map(({ reports, ...avis }) => ({ ...avis, ...etatModeration(avis, reports) })),
      total,
      skip,
      take,
    };
  }

  static async getReview(storeId: string, reviewId: string) {
    const review = await db.review.findUnique({
      where: { id: reviewId },
      include: {
        product: true,
        customer: true,
      },
    });

    if (!review || review.storeId !== storeId) {
      throw new ApiError(404, "Review not found", "REVIEW_NOT_FOUND");
    }

    return review;
  }

  static async getProductReviewStats(storeId: string, productId: string) {
    try {
      const whereClause = {
        storeId,
        productId,
        status: "APPROVED",
      };

      const reviews = await db.review.findMany({
        where: whereClause,
      });

      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

      const ratingBreakdown = {
        "5": 0,
        "4": 0,
        "3": 0,
        "2": 0,
        "1": 0,
      };

      reviews.forEach((review) => {
        ratingBreakdown[String(review.rating) as keyof typeof ratingBreakdown]++;
      });

      return {
        totalReviews,
        averageRating: parseFloat(averageRating.toFixed(2)),
        ratingBreakdown,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getStoreReviewStats(storeId: string) {
    try {
      const reviews = await db.review.findMany({
        where: {
          storeId,
          // Les avis sur le commerce lui-même, sans plat.
          productId: null,
          status: "APPROVED",
        },
      });

      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

      const ratingBreakdown = {
        "5": 0,
        "4": 0,
        "3": 0,
        "2": 0,
        "1": 0,
      };

      reviews.forEach((review) => {
        ratingBreakdown[String(review.rating) as keyof typeof ratingBreakdown]++;
      });

      // Un client satisfait met 4 ou 5 étoiles : ne compter que les 5 affichait
      // « 👍 0 % » à une boutique notée 4/5 par tout le monde.
      const satisfactionPercentage = totalReviews > 0
        ? Math.round(((ratingBreakdown["5"] + ratingBreakdown["4"]) / totalReviews) * 100)
        : 0;

      return {
        totalReviews,
        averageRating: parseFloat(averageRating.toFixed(2)),
        ratingBreakdown,
        satisfactionPercentage,
      };
    } catch (error) {
      throw error;
    }
  }
}
