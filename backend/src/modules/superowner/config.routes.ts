import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../auth/auth.middleware";
import { invalidateMaintenanceCache } from "../monitoring/maintenance.middleware";
import { isSuperOwner, journaliser } from "./shared";
import { SystemConfigService } from "./system-config.service";

const router = Router();

// GET /superowner/system-config - System configuration
router.get("/system-config", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ config: await SystemConfigService.etatDuSysteme() });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/system-config - Modifier la configuration de la plateforme
router.put("/system-config", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      minOrderAmount: z.number().min(0).optional(),
      maxOrderAmount: z.number().min(0).optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      // Attribution des courses aux livreurs
      driverMaxRadiusKm: z.number().min(1).max(50).optional(),
      // Distance de livraison maximale selon le véhicule (jamais au-delà du
      // rayon ci-dessus), et délai avant d'ouvrir une course sans preneur aux
      // véhicules hors limite.
      driverBikeMaxKm: z.number().min(0.5).max(50).optional(),
      driverScooterMaxKm: z.number().min(0.5).max(50).optional(),
      driverExceptionSeconds: z.number().int().min(0).max(3600).optional(),
      // Livreur « bientôt libre » : à moins de ce rayon du client, ou de ce délai
      // de la fin de l'attente à la porte, on lui propose la course suivante.
      // 0 et 0 : jamais.
      driverSoonFreeKm: z.number().min(0).max(10).optional(),
      driverSoonFreeSeconds: z.number().int().min(0).max(360).optional(),
      driverOfferSeconds: z.number().int().min(10).max(600).optional(),
      // Plusieurs courses à la fois : combien au plus (1 = jamais), clients
      // « au même endroit », détour accepté.
      driverMaxCourses: z.number().int().min(1).max(5).optional(),
      driverGroupClientKm: z.number().min(0.1).max(10).optional(),
      driverGroupDetourKm: z.number().min(0).max(10).optional(),
      driverBaseFee: z.number().min(0).optional(),
      driverPerKmFee: z.number().min(0).optional(),
      // Frais de service ajoutés à chaque commande, pour la plateforme.
      serviceFee: z.number().min(0).max(50).optional(),
    });
    const body = schema.parse(req.body);

    const { configId, config } = await SystemConfigService.modifier(body);

    // Le mode maintenance est mis en cache : sans cela le changement
    // mettrait jusqu'à quinze secondes à s'appliquer.
    invalidateMaintenanceCache();
    await journaliser(req, "SYSTEM_CONFIG_UPDATED", configId, body);

    res.json({
      message: "Configuration enregistrée",
      config,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/advanced-settings - Advanced settings
router.get("/advanced-settings", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ settings: await SystemConfigService.reglagesAvances() });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/advanced-settings - Update advanced settings
router.put("/advanced-settings", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      // La page renvoie l'objet complet qu'elle a reçu, id compris.
      id: z.string().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      debugMode: z.boolean().optional(),
      enabledFeatures: z.array(z.string()).optional(),
      performanceOptimizations: z
        .object({
          cacheEnabled: z.boolean().optional(),
          cacheDuration: z.number().int().min(0).optional(),
          compressionEnabled: z.boolean().optional(),
        })
        .optional(),
    });

    const { id: _ignore, ...body } = schema.parse(req.body);
    const settings = await SystemConfigService.modifierReglagesAvances(body);

    // Sans cela, le mode maintenance ne prendrait effet qu'au bout du cache.
    invalidateMaintenanceCache();

    await journaliser(req, "UPDATE_ADVANCED_SETTINGS", "SYSTEM_CONFIG", body);

    res.json({
      success: true,
      settings,
      message: "Paramètres mis à jour avec succès",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
