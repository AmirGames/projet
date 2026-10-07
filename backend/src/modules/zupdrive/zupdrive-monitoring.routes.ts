/**
 * Routes: Real-time Monitoring & Alerts
 *
 * Drivers: View notifications, metrics dashboard
 * Admin: Monitor platform health, alerts
 */

import { Router, Request, Response, NextFunction } from "express";
import { ZupDriveMonitoringService } from "./zupdrive-monitoring.service";
import { UnifiedRolesService } from "../auth/unified-roles.service";
import { db } from "../../services/db";

const router = Router();

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = token;
  next();
};

// ============================================================================
// DRIVER NOTIFICATION ENDPOINTS
// ============================================================================

/**
 * Get unread notifications for driver
 * GET /api/zupdrive/notifications?limit=20
 */
router.get(
  "/notifications",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "20"), 100);

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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notificationId = req.params.id || "";

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
  authenticate,
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

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayStats, weekStats] = await Promise.all([
        db.courseDrive.aggregate({
          where: {
            chauffeurId: chauffeur.id,
            statut: "COMPLETED",
            createdAt: { gte: today },
          },
          _sum: { prixTotal: true },
          _count: true,
        }),
        db.courseDrive.aggregate({
          where: {
            chauffeurId: chauffeur.id,
            statut: "COMPLETED",
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          _sum: { prixTotal: true },
          _count: true,
        }),
      ]);

      return res.json({
        success: true,
        earnings: {
          today: {
            amount: todayStats._sum.prixTotal || 0,
            courses: todayStats._count,
          },
          week: {
            amount: weekStats._sum.prixTotal || 0,
            courses: weekStats._count,
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
 * Subscribe to real-time updates (WebSocket upgrade)
 * GET /api/zupdrive/ws
 * Headers: Authorization: Bearer {token}
 */
router.get(
  "/ws",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // WebSocket upgrade handler
      res.json({
        success: true,
        message: "WebSocket endpoint - upgrade connection",
        wsUrl: `wss://${req.hostname}/api/zupdrive/ws?token=${req.headers.authorization?.split(" ")[1]}`,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ============================================================================
// ADMIN MONITORING ENDPOINTS
// ============================================================================

/**
 * Admin: Get real-time dashboard
 * GET /api/zupdrive/admin/dashboard
 */
router.get(
  "/admin/dashboard",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const chauffeurId = req.params.chauffeurId || "";
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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const alertType = (req.query.type as string) || "all";

      let whereClause: any = {};
      if (alertType === "compliance") {
        whereClause = { riskLevel: { in: ["HIGH", "CRITICAL"] } };
      } else if (alertType === "rating") {
        whereClause = { rating: { lt: 3.0 } };
      } else if (alertType === "suspension") {
        whereClause = { statut: "SUSPENDED" };
      }

      const alerts = await db.chauffeurDrive.findMany({
        where: whereClause,
        orderBy: { rating: "asc" },
        take: 50,
        select: {
          id: true,
          nomComplet: true,
          rating: true,
          statut: true,
          _count: {
            select: { courses: true, ratings: true },
          },
        },
      });

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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const criticalAlerts = await db.complianceReportDrive.findMany({
        where: {
          riskLevel: "CRITICAL",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          chauffeurId: true,
          overallScore: true,
          riskLevel: true,
          createdAt: true,
          chauffeur: {
            select: {
              nomComplet: true,
              email: true,
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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      // Find documents expiring within 30 days
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const expiringDocs = await db.documentChauffeurDrive.findMany({
        where: {
          statut: "APPROVED",
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
              email: true,
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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const failedPayouts = await db.driverPayoutDrive.findMany({
        where: {
          statut: "FAILED",
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          chauffeurId: true,
          montant: true,
          erreurMotif: true,
          createdAt: true,
          chauffeur: {
            select: {
              nomComplet: true,
              email: true,
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
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const [
        driverCount,
        activeCourses,
        suspendedCount,
        avgRating,
      ] = await Promise.all([
        db.chauffeurDrive.count({ where: { statut: "VALIDE" } }),
        db.courseDrive.count({ where: { statut: { in: ["ACCEPTED", "IN_PROGRESS"] } } }),
        db.chauffeurDrive.count({ where: { statut: "SUSPENDED" } }),
        db.chauffeurDrive.aggregate({
          _avg: { rating: true },
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
            averageRating: Math.round((avgRating._avg.rating || 0) * 100) / 100,
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
