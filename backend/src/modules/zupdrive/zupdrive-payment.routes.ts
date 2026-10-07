import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { CourseDriveService } from "./course-drive.service";
import { ZupDrivePaymentService } from "./zupdrive-payment.service";
import { ApiError } from "../../middleware/errorHandler";
import { db } from "../../services/db";
import { limiterCadence } from "../../middleware/throttle";

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

// Création d'un paiement : par compte, pour qu'un compte ne multiplie pas les intentions Stripe.
const limiterPaiements = limiterCadence({
  nom: "zupdrive-payment-intent",
  max: 10,
  fenetreMs: 600_000,
  cle: (req) => `${req.userId}`,
});

// GET /api/zupdrive/payment/earnings
// Revenus du chauffeur connecté
router.get("/earnings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId as string;
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

// POST /api/zupdrive/payment/intent
// Crée un PaymentIntent Stripe pour un trajet
router.post("/intent", authMiddleware, limiterPaiements, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string() }).parse(req.body);
    const userId = req.userId as string;

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

// GET /api/zupdrive/payment/:courseId
// L'état du paiement de la course du passager connecté, relu en base (le webhook Stripe en est la source).
// Déclarée après /earnings : sans cela « earnings » serait pris pour un identifiant de course.
router.get("/:courseId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId } = z.object({ courseId: z.string().min(1).max(64) }).parse(req.params);

    // 404 si la course n'est pas celle de ce passager.
    await CourseDriveService.maCourse(req.userId as string, courseId);

    const paiement = await db.paymentIntentDrive.findUnique({
      where: { courseId },
      select: { id: true, status: true, amountCentimes: true, currency: true, confirmedAt: true },
    });

    res.json({
      success: true,
      data: {
        courseId,
        payment: paiement,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
