import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ReviewService } from "../services/review.service";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { db } from "../services/db";
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

const avisCommandeSchema = z.object({
  orderId: z.string().min(1, "orderId requis"),
  productId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  type: z.enum(["STORE", "PRODUCT"]).optional().default("PRODUCT"),
});

// POST /reviews - Déposer un avis depuis une commande (client connecté)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = avisCommandeSchema.parse(req.body);

    const userId = req.userId || (req as any).user?.userId;
    const utilisateur = userId
      ? await db.user.findUnique({ where: { id: userId }, select: { email: true } })
      : null;

    if (!utilisateur) {
      throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
    }

    const client = await db.customer.findUnique({ where: { email: utilisateur.email } });

    if (!client) {
      throw new ApiError(404, "Aucune fiche client pour ce compte", "CUSTOMER_NOT_FOUND");
    }

    const commande = await db.order.findFirst({
      where: { id: body.orderId, customerId: client.id, deletedAt: null },
      include: { items: { select: { productId: true } } },
    });

    if (!commande) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    if (commande.status !== "COMPLETED") {
      throw new ApiError(400, "Vous pourrez donner votre avis une fois la commande terminée", "ORDER_NOT_COMPLETED");
    }

    // Si type = STORE, noter le restaurant : l'avis ne porte sur aucun plat.
    // Il rangeait l'identifiant de la boutique dans productId, que la base
    // exige lié à un plat — chaque avis sur le restaurant finissait en 500.
    if (body.type === "STORE") {
      const dejaDepose = await db.review.findFirst({
        where: {
          customerId: client.id,
          storeId: commande.storeId,
          productId: null,
        },
      });

      if (dejaDepose) {
        throw new ApiError(409, "Vous avez déjà noté ce restaurant", "REVIEW_EXISTS");
      }

      await db.review.create({
        data: {
          storeId: commande.storeId,
          productId: null,
          customerId: client.id,
          rating: body.rating,
          comment: body.comment,
          status: "APPROVED",
        },
      });

      res.status(201).json({
        message: "Merci pour votre avis sur le restaurant",
        type: "STORE",
      });
      return;
    }

    // Type = PRODUCT : noter un produit spécifique
    if (!body.productId) {
      throw new ApiError(400, "productId requis pour noter un produit", "PRODUCT_ID_REQUIRED");
    }

    const produitDansCommande = commande.items.some((i) => i.productId === body.productId);
    if (!produitDansCommande) {
      throw new ApiError(400, "Ce produit n'est pas dans cette commande", "PRODUCT_NOT_IN_ORDER");
    }

    const dejaDepose = await db.review.findFirst({
      where: {
        customerId: client.id,
        productId: body.productId,
        storeId: commande.storeId,
      },
    });

    if (dejaDepose) {
      throw new ApiError(409, "Vous avez déjà noté ce produit", "REVIEW_EXISTS");
    }

    await db.review.create({
      data: {
        storeId: commande.storeId,
        productId: body.productId,
        customerId: client.id,
        rating: body.rating,
        comment: body.comment,
        status: "APPROVED",
      },
    });

    res.status(201).json({
      message: "Merci pour votre avis sur ce produit",
      type: "PRODUCT",
    });
  } catch (err) {
    next(err);
  }
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

// Déclarée avant /:storeId/:productId/stats : sinon « store » y était pris
// pour un identifiant de plat, et ces statistiques n'étaient jamais servies.
router.get("/:storeId/store/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Fetching store review stats", { storeId });

    const stats = await ReviewService.getStoreReviewStats(storeId);
    res.json(stats);
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
