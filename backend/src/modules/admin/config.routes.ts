import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { userIdRequis } from "../auth/utilisateur-requis";
import { journaliser } from "../superowner/shared";
import { SystemConfigService } from "../superowner/system-config.service";
import { invalidateMaintenanceCache } from "../monitoring/maintenance.middleware";
import { isSystemAdmin } from "./shared";

const router = Router();

// GET /admin/config - Get system configuration
router.get("/config", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await SystemConfigService.lireOuCreer());
  } catch (err) {
    next(err);
  }
});

// PUT /admin/config - Update system configuration
router.put("/config", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      minOrderAmount: z.number().optional(),
      maxOrderAmount: z.number().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      selectedTheme: z.string().optional(),
      // Attribution des courses aux livreurs
      driverBaseFee: z.number().min(0).optional(),
      driverPerKmFee: z.number().min(0).optional(),
      driverOfferSeconds: z.number().int().min(10).max(600).optional(),
      driverMaxRadiusKm: z.number().min(1).max(50).optional(),
    });

    const body = schema.parse(req.body);
    userIdRequis(req); // identité exigée avant d'agir (le journal la relit)

    const updated = await SystemConfigService.mettreAJour(body);

    // Le middleware met le réglage en cache : forcer sa relecture.
    invalidateMaintenanceCache();

    await journaliser(req, "UPDATE_SYSTEM_CONFIG", "SYSTEM_CONFIG", body);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
