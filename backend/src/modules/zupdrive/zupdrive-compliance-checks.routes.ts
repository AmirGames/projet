/**
 * Routes: Automated Compliance Checks
 *
 * Admin: Trigger compliance checks, view reports
 */

import { Router, Request, Response, NextFunction } from "express";
import { ZupDriveComplianceChecksService } from "./zupdrive-compliance-checks.service";
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
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Admin lance les vérifications de conformité pour un chauffeur
 * POST /api/zupdrive/admin/compliance/:chauffeurId/run-checks
 */
router.post(
  "/admin/compliance/:chauffeurId/run-checks",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const report = await ZupDriveComplianceChecksService.runFullCompliance(
        chauffeurId
      );

      return res.json({
        success: true,
        message: "Compliance checks completed",
        report,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin consulte le dernier rapport de conformité
 * GET /api/zupdrive/admin/compliance/:chauffeurId/latest
 */
router.get(
  "/admin/compliance/:chauffeurId/latest",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const report = await db.complianceReport.findFirst({
        where: { chauffeurId },
        orderBy: { createdAt: "desc" },
      });

      if (!report) {
        return res.status(404).json({ error: "No compliance report found" });
      }

      return res.json({
        success: true,
        report,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Admin consulte l'historique des rapports de conformité
 * GET /api/zupdrive/admin/compliance/:chauffeurId/history?limit=10
 */
router.get(
  "/admin/compliance/:chauffeurId/history",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = (req.params.chauffeurId as string) || "";
      const limit = Math.min(parseInt((req.query.limit as string) || "10"), 50);

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const reports = await ZupDriveComplianceChecksService.getPreviousReports(
        chauffeurId,
        limit
      );

      return res.json({
        success: true,
        count: reports.length,
        reports,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Lister tous les dossiers signalés (HIGH/CRITICAL risk)
 * GET /api/zupdrive/admin/compliance/flagged-for-review
 */
router.get(
  "/admin/compliance/flagged-for-review",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const flagged = await db.complianceReport.findMany({
        where: {
          flaggedForReview: true,
          riskLevel: { in: ["HIGH", "CRITICAL"] },
        },
        orderBy: { riskScore: "desc" },
        take: 50,
        select: {
          id: true,
          chauffeurId: true,
          riskScore: true,
          riskLevel: true,
          autoDecision: true,
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
        count: flagged.length,
        flaggedCases: flagged,
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Dashboard: Vue d'ensemble de la conformité
 * GET /api/zupdrive/admin/compliance/dashboard
 */
router.get(
  "/admin/compliance/dashboard",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const [total, critical, high, medium, low, flagged, recent] = await Promise.all([
        db.complianceReport.count(),
        db.complianceReport.count({ where: { riskLevel: "CRITICAL" } }),
        db.complianceReport.count({ where: { riskLevel: "HIGH" } }),
        db.complianceReport.count({ where: { riskLevel: "MEDIUM" } }),
        db.complianceReport.count({ where: { riskLevel: "LOW" } }),
        db.complianceReport.count({ where: { flaggedForReview: true } }),
        db.complianceReport.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            chauffeurId: true,
            riskScore: true,
            riskLevel: true,
            createdAt: true,
          },
        }),
      ]);

      const avgRiskScore = await db.complianceReport.aggregate({
        _avg: { riskScore: true },
      });

      return res.json({
        success: true,
        dashboard: {
          totalReports: total,
          riskDistribution: {
            critical,
            high,
            medium,
            low,
          },
          flaggedForReview: flagged,
          averageRiskScore: Math.round(avgRiskScore._avg.riskScore || 0),
          recentReports: recent,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * Export rapport de conformité (PDF/JSON)
 * GET /api/zupdrive/admin/compliance/:reportId/export?format=json|pdf
 */
router.get(
  "/admin/compliance/:reportId/export",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = (req.params.reportId as string) || "";
      const format = (req.query.format as string) || "json";

      // Vérifier que c'est admin
      const adminContext = await UnifiedRolesService.loadUserRoleContext(req.userId!);
      if (!adminContext.roles.includes("ADMIN_ZUPDRIVE")) {
        return res.status(403).json({ error: "Admin only" });
      }

      const report = await db.complianceReport.findUnique({
        where: { id: reportId },
        include: {
          chauffeur: {
            select: {
              nomComplet: true,
              region: true,
              user: { select: { email: true } },
            },
          },
        },
      });

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (format === "json") {
        return res.json({
          success: true,
          report,
        });
      }

      if (format === "pdf") {
        // TODO: Generate PDF report
        return res.status(501).json({ error: "PDF export not yet implemented" });
      }

      return res.status(400).json({ error: "Invalid format" });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
