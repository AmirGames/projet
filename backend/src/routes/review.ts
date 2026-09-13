import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ReviewService } from "../services/review.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createReviewSchema = z.object({
  productId: z.string().min(1),
  customerId: z.string().optional(),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const updateReviewStatusSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;
    const status = req.query.status as string | undefined;
    const productId = req.query.productId as string | undefined;

    logger.info("Fetching reviews", { storeId, skip, take, status });

    const result = await ReviewService.getReviews(storeId, { skip, take, status, productId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:reviewId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const reviewId = req.params.reviewId as string;

    logger.info("Fetching review", { storeId, reviewId });

    const review = await ReviewService.getReview(storeId, reviewId);
    res.json(review);
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createReviewSchema.parse(req.body);

    logger.info("Creating review", { storeId });

    const review = await ReviewService.createReview(storeId, body);
    res.status(201).json({
      message: "Review created successfully",
      review,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:reviewId/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const reviewId = req.params.reviewId as string;
    const body = updateReviewStatusSchema.parse(req.body);

    logger.info("Updating review status", { storeId, reviewId });

    const review = await ReviewService.updateReviewStatus(storeId, reviewId, body.status);
    res.json({
      message: "Review status updated successfully",
      review,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:reviewId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const reviewId = req.params.reviewId as string;

    logger.info("Deleting review", { storeId, reviewId });

    await ReviewService.deleteReview(storeId, reviewId);
    res.json({
      message: "Review deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:productId/stats", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;

    logger.info("Fetching review stats", { storeId, productId });

    const stats = await ReviewService.getProductReviewStats(storeId, productId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
