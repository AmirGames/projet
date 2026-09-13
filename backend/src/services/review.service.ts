import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface ReviewData {
  productId: string;
  customerId?: string;
  rating: number;
  comment?: string;
}

export class ReviewService {
  static async getReviews(storeId: string, options?: { skip?: number; take?: number; productId?: string; status?: string }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      if (options?.productId) {
        whereClause.productId = options.productId;
      }
      if (options?.status) {
        whereClause.status = options.status;
      }

      const [reviews, total] = await Promise.all([
        db.review.findMany({
          where: whereClause,
          skip,
          take,
          include: {
            product: { select: { name: true, sku: true } },
            customer: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        db.review.count({ where: whereClause }),
      ]);

      return {
        data: reviews,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getReview(storeId: string, reviewId: string) {
    try {
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
    } catch (error) {
      throw error;
    }
  }

  static async createReview(storeId: string, data: ReviewData) {
    try {
      const product = await db.product.findUnique({
        where: { id: data.productId },
      });

      if (!product || product.storeId !== storeId) {
        throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const review = await db.review.create({
        data: {
          storeId,
          productId: data.productId,
          customerId: data.customerId,
          rating: Math.min(Math.max(data.rating, 1), 5),
          comment: data.comment,
          status: "PENDING",
        },
      });

      return review;
    } catch (error) {
      throw error;
    }
  }

  static async updateReviewStatus(storeId: string, reviewId: string, status: string) {
    try {
      const review = await db.review.findUnique({
        where: { id: reviewId },
      });

      if (!review || review.storeId !== storeId) {
        throw new ApiError(404, "Review not found", "REVIEW_NOT_FOUND");
      }

      const updated = await db.review.update({
        where: { id: reviewId },
        data: { status },
        include: {
          product: { select: { name: true } },
          customer: { select: { name: true } },
        },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteReview(storeId: string, reviewId: string) {
    try {
      const review = await db.review.findUnique({
        where: { id: reviewId },
      });

      if (!review || review.storeId !== storeId) {
        throw new ApiError(404, "Review not found", "REVIEW_NOT_FOUND");
      }

      await db.review.delete({
        where: { id: reviewId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
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
        ratingBreakdown[review.rating as keyof typeof ratingBreakdown]++;
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
}
