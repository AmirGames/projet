import { Router } from "express";
import { z } from "zod";
import { validateRequest } from "../../middleware/validation";
import { adminAuth } from "../../middleware/auth";
import { ZupDriveComplianceService } from "./zupdrive-compliance.service";

const router = Router();

/**
 * Audit Logs
 */

/**
 * POST /api/zupdrive/admin/compliance/audit-logs
 * Créer une entrée d'audit (utilisé automatiquement par les services)
 */
router.post(
  "/admin/audit-logs",
  adminAuth,
  validateRequest({
    body: z.object({
      action: z.string().min(3).max(200),
      actorId: z.string(),
      actorType: z.enum(["ADMIN", "SYSTEM", "DRIVER", "PASSAGER"]),
      resourceId: z.string(),
      resourceType: z.enum(["DRIVER", "DOCUMENT", "INFRACTION", "ALERT", "SETTING", "PAYMENT"]),
      oldValue: z.record(z.any()).optional(),
      newValue: z.record(z.any()).optional(),
      reason: z.string().optional(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const log = await ZupDriveComplianceService.logAction(req.body);
      res.status(201).json(log);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/compliance/audit-logs
 * Récupérer l'historique d'audit avec filtres
 */
router.get(
  "/admin/audit-logs",
  adminAuth,
  validateRequest({
    query: z.object({
      resourceId: z.string().optional(),
      resourceType: z.string().optional(),
      actorId: z.string().optional(),
      action: z.string().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      limit: z.coerce.number().min(1).max(500).optional().default("100"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const filters = {
        ...req.query,
        startDate: req.query.startDate ? new Date(req.query.startDate) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate) : undefined,
      };
      const result = await ZupDriveComplianceService.getAuditHistory(filters as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Compliance Checks
 */

/**
 * POST /api/zupdrive/admin/compliance/checks
 * Créer un compliance check
 */
router.post(
  "/admin/checks",
  adminAuth,
  validateRequest({
    body: z.object({
      driverId: z.string(),
      type: z.enum(["DOCUMENT_VALIDATION", "BACKGROUND_CHECK", "FINANCIAL_VERIFICATION", "PERIODIC_REVIEW"]),
      expiresAt: z.string().datetime(),
      notes: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { expiresAt, ...data } = req.body as any;
      const check = await ZupDriveComplianceService.createComplianceCheck({
        ...data,
        expiresAt: new Date(expiresAt),
      });
      res.status(201).json(check);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/compliance/checks/:driverId
 * Récupérer les compliance checks d'un driver
 */
router.get("/admin/checks/:driverId", adminAuth, async (req, res, next) => {
  try {
    const { driverId } = req.params;
    const checks = await ZupDriveComplianceService.getDriverComplianceChecks(driverId);
    res.json(checks);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/zupdrive/admin/compliance/checks/:checkId
 * Mettre à jour le statut d'un compliance check
 */
router.patch(
  "/admin/checks/:checkId",
  adminAuth,
  validateRequest({
    body: z.object({
      status: z.enum(["IN_PROGRESS", "PASSED", "FAILED", "MANUAL_REVIEW_NEEDED"]),
      findings: z.array(z.string()).optional(),
      completedBy: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { checkId } = req.params;
      const { status, findings, completedBy, notes } = req.body;
      await ZupDriveComplianceService.updateComplianceCheckStatus(checkId, status, findings, completedBy, notes);
      res.json({ success: true, message: "Compliance check mis à jour" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Document Verification Workflows
 */

/**
 * POST /api/zupdrive/admin/compliance/document-verification
 * Initier un workflow de vérification de document
 */
router.post(
  "/admin/document-verification",
  adminAuth,
  validateRequest({
    body: z.object({
      driverId: z.string(),
      documentType: z.enum(["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const workflow = await ZupDriveComplianceService.initiateDocumentVerification(req.body);
      res.status(201).json(workflow);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/zupdrive/admin/compliance/document-verification/:workflowId
 * Mettre à jour le statut d'un workflow de vérification
 */
router.patch(
  "/admin/document-verification/:workflowId",
  adminAuth,
  validateRequest({
    body: z.object({
      status: z.enum(["UPLOADED", "UNDER_REVIEW", "APPROVED", "REJECTED", "EXPIRED"]),
      reviewedBy: z.string().optional(),
      rejectionReason: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { workflowId } = req.params;
      const { status, reviewedBy, rejectionReason } = req.body;
      await ZupDriveComplianceService.updateDocumentVerificationStatus(
        workflowId,
        status,
        reviewedBy,
        rejectionReason
      );
      res.json({ success: true, message: "Document verification mis à jour" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/compliance/expiring-documents
 * Récupérer les documents bientôt expirés
 */
router.get(
  "/admin/expiring-documents",
  adminAuth,
  validateRequest({
    query: z.object({
      daysThreshold: z.coerce.number().min(1).optional().default("30"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { daysThreshold } = req.query as any;
      const documents = await ZupDriveComplianceService.getExpiringDocuments(parseInt(daysThreshold));
      res.json(documents);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Compliance Reports
 */

/**
 * POST /api/zupdrive/admin/compliance/reports
 * Générer un compliance report
 */
router.post(
  "/admin/reports",
  adminAuth,
  validateRequest({
    body: z.object({
      reportType: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "AD_HOC"]),
      generatedBy: z.string(),
    }),
  }),
  async (req, res, next) => {
    try {
      const report = await ZupDriveComplianceService.generateComplianceReport(req.body);
      res.status(201).json(report);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/compliance/reports
 * Récupérer les compliance reports
 */
router.get(
  "/admin/reports",
  adminAuth,
  validateRequest({
    query: z.object({
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.query as any;
      const result = await ZupDriveComplianceService.getComplianceReports(parseInt(limit), parseInt(offset));
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
