import { Router } from "express";
import { z } from "zod";
import { journaliser } from "../superowner/shared";
import { adminAuthSection, validateRequest } from "./zupdrive-garde";
import { ZupDriveComplianceService } from "./zupdrive-compliance.service";

const router = Router();

/** Conformité des dossiers chauffeurs : section « chauffeurs » de la plateforme DRIVE. */
const adminAuth = adminAuthSection("chauffeurs");

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

/*
 * Pas de POST /admin/audit-logs : l'acteur venait du corps, n'importe quel membre de
 * l'équipe pouvait donc écrire une entrée au nom d'un autre. Les actions d'administration
 * s'écrivent par journaliser() (SystemAuditLog), avec l'identité du jeton.
 */

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
      await journaliser(req, "ZUPDRIVE_CREATE_COMPLIANCE_CHECK", check.id, { chauffeurId: data.chauffeurId, type: data.type });
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
      notes: z.string().optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const checkId = String(req.params.checkId);
      const { status, findings, notes } = req.body;
      // Qui a clos le contrôle : le compte du jeton, jamais une valeur du corps.
      await ZupDriveComplianceService.updateComplianceCheckStatus(checkId, status, findings, req.userId, notes);
      await journaliser(req, "ZUPDRIVE_UPDATE_COMPLIANCE_CHECK", checkId, { apres: status, findings });
      res.json({ success: true, message: "Compliance check mis à jour" });
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
    }),
  }),
  async (req, res, next) => {
    try {
      const report = await ZupDriveComplianceService.generateComplianceReport({
        reportType: req.body.reportType,
        generatedBy: req.userId as string,
      });
      await journaliser(req, "ZUPDRIVE_GENERATE_COMPLIANCE_REPORT", report.id, { reportType: req.body.reportType });
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
