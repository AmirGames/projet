import { Router } from "express";
import { z } from "zod";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDriveDriverManagementService } from "./zupdrive-driver-management.service";
import { ApiError } from "../../middleware/api-error";

const router = Router();

/**
 * GET /api/zupdrive/admin/drivers
 * Lister tous les chauffeurs avec filtres
 */
router.get(
  "/drivers",
  ...adminAuth,
  validateRequest({
    query: z.object({
      status: z.enum(["VALIDE", "SUSPENDU", "EN_ATTENTE_VALIDATION"]).optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
      region: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).optional().default("50"),
      offset: z.coerce.number().min(0).optional().default("0"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { status, minRating, region, limit, offset } = req.query as any;
      const result = await ZupDriveDriverManagementService.listDrivers({
        status,
        minRating,
        region,
        limit: parseInt(limit),
        offset: parseInt(offset),
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
      const { id } = req.params;
      const { reason } = req.body;

      await ZupDriveDriverManagementService.suspendDriver(id, reason);
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
router.post("/drivers/:id/reactivate", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    await ZupDriveDriverManagementService.reactivateDriver(id);
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
      const { id } = req.params;
      const { type, expiresAt } = req.body;

      await ZupDriveDriverManagementService.validateDocument(
        id,
        type,
        new Date(expiresAt)
      );

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
router.get("/drivers/:id/infractions", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

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
      const { id } = req.params;
      const { type, description, severity } = req.body;

      const infractionId = await ZupDriveDriverManagementService.reportInfraction(
        id,
        type,
        description,
        severity
      );

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
      const { id } = req.params;
      const { resolution } = req.body;

      await ZupDriveDriverManagementService.resolveInfraction(id, resolution);
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
router.get("/drivers/:id/stats", adminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const stats = await ZupDriveDriverManagementService.getDriverStats(id);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
