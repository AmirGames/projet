/**
 * Routes: Driver Payment & Payout Management
 *
 * Drivers: View earnings, request payouts
 * Admin: Process payouts, financial reporting
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ZupDrivePaymentDriverService } from "./zupdrive-payment-driver.service";
import { adminAuth, adminAuthSection } from "./zupdrive-garde";
import { limiterCadence } from "../../middleware/throttle";
import { authMiddleware } from "../auth/auth.middleware";
import { journaliser } from "../superowner/shared";
import { db } from "../../services/db";

const router = Router();

/** Identité vérifiée par le jeton (authMiddleware renseigne req.userId). */
const authenticate = authMiddleware;

/** Lectures financières de l'équipe : section « courses-drive ». Les écritures qui engagent l'argent
 * (traiter un versement, changer la commission) restent au superowner : adminAuth sans section. */
const adminLecture = adminAuthSection("courses-drive");
const idSchema = z.string().min(1).max(64);

// Demande de versement : par compte, elle écrit des versements.
const limiterDemandeVersement = limiterCadence({
  nom: "zupdrive-payout-request",
  max: 10,
  fenetreMs: 3_600_000,
  cle: (req) => `${req.userId}`,
});

// ============================================================================
// DRIVER ENDPOINTS
// ============================================================================

/**
 * Get driver's earnings for a period
 * GET /api/zupdrive/earnings?period=week
 * period: today | week | month
 */
router.get(
  "/earnings",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Find driver by user ID
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const period = z.enum(["today", "week", "month"]).default("week").parse(req.query.period);

      const earnings = await ZupDrivePaymentDriverService.getDriverEarnings(
        chauffeur.id,
        period
      );

      return res.json({
        success: true,
        earnings,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Get driver's financial dashboard
 * GET /api/zupdrive/financial-dashboard
 */
router.get(
  "/financial-dashboard",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const dashboard = await ZupDrivePaymentDriverService.getFinancialDashboard(
        chauffeur.id
      );

      return res.json({
        success: true,
        dashboard,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Get payout history
 * GET /api/zupdrive/payouts/history?limit=10
 */
router.get(
  "/payouts/history",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const limit = Math.min(z.coerce.number().int().min(1).default(10).parse(req.query.limit), 50);

      const history = await ZupDrivePaymentDriverService.getPayoutHistory(
        chauffeur.id,
        limit
      );

      return res.json({
        success: true,
        payouts: history,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Request a payout for this week's earnings
 * POST /api/zupdrive/payouts/request
 */
router.post(
  "/payouts/request",
  authenticate,
  limiterDemandeVersement,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const payout = await ZupDrivePaymentDriverService.preparePayout(chauffeur.id);

      return res.json({
        success: true,
        message: "Payout requested successfully",
        payout,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Get payout status
 * GET /api/zupdrive/payouts/:payoutId
 */
router.get(
  "/payouts/:payoutId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payoutId = idSchema.parse(req.params.payoutId);

      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const status = await ZupDrivePaymentDriverService.getPayoutStatus(payoutId, chauffeur.id);

      return res.json({
        success: true,
        payout: status,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Calculate earnings for a specific course
 * POST /api/zupdrive/earnings/calculate
 */
router.post(
  "/earnings/calculate",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { courseId } = z.object({ courseId: z.string() }).parse(req.body);

      // Le chauffeur est celui du jeton, jamais celui du corps de requête ;
      // le prix vient de la course en base.
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const earnings = await ZupDrivePaymentDriverService.calculateCourseEarnings({
        courseId,
        chauffeurId: chauffeur.id,
      });

      return res.json({
        success: true,
        earnings,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Admin: Process a pending payout
 * POST /api/zupdrive/admin/payouts/:payoutId/process
 */
router.post(
  "/admin/payouts/:payoutId/process",
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payoutId = idSchema.parse(req.params.payoutId);

      const payout = await ZupDrivePaymentDriverService.processPayout(payoutId);
      await journaliser(req, "ZUPDRIVE_PROCESS_PAYOUT", payoutId, {
        chauffeurId: payout.chauffeurId,
        amountCentimes: payout.amount,
        batchId: payout.batchId,
      });

      return res.json({
        success: true,
        message: "Payout processing initiated",
        payout,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get all pending payouts
 * GET /api/zupdrive/admin/payouts/pending?limit=50
 */
router.get(
  "/admin/payouts/pending",
  ...adminLecture,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(z.coerce.number().int().min(1).default(50).parse(req.query.limit), 500);

      const payouts = await db.driverPayoutDrive.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: {
          id: true,
          chauffeurId: true,
          amountCentimes: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          chauffeur: {
            select: {
              nomComplet: true,
              user: { select: { email: true } },
            },
          },
        },
      });

      return res.json({
        success: true,
        payouts,
        count: payouts.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get payout history for a driver
 * GET /api/zupdrive/admin/driver/:chauffeurId/payouts
 */
router.get(
  "/admin/driver/:chauffeurId/payouts",
  ...adminLecture,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.chauffeurId);
      const limit = Math.min(z.coerce.number().int().min(1).default(20).parse(req.query.limit), 100);

      const history = await ZupDrivePaymentDriverService.getPayoutHistory(chauffeurId, limit);

      return res.json({
        success: true,
        payouts: history,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Financial dashboard
 * GET /api/zupdrive/admin/financial-dashboard
 */
router.get(
  "/admin/financial-dashboard",
  ...adminLecture,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Get platform-wide statistics
      const [totalPayouts, pendingPayouts, completedPayouts, totalPayout] = await Promise.all([
        db.driverPayoutDrive.count(),
        db.driverPayoutDrive.count({ where: { status: "PENDING" } }),
        db.driverPayoutDrive.count({ where: { status: "PROCESSED" } }),
        db.driverPayoutDrive.aggregate({
          _sum: { amountCentimes: true },
        }),
      ]);

      // Get course statistics
      const coursesStats = await db.courseDrive.groupBy({
        by: ["statut"],
        _count: true,
        _sum: {
          prixCentimes: true,
        },
      });

      return res.json({
        success: true,
        dashboard: {
          payouts: {
            total: totalPayouts,
            pending: pendingPayouts,
            completed: completedPayouts,
            totalAmount: totalPayout._sum?.amountCentimes ?? 0,
          },
          courses: coursesStats,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Update platform commission rate
 * POST /api/zupdrive/admin/settings/commission
 */
router.post(
  "/admin/settings/commission",
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        commissionPercentage: z.number().int().min(0).max(100),
      });

      const validated = schema.parse(req.body);

      const avant = await db.platformSettingsDrive.findUnique({
        where: { id: "default" },
        select: { commissionPercentage: true },
      });

      const settings = await db.platformSettingsDrive.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          commissionPercentage: validated.commissionPercentage,
        },
        update: {
          commissionPercentage: validated.commissionPercentage,
        },
      });

      await journaliser(req, "ZUPDRIVE_UPDATE_COMMISSION", "default", {
        avant: avant?.commissionPercentage ?? null,
        apres: validated.commissionPercentage,
      });

      return res.json({
        success: true,
        message: "Commission rate updated",
        settings,
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;

/**
 * PAYMENT FLOW EXPLAINED
 *
 * User Journey (Driver):
 * 1. Complete course
 * 2. Passenger pays via Stripe (asynchronous)
 * 3. Earnings accumulate in weekly pool
 * 4. GET /earnings → see pending/confirmed amounts
 * 5. POST /payouts/request → initiate weekly payout
 * 6. GET /payouts/history → track payment status
 * 7. Payout lands Friday via SEPA
 *
 * Admin Flow:
 * 1. GET /admin/payouts/pending → review queued payments
 * 2. POST /admin/payouts/:id/process → trigger Stripe transfer
 * 3. GET /admin/financial-dashboard → monitor platform revenue
 * 4. POST /admin/settings/commission → adjust commission%
 *
 * Payout Cycle:
 *
 * Monday 00:00 UTC:
 * ├─ Cycle closes (end of Sunday 23:59)
 * ├─ All courses from lun-sun are finalized
 * └─ Payout period: Mon-Sun
 *
 * Monday 06:00 UTC:
 * ├─ Calculate driver earnings
 * ├─ Deduct platform commission (25% default)
 * ├─ Create payout records
 * └─ Verify bank details present
 *
 * Monday 12:00 UTC:
 * ├─ Stripe Connect transfers initiated
 * ├─ Status: PROCESSING
 * └─ Drivers notified
 *
 * Tue-Thu:
 * └─ SEPA transfers in flight
 *
 * Friday:
 * ├─ Transfers arrive in bank accounts
 * └─ Status: COMPLETED
 *
 * ERROR HANDLING:
 * - Bank account invalid → FAILED
 * - Insufficient funds (platform) → DELAYED
 * - Stripe API down → RETRY daily
 * - Driver suspended → HELD
 */
