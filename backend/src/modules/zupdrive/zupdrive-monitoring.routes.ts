/**
 * Routes: Real-time Monitoring & Alerts
 *
 * Drivers: View notifications, metrics dashboard
 * Admin: Monitor platform health, alerts
 */

import type { Prisma } from "@prisma/client";
import { Router, Request, Response, NextFunction } from "express";
import { ZupDriveMonitoringService } from "./zupdrive-monitoring.service";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { db } from "../../services/db";
import { adminAuthSection } from "./zupdrive-garde";

const router = Router();

/** Administration : la permission de l'équipe (section de la plateforme DRIVE), pas un rôle codé en dur. */
const adminCourses = adminAuthSection("courses-drive");
const adminChauffeurs = adminAuthSection("chauffeurs");

const limiteQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const alertesQuery = z.object({ type: z.enum(["all", "compliance", "rating", "suspension"]).default("all") });
const idSchema = z.string().min(1).max(64);

// ============================================================================
// DRIVER NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * Get unread notifications for driver
 * GET /api/zupdrive/notifications?limit=20
 */
router.get(
  "/notifications",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit } = limiteQuery.parse(req.query);

      const notifications = await ZupDriveMonitoringService.getUnreadNotifications(
        req.userId!,
        limit
      );

      const stats = await ZupDriveMonitoringService.getNotificationStats(req.userId!);

      return res.json({
        success: true,
        notifications,
        stats,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Mark notification as read
 * POST /api/zupdrive/notifications/:id/read
 */
router.post(
  "/notifications/:id/read",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = idSchema.parse(req.params.id);

      await ZupDriveMonitoringService.markAsRead(notificationId, req.userId!);

      return res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Mark all notifications as read
 * POST /api/zupdrive/notifications/mark-all-read
 */
router.post(
  "/notifications/mark-all-read",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await ZupDriveMonitoringService.markAllAsRead(req.userId!);

      return res.json({
        success: true,
        message: "All notifications marked as read",
        count,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Get driver metrics dashboard
 * GET /api/zupdrive/metrics
 */
router.get(
  "/metrics",
  authMiddleware,
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

      const metrics = await ZupDriveMonitoringService.getDriverMetrics(chauffeur.id);

      return res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Get real-time earnings
 * GET /api/zupdrive/earnings-realtime
 */
router.get(
  "/earnings-realtime",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeur = await db.chauffeurDrive.findUnique({
        where: { userId: req.userId! },
        select: { id: true },
      });

      if (!chauffeur) {
        return res.status(404).json({ error: "Driver profile not found" });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayStats, weekStats] = await Promise.all([
        ZupDriveMonitoringService.getGainsChauffeur(chauffeur.id, today),
        ZupDriveMonitoringService.getGainsChauffeur(
          chauffeur.id,
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        ),
      ]);

      return res.json({
        success: true,
        earnings: {
          today: {
            amount: todayStats.gainsCentimes,
            courses: todayStats.nombreCourses,
          },
          week: {
            amount: weekStats.gainsCentimes,
            courses: weekStats.nombreCourses,
          },
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get real-time dashboard
 * GET /api/zupdrive/admin/dashboard
 */
router.get(
  "/admin/dashboard",
  ...adminCourses,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dashboard = await ZupDriveMonitoringService.getAdminDashboard();

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
 * Admin: Get driver metrics (for admin monitoring)
 * GET /api/zupdrive/admin/driver/:chauffeurId/metrics
 */
router.get(
  "/admin/driver/:chauffeurId/metrics",
  ...adminCourses,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.chauffeurId);
      const metrics = await ZupDriveMonitoringService.getDriverMetrics(chauffeurId);

      return res.json({
        success: true,
        metrics,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get all high-risk drivers
 * GET /api/zupdrive/admin/alerts?type=compliance
 */
router.get(
  "/admin/alerts",
  ...adminChauffeurs,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type: alertType } = alertesQuery.parse(req.query);

      let whereClause: Prisma.ChauffeurDriveWhereInput = {};
      if (alertType === "compliance") {
        whereClause = {
          complianceReports: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
        };
      } else if (alertType === "rating") {
        const faibles = await db.noteCourseDrive.groupBy({
          by: ["chauffeurId"],
          where: { auteur: "PASSAGER" },
          _avg: { note: true },
          having: { note: { _avg: { lt: 3.0 } } },
        });
        whereClause = { id: { in: faibles.map((f) => f.chauffeurId) } };
      } else if (alertType === "suspension") {
        whereClause = { statut: "SUSPENDU" };
      }

      const chauffeurs = await db.chauffeurDrive.findMany({
        where: whereClause,
        take: 50,
        select: {
          id: true,
          nomComplet: true,
          statut: true,
          _count: {
            select: { courses: true, notes: true },
          },
        },
      });

      // Note moyenne des passagers (NoteCourseDrive), triée de la plus basse à la plus haute
      const moyennes = await db.noteCourseDrive.groupBy({
        by: ["chauffeurId"],
        where: { auteur: "PASSAGER", chauffeurId: { in: chauffeurs.map((c) => c.id) } },
        _avg: { note: true },
      });
      const moyenneParChauffeur = new Map(moyennes.map((m) => [m.chauffeurId, m._avg.note]));
      const alerts = chauffeurs
        .map((c) => ({ ...c, rating: moyenneParChauffeur.get(c.id) ?? null }))
        .sort((x, y) => (x.rating ?? Infinity) - (y.rating ?? Infinity));

      return res.json({
        success: true,
        alertType,
        count: alerts.length,
        drivers: alerts,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get compliance alerts
 * GET /api/zupdrive/admin/compliance-alerts
 */
router.get(
  "/admin/compliance-alerts",
  ...adminChauffeurs,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const criticalAlerts = await db.complianceReportDrive.findMany({
        where: {
          riskLevel: "CRITICAL",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          chauffeurId: true,
          complianceScore: true,
          riskLevel: true,
          createdAt: true,
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
        criticalAlerts,
        count: criticalAlerts.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get document expiration alerts
 * GET /api/zupdrive/admin/document-expiration-alerts
 */
router.get(
  "/admin/document-expiration-alerts",
  ...adminChauffeurs,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Find documents expiring within 30 days
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const expiringDocs = await db.documentChauffeurDrive.findMany({
        where: {
          statut: "APPROVED",
          archiveeLe: null,
          dateExpiration: {
            lte: thirtyDaysFromNow,
            gte: new Date(),
          },
        },
        orderBy: { dateExpiration: "asc" },
        take: 50,
        select: {
          id: true,
          type: true,
          dateExpiration: true,
          chauffeurId: true,
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
        expiringDocuments: expiringDocs,
        count: expiringDocs.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Get payout failure alerts
 * GET /api/zupdrive/admin/payout-failure-alerts
 */
router.get(
  "/admin/payout-failure-alerts",
  ...adminCourses,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const failedPayouts = await db.driverPayoutDrive.findMany({
        where: {
          status: "FAILED",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          chauffeurId: true,
          amountCentimes: true,
          failureReason: true,
          createdAt: true,
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
        failedPayouts,
        count: failedPayouts.length,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin: Platform health check
 * GET /api/zupdrive/admin/health
 */
router.get(
  "/admin/health",
  ...adminCourses,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        driverCount,
        activeCourses,
        suspendedCount,
        avgRating,
      ] = await Promise.all([
        db.chauffeurDrive.count({ where: { statut: "VALIDE" } }),
        db.courseDrive.count({ where: { statut: { in: ["ACCEPTEE", "ARRIVEE", "EN_COURS"] } } }),
        db.chauffeurDrive.count({ where: { statut: "SUSPENDU" } }),
        db.noteCourseDrive.aggregate({
          where: { auteur: "PASSAGER" },
          _avg: { note: true },
        }),
      ]);

      return res.json({
        success: true,
        health: {
          drivers: {
            active: driverCount,
            suspended: suspendedCount,
          },
          courses: {
            active: activeCourses,
          },
          quality: {
            averageRating: Math.round((avgRating._avg.note || 0) * 100) / 100,
          },
          status: "OPERATIONAL",
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;

/**
 * REAL-TIME MONITORING FLOW
 *
 * Event Triggers:
 * 1. Course completed
 *    └─ Emit: COURSE_COMPLETED
 *       → Update metrics
 *       → Send notification
 *       → WebSocket broadcast
 *
 * 2. Rating received
 *    └─ Emit: RATING_RECEIVED
 *       → Calculate reputation
 *       → Check for badge
 *       → Alert if significant change
 *
 * 3. Payout status change
 *    └─ Emit: PAYOUT_*
 *       → Update driver metrics
 *       → Send appropriate notification
 *       → Log for admin
 *
 * 4. Document expires
 *    └─ Emit: DOCUMENT_EXPIRING
 *       → Notify driver (10 days before)
 *       → Alert admin (5 days before)
 *
 * NOTIFICATION CHANNELS
 *
 * Priority: LOW → WebSocket only
 * Priority: MEDIUM → Push + WebSocket
 * Priority: HIGH → Push + Email + WebSocket
 * Priority: CRITICAL → Push + Email + SMS + WebSocket
 */
