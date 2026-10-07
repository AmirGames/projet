import { Router } from "express";
import { z } from "zod";
import { journaliser } from "../superowner/shared";
import { adminAuthSection, validateRequest } from "./zupdrive-garde";
import { ZupDriveDriverManagementService } from "./zupdrive-driver-management.service";

const router = Router();

/** Dossiers chauffeurs : section « chauffeurs » de la plateforme DRIVE. */
const adminAuth = adminAuthSection("chauffeurs");

const idSchema = z.string().min(1).max(64);

const listQuery = z.object({
  status: z.enum(["BROUILLON", "SOUMIS", "VALIDE", "REFUSE", "SUSPENDU"]).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  region: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/zupdrive/admin/drivers
 * Lister tous les chauffeurs avec filtres
 */
router.get(
  "/drivers",
  ...adminAuth,
  validateRequest({ query: listQuery }),
  async (req, res, next) => {
    try {
      const { status, minRating, region, limit, offset } = listQuery.parse(req.query);
      const result = await ZupDriveDriverManagementService.listDrivers({
        status,
        minRating,
        region,
        limit,
        offset,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/drivers/:id/suspend
 * Suspendre un chauffeur
 */
router.post(
  "/drivers/:id/suspend",
  ...adminAuth,
  validateRequest({
    body: z.object({
      reason: z.string().min(5).max(500),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { reason } = req.body;

      await ZupDriveDriverManagementService.suspendDriver(id, reason);
      await journaliser(req, "ZUPDRIVE_SUSPEND_CHAUFFEUR", id, { apres: "SUSPENDU", motif: reason });
      res.json({ success: true, message: "Chauffeur suspendu" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/drivers/:id/reactivate
 * Réactiver un chauffeur suspendu
 */
router.post("/drivers/:id/reactivate", ...adminAuth, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    await ZupDriveDriverManagementService.reactivateDriver(id);
    await journaliser(req, "ZUPDRIVE_REACTIVATE_CHAUFFEUR", id, { avant: "SUSPENDU", apres: "VALIDE" });
    res.json({ success: true, message: "Chauffeur réactivé" });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/zupdrive/admin/drivers/:id/validate-document
 * Valider un document du chauffeur
 */
router.post(
  "/drivers/:id/validate-document",
  ...adminAuth,
  validateRequest({
    body: z.object({
      type: z.enum(["PERMIS", "ASSURANCE", "INSPECTION", "IDENTITE"]),
      expiresAt: z.string().datetime(),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { type, expiresAt } = req.body;

      await ZupDriveDriverManagementService.validateDocument(
        id,
        type,
        new Date(expiresAt)
      );
      await journaliser(req, "ZUPDRIVE_VALIDATE_CHAUFFEUR_DOCUMENT", id, { type, expiresAt });

      res.json({ success: true, message: "Document validé" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/drivers/:id/infractions
 * Récupérer l'historique des infractions
 */
router.get("/drivers/:id/infractions", ...adminAuth, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const infractions = await ZupDriveDriverManagementService.getDriverInfractions(id);
    res.json(infractions);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/zupdrive/admin/drivers/:id/report-infraction
 * Signaler une infraction/plainte
 */
router.post(
  "/drivers/:id/report-infraction",
  ...adminAuth,
  validateRequest({
    body: z.object({
      type: z.enum(["PLAINTE_PASSAGER", "ACCIDENT", "INFRACTION_CODE_ROUTE", "AUTRE"]),
      description: z.string().min(10).max(1000),
      severity: z.enum(["BASSE", "MOYENNE", "HAUTE"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { type, description, severity } = req.body;

      const infractionId = await ZupDriveDriverManagementService.reportInfraction(
        id,
        type,
        description,
        severity
      );
      await journaliser(req, "ZUPDRIVE_REPORT_INFRACTION", id, { infractionId, type, severity, suspensionAutomatique: severity === "HAUTE" });

      res.json({
        success: true,
        infractionId,
        message: "Infraction signalée",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/zupdrive/admin/infractions/:id/resolve
 * Résoudre une infraction
 */
router.post(
  "/infractions/:id/resolve",
  ...adminAuth,
  validateRequest({
    body: z.object({
      resolution: z.string().min(10).max(1000),
    }),
  }),
  async (req, res, next) => {
    try {
      const id = idSchema.parse(req.params.id);
      const { resolution } = req.body;

      await ZupDriveDriverManagementService.resolveInfraction(id, resolution);
      await journaliser(req, "ZUPDRIVE_RESOLVE_INFRACTION", id, { resolution });
      res.json({ success: true, message: "Infraction résolue" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/drivers/:id/stats
 * Statistiques détaillées d'un chauffeur
 */
router.get("/drivers/:id/stats", ...adminAuth, async (req, res, next) => {
  try {
    const id = idSchema.parse(req.params.id);

    const stats = await ZupDriveDriverManagementService.getDriverStats(id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
