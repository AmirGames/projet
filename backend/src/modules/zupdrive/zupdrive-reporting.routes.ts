import { Router } from "express";
import { z } from "zod";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDriveReportingService } from "./zupdrive-reporting.service";

const router = Router();

/**
 * Driver Performance Reports
 */

/**
 * POST /api/zupdrive/admin/reports/driver-performance
 * Générer un rapport de performance driver
 */
router.post(
  "/admin/driver-performance",
  ...adminAuth,
  validateRequest({
    body: z.object({
      driverId: z.string(),
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate, ...data } = req.body as any;
      const report = await ZupDriveReportingService.generateDriverPerformanceReport({
        ...data,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Financial Reports
 */

/**
 * POST /api/zupdrive/admin/reports/financial
 * Générer un rapport financier
 */
router.post(
  "/admin/financial",
  ...adminAuth,
  validateRequest({
    body: z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.body as any;
      const report = await ZupDriveReportingService.generateFinancialReport({
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Compliance Reports
 */

/**
 * POST /api/zupdrive/admin/reports/compliance
 * Générer un rapport de compliance
 */
router.post(
  "/admin/compliance",
  ...adminAuth,
  validateRequest({
    body: z.object({
      includeRecommendations: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const report = await ZupDriveReportingService.generateComplianceReport(req.body);
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Scheduled Reports
 */

/**
 * POST /api/zupdrive/admin/reports/scheduled
 * Créer un rapport programmé
 */
router.post(
  "/admin/scheduled",
  ...adminAuth,
  validateRequest({
    body: z.object({
      name: z.string().min(3).max(200),
      reportType: z.enum(["DRIVER_PERFORMANCE", "FINANCIAL", "COMPLIANCE", "CUSTOM"]),
      frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]),
      recipients: z.array(z.string().email()),
      format: z.enum(["PDF", "EXCEL", "JSON"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const report = await ZupDriveReportingService.createScheduledReport(req.body);
      res.status(201).json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/reports/scheduled
 * Lister les rapports programmés
 */
router.get(
  "/admin/scheduled",
  ...adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.coerce.boolean().optional().default("true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as any;
      const reports = await ZupDriveReportingService.listScheduledReports(activeOnly === "true");
      res.json(reports);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/zupdrive/admin/reports/scheduled/:reportId
 * Mettre à jour un rapport programmé
 */
router.patch(
  "/admin/scheduled/:reportId",
  ...adminAuth,
  validateRequest({
    body: z.object({
      name: z.string().min(3).max(200).optional(),
      frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]).optional(),
      recipients: z.array(z.string().email()).optional(),
      active: z.boolean().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { reportId } = req.params;
      await ZupDriveReportingService.updateScheduledReport(reportId, req.body);
      res.json({ success: true, message: "Rapport mis à jour" });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
