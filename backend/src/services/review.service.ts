import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

import { etatModeration } from "./etat-moderation";

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

      const satisfactionPercentage = totalReviews > 0
        ? Math.round((ratingBreakdown["5"] / totalReviews) * 100)
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
