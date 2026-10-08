import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../auth/auth.middleware";
import { ApiKeyService } from "../auth/api-key.service";
import { invalidateMaintenanceCache } from "../monitoring/maintenance.middleware";
import { isSuperOwner, journaliser } from "./shared";
import { objetJson } from "../../utils/json";

const router = Router();

// GET /superowner/system-config - System configuration
router.get("/system-config", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Cette réponse était entièrement fabriquée (version de base en dur, cache
    // Redis inexistant, clés API fictives). Elle reflète désormais l'état réel.
    let config = await db.systemConfig.findFirst();
    if (!config) config = await db.systemConfig.create({ data: {} });

    const [versionBase, nbWebhooks, nbWebhooksActifs, cles] = await Promise.all([
      db.$queryRaw<{ version: string }[]>`SELECT version() as version`.catch(() => []),
      db.webhook.count(),
      db.webhook.count({ where: { status: "ACTIVE" } }),
      ApiKeyService.list(),
    ]);

    const version = versionBase[0]?.version?.match(/PostgreSQL ([\d.]+)/)?.[1] || "inconnue";

    res.json({
      config: {
        apiVersion: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
        webhookUrl: `${process.env.API_URL || ""}/api/webhooks`,
        database: { status: versionBase.length ? "CONNECTED" : "UNREACHABLE", version },
        webhooks: { enabled: nbWebhooksActifs > 0, count: nbWebhooks, active: nbWebhooksActifs },
        apiKeys: cles,
        // Réglages modifiables de la plateforme.
        platformFeePercent: Number(config.platformFeePercent),
        minOrderAmount: Number(config.minOrderAmount),
        maxOrderAmount: Number(config.maxOrderAmount),
        maintenanceMode: config.maintenanceMode,
        maintenanceMessage: config.maintenanceMessage || "",
        driverMaxRadiusKm: config.driverMaxRadiusKm,
        driverBikeMaxKm: config.driverBikeMaxKm,
        driverScooterMaxKm: config.driverScooterMaxKm,
        driverExceptionSeconds: config.driverExceptionSeconds,
        driverSoonFreeKm: config.driverSoonFreeKm,
        driverSoonFreeSeconds: config.driverSoonFreeSeconds,
        driverOfferSeconds: config.driverOfferSeconds,
        driverMaxCourses: config.driverMaxCourses,
        driverGroupClientKm: config.driverGroupClientKm,
        driverGroupDetourKm: config.driverGroupDetourKm,
        driverBaseFee: Number(config.driverBaseFee),
        driverPerKmFee: Number(config.driverPerKmFee),
        serviceFee: Number(config.serviceFee),
      },
    });
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

    if (
      body.minOrderAmount !== undefined &&
      body.maxOrderAmount !== undefined &&
      body.minOrderAmount > body.maxOrderAmount
    ) {
      throw new ApiError(400, "Le montant minimum doit rester inférieur au maximum", "INVALID_RANGE");
    }

    let config = await db.systemConfig.findFirst();
    if (!config) config = await db.systemConfig.create({ data: {} });

    // Un vélo ne peut pas livrer plus loin qu'un scooter. On compare avec la
    // valeur enregistrée quand une seule des deux est modifiée.
    const velo = body.driverBikeMaxKm ?? config.driverBikeMaxKm;
    const scooter = body.driverScooterMaxKm ?? config.driverScooterMaxKm;
    if (velo > scooter) {
      throw new ApiError(400, "La distance du vélo ne peut pas dépasser celle du scooter", "INVALID_RANGE");
    }

    const misAJour = await db.systemConfig.update({
      where: { id: config.id },
      data: body,
    });

    // Le mode maintenance est mis en cache : sans cela le changement
    // mettrait jusqu'à quinze secondes à s'appliquer.
    invalidateMaintenanceCache();
    await journaliser(req, "SYSTEM_CONFIG_UPDATED", config.id, body);

    res.json({
      message: "Configuration enregistrée",
      config: {
        platformFeePercent: Number(misAJour.platformFeePercent),
        minOrderAmount: Number(misAJour.minOrderAmount),
        maxOrderAmount: Number(misAJour.maxOrderAmount),
        maintenanceMode: misAJour.maintenanceMode,
        maintenanceMessage: misAJour.maintenanceMessage || "",
        driverMaxRadiusKm: misAJour.driverMaxRadiusKm,
        driverBikeMaxKm: misAJour.driverBikeMaxKm,
        driverScooterMaxKm: misAJour.driverScooterMaxKm,
        driverExceptionSeconds: misAJour.driverExceptionSeconds,
        driverSoonFreeKm: misAJour.driverSoonFreeKm,
        driverSoonFreeSeconds: misAJour.driverSoonFreeSeconds,
        driverOfferSeconds: misAJour.driverOfferSeconds,
        driverMaxCourses: misAJour.driverMaxCourses,
        driverGroupClientKm: misAJour.driverGroupClientKm,
        driverGroupDetourKm: misAJour.driverGroupDetourKm,
        driverBaseFee: Number(misAJour.driverBaseFee),
        driverPerKmFee: Number(misAJour.driverPerKmFee),
        serviceFee: Number(misAJour.serviceFee),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/advanced-settings - Advanced settings
// Structure attendue par la page: elle lit performanceOptimizations.cacheEnabled
// et enabledFeatures, absents de l'ancienne réponse — d'où son plantage.
const REGLAGES_PAR_DEFAUT = {
  maintenanceMode: false,
  maintenanceMessage: "",
  debugMode: false,
  enabledFeatures: [] as string[],
  performanceOptimizations: {
    cacheEnabled: true,
    cacheDuration: 3600,
    compressionEnabled: true,
  },
};

// Les réglages avancés sont conservés dans le champ JSON de SystemConfig.
async function chargerReglages() {
  let config = await db.systemConfig.findFirst();

  if (!config) {
    config = await db.systemConfig.create({ data: {} });
  }

  const enregistres = objetJson(config.settings);

  return {
    config,
    settings: {
      ...REGLAGES_PAR_DEFAUT,
      ...enregistres,
      performanceOptimizations: {
        ...REGLAGES_PAR_DEFAUT.performanceOptimizations,
        ...objetJson(enregistres.performanceOptimizations),
      },
      // Ces deux-là ont leur propre colonne : elles font foi.
      id: config.id,
      maintenanceMode: config.maintenanceMode,
      maintenanceMessage: config.maintenanceMessage || "",
    },
  };
}

router.get("/advanced-settings", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = await chargerReglages();

    res.json({ settings });
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
    const { config, settings: actuels } = await chargerReglages();
    const fusionnes = {
      ...actuels,
      ...body,
      performanceOptimizations: {
        ...actuels.performanceOptimizations,
        ...(body.performanceOptimizations || {}),
      },
    };

    const misAJour = await db.systemConfig.update({
      where: { id: config.id },
      data: {
        settings: fusionnes,
        ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
        ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      },
    });

    // Sans cela, le mode maintenance ne prendrait effet qu'au bout du cache.
    invalidateMaintenanceCache();

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_ADVANCED_SETTINGS",
        target: "SYSTEM_CONFIG",
        changes: body,
      },
    });

    res.json({
      success: true,
      settings: {
        ...fusionnes,
        id: misAJour.id,
        maintenanceMode: misAJour.maintenanceMode,
        maintenanceMessage: misAJour.maintenanceMessage || "",
      },
      message: "Paramètres mis à jour avec succès",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
