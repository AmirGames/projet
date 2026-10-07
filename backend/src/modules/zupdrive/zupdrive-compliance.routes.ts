import { Router } from "express";
import { z } from "zod";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDriveComplianceService } from "./zupdrive-compliance.service";

const router = Router();

const historiqueAuditQuery = z.object({
  resourceId: z.string().optional(),
  resourceType: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(500).optional().default(100),
  offset: z.coerce.number().min(0).optional().default(0),
});

const documentsExpirantQuery = z.object({
  daysThreshold: z.coerce.number().min(1).optional().default(30),
});

const rapportsQuery = z.object({
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Audit Logs
 */

/**
 * POST /api/zupdrive/admin/compliance/audit-logs
 * Créer une entrée d'audit (utilisé automatiquement par les services)
 */
router.post(
  "/admin/audit-logs",
  ...adminAuth,
  validateRequest({
    body: z.object({
      action: z.string().min(3).max(200),
      actorId: z.string(),
      actorType: z.enum(["ADMIN", "SYSTEM", "DRIVER", "PASSAGER"]),
      resourceId: z.string(),
      resourceType: z.enum(["DRIVER", "DOCUMENT", "INFRACTION", "ALERT", "SETTING", "PAYMENT"]),
      oldValue: z.record(z.string(), z.unknown()).optional(),
      newValue: z.record(z.string(), z.unknown()).optional(),
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
  ...adminAuth,
  validateRequest({ query: historiqueAuditQuery }),
  async (req, res, next) => {
    try {
      const query = historiqueAuditQuery.parse(req.query);
      const filters = {
        ...query,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      };
      const result = await ZupDriveComplianceService.getAuditHistory(filters);
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      chauffeurId: z.string(),
      type: z.enum(["DOCUMENT_VALIDATION", "BACKGROUND_CHECK", "FINANCIAL_VERIFICATION", "PERIODIC_REVIEW"]),
      expiresAt: z.string().datetime(),
      notes: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const { expiresAt, ...data } = req.body;
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
 * GET /api/zupdrive/admin/compliance/checks/:chauffeurId
 * Récupérer les compliance checks d'un chauffeur
 */
router.get("/admin/checks/:chauffeurId", ...adminAuth, async (req, res, next) => {
  try {
    const chauffeurId = String(req.params.chauffeurId);
    const checks = await ZupDriveComplianceService.getDriverComplianceChecks(chauffeurId);
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
  ...adminAuth,
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
      const checkId = String(req.params.checkId);
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      chauffeurId: z.string(),
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
  ...adminAuth,
  validateRequest({
    body: z.object({
      status: z.enum(["UPLOADED", "UNDER_REVIEW", "APPROVED", "REJECTED", "EXPIRED"]),
      reviewedBy: z.string().optional(),
      rejectionReason: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const workflowId = String(req.params.workflowId);
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
  ...adminAuth,
  validateRequest({ query: documentsExpirantQuery }),
  async (req, res, next) => {
    try {
      const { daysThreshold } = documentsExpirantQuery.parse(req.query);
      const documents = await ZupDriveComplianceService.getExpiringDocuments(daysThreshold);
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
  ...adminAuth,
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
  ...adminAuth,
  validateRequest({ query: rapportsQuery }),
  async (req, res, next) => {
    try {
      const { limit, offset } = rapportsQuery.parse(req.query);
      const result = await ZupDriveComplianceService.getComplianceReports(limit, offset);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
