import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ReviewService } from "../services/review.service";
import { authMiddleware } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import { db } from "../services/db";
import { logger } from "../config/logger";
import { avisDuClientSurCommande } from "../services/avis-client.service";

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

/** Le client connecté et sa commande, ou le refus qui convient. */
async function commandeDuClient(req: Request, orderId: string) {
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
    where: { id: orderId, customerId: client.id, deletedAt: null },
    include: { items: { select: { productId: true } } },
  });

  if (!commande) {
    throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
  }

  return { client, commande };
}

// POST /reviews - Donner son avis depuis une commande (client connecté).
// Un client a un seul avis par restaurant et par plat : s'il en a déjà un, le
// nouvel envoi le remplace au lieu d'être refusé.
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = avisCommandeSchema.parse(req.body);
    const { client, commande } = await commandeDuClient(req, body.orderId);

    if (commande.status !== "COMPLETED") {
      throw new ApiError(400, "Vous pourrez donner votre avis une fois la commande terminée", "ORDER_NOT_COMPLETED");
    }

    // Un avis sur le restaurant ne porte sur aucun plat.
    let productId: string | null = null;

    if (body.type === "PRODUCT") {
      if (!body.productId) {
        throw new ApiError(400, "productId requis pour noter un produit", "PRODUCT_ID_REQUIRED");
      }

      if (!commande.items.some((i) => i.productId === body.productId)) {
        throw new ApiError(400, "Ce produit n'est pas dans cette commande", "PRODUCT_NOT_IN_ORDER");
      }

      productId = body.productId;
    }

    const existant = await db.review.findFirst({
      where: { customerId: client.id, storeId: commande.storeId, productId },
      select: { id: true },
    });

    const cible = body.type === "STORE" ? "le restaurant" : "ce produit";

    if (existant) {
      // Le statut reste celui qu'il était : un avis écarté par la modération
      // ne redevient pas visible parce que le client l'a retouché.
      await db.review.update({
        where: { id: existant.id },
        data: { rating: body.rating, comment: body.comment },
      });

      res.json({ message: `Votre avis sur ${cible} est mis à jour`, type: body.type, misAJour: true });
      return;
    }

    await db.review.create({
      data: {
        storeId: commande.storeId,
        productId,
        customerId: client.id,
        rating: body.rating,
        comment: body.comment,
        status: "APPROVED",
      },
    });

    res.status(201).json({ message: `Merci pour votre avis sur ${cible}`, type: body.type, misAJour: false });
  } catch (err) {
    next(err);
  }
});

// GET /reviews/commande/:orderId - Ce que le client a déjà dit du restaurant et
// des plats de cette commande, pour pré-remplir le formulaire. Déclarée avant
// /:storeId/:reviewId, qui la prendrait sinon pour un avis de commerce.
router.get("/commande/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { client, commande } = await commandeDuClient(req, req.params.orderId as string);

    const avis = await avisDuClientSurCommande(client.id, {
      storeId: commande.storeId,
      status: commande.status,
      createdAt: commande.createdAt,
      productIds: commande.items.map((i) => i.productId),
    });

    res.json({ success: true, data: avis });
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
