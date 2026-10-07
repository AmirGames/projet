import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { CourseDriveService } from "./course-drive.service";
import { ZupDrivePaymentService } from "./zupdrive-payment.service";
import { ApiError } from "../../middleware/errorHandler";

/**
 * /api/zupdrive/payment — Paiements des trajets ZupDrive.
 *
 * Flux:
 * 1. POST /intent — Crée un PaymentIntent Stripe
 * 2. Client charge la carte via Stripe.js
 * 3. Webhook Stripe confirme le paiement
 * 4. Le chauffeur reçoit un versement le lundi
 */

const router = Router();

// GET /api/zupdrive/payment/:courseId
// Récupère l'état du paiement d'une course
router.get("/:courseId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.params);
    const userId = (req as any).user?.id;

    await CourseDriveService.maCourse(userId, courseId);

    res.json({
      success: true,
      data: {
        courseId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/zupdrive/payment/intent
// Crée un PaymentIntent Stripe pour un trajet
router.post("/intent", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.body);
    const userId = (req as any).user?.id;

    const course = await CourseDriveService.maCourse(userId, courseId);
    if (!course) {
      throw new ApiError(404, "Trajet introuvable", "COURSE_NOT_FOUND");
    }

    if (course.statut !== "RECHERCHE") {
      throw new ApiError(409, "Ce trajet n'est plus en recherche de chauffeur", "INVALID_COURSE_STATUS");
    }

    const paymentIntent = await ZupDrivePaymentService.createPaymentIntent(
      courseId,
      userId,
      course.prixCentimes
    );

    res.json({
      success: true,
      data: paymentIntent,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/payment/earnings
// Revenus du chauffeur connecté
router.get("/earnings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const chauffeur = await CourseDriveService.chauffeurDuCompte(userId);

    const earnings = await ZupDrivePaymentService.getDriverEarnings(chauffeur.id);

    res.json({
      success: true,
      data: earnings,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
