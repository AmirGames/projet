import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { ZupDriveAdminDashboardService } from "./zupdrive-admin-dashboard.service";

/**
 * /api/zupdrive/admin/dashboard — Dashboard d'administration ZupDrive.
 *
 * Supervision complète :
 * - Métriques temps réel
 * - Gestion des paiements SEPA
 * - Suivi des courses
 * - Alertes et anomalies
 */

const router = Router();

// Middleware d'authentification admin (à adapter selon votre système de rôles)
router.use(authMiddleware);

// GET /api/zupdrive/admin/dashboard/metrics
// Métriques du dashboard
router.get("/metrics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({ region: z.string().optional() }).parse(req.query);
    const metrics = await ZupDriveAdminDashboardService.getDashboardMetrics(query.region);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/dashboard/payouts
// Gestion des lots SEPA
router.get("/payouts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z.object({ limit: z.string().optional(), offset: z.string().optional() }).parse(req.query);
    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const offset = parseInt(query.offset || "0");

    const result = await ZupDriveAdminDashboardService.getPayoutBatches(limit, offset);

    res.json({
      success: true,
      data: result.batches,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/dashboard/courses
// Listes des courses avec filtres
router.get("/courses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = z
      .object({
        region: z.string().optional(),
        status: z.string().optional(),
        driverId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.string().optional(),
        offset: z.string().optional(),
      })
      .parse(req.query);

    const limit = Math.min(parseInt(query.limit || "50"), 100);
    const offset = parseInt(query.offset || "0");

    const filters = {
      region: query.region,
      status: query.status,
      driverId: query.driverId,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    const result = await ZupDriveAdminDashboardService.getCoursesList(filters, limit, offset);

    res.json({
      success: true,
      data: result.courses,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/dashboard/drivers/:driverId
// Stats détaillées d'un chauffeur
router.get("/drivers/:driverId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { driverId } = z.object({ driverId: z.string() }).parse(req.params);
    const stats = await ZupDriveAdminDashboardService.getDriverStats(driverId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/zupdrive/admin/dashboard/alerts
// Alertes et anomalies
router.get("/alerts", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = await ZupDriveAdminDashboardService.getAlerts();

    res.json({
      success: true,
      data: alerts,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
