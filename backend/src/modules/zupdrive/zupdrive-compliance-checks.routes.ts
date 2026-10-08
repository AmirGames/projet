/**
 * Routes: Automated Compliance Checks
 *
 * Admin: Trigger compliance checks, view reports
 */

import { Router, Request, Response, NextFunction } from "express";
import { ZupDriveComplianceChecksService } from "./zupdrive-compliance-checks.service";
import { z } from "zod";
import { ZupDriveComplianceLectureService } from "./zupdrive-compliance-lecture.service";
import { journaliser } from "../superowner/shared";
import { adminAuthSection } from "./zupdrive-garde";

const router = Router();

/** Contrôles de conformité : section « chauffeurs » de la plateforme DRIVE (permission, pas un rôle codé en dur). */
const adminAuth = adminAuthSection("chauffeurs");

const idSchema = z.string().min(1).max(64);
const historiqueQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });
const exportQuery = z.object({ format: z.enum(["json", "pdf"]).default("json") });

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * Admin lance les vérifications de conformité pour un chauffeur
 * POST /api/zupdrive/admin/compliance/:chauffeurId/run-checks
 */
router.post(
  "/admin/compliance/:chauffeurId/run-checks",
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.chauffeurId);

      const report = await ZupDriveComplianceChecksService.runFullCompliance(
        chauffeurId
      );

      // Le rapport est enregistré : trace de qui l'a demandé. La décision automatique
      // du rapport est une recommandation, elle ne modifie pas le dossier du chauffeur.
      await journaliser(req, "ZUPDRIVE_RUN_COMPLIANCE_CHECKS", chauffeurId, {
        riskLevel: report.overallRiskLevel,
        riskScore: report.overallRiskScore,
        autoDecision: report.autoDecision,
      });

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
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.chauffeurId);

      const report = await ZupDriveComplianceLectureService.dernierRapport(chauffeurId);

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
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const chauffeurId = idSchema.parse(req.params.chauffeurId);
      const { limit } = historiqueQuery.parse(req.query);

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
  ...adminAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const flagged = await ZupDriveComplianceLectureService.dossiersSignales();

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
  ...adminAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json({
        success: true,
        dashboard: await ZupDriveComplianceLectureService.tableauDeBord(),
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
  ...adminAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = idSchema.parse(req.params.reportId);
      const { format } = exportQuery.parse(req.query);

      const report = await ZupDriveComplianceLectureService.rapportPourExport(reportId);

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      if (format === "json") {
        return res.json({
          success: true,
          report,
        });
      }

      // format === "pdf" (le seul autre format accepté par exportQuery)
      return res.status(501).json({ error: "PDF export not yet implemented" });
    } catch (error) {
      return next(error);
    }
  }
);

export default router;
