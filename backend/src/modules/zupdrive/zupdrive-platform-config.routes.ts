import { Router } from "express";
import { z } from "zod";
import { journaliser } from "../superowner/shared";
import { adminAuth, validateRequest } from "./zupdrive-garde";
import { ZupDrivePlatformConfigService } from "./zupdrive-platform-config.service";

const router = Router();

/**
 * Commission Configuration
 */

/**
 * POST /api/zupdrive/admin/config/commissions
 * Créer ou mettre à jour une configuration de commission
 */
router.post(
  "/commissions",
  ...adminAuth,
  validateRequest({
    body: z.object({
      name: z.string().min(3).max(100),
      type: z.enum(["PERCENTAGE", "FIXED"]),
      value: z.number().min(0),
      appliesTo: z.enum(["CHAUFFEUR", "PLATEFORME"]),
      description: z.string().min(5).max(500),
      active: z.boolean(),
    }),
  }),
  async (req, res, next) => {
    try {
      const config = await ZupDrivePlatformConfigService.upsertCommissionConfig(req.body);
      await journaliser(req, "ZUPDRIVE_UPSERT_COMMISSION_CONFIG", config.id, req.body);
      res.status(201).json(config);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/config/commissions
 * Lister les commissions
 */
router.get(
  "/commissions",
  ...adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as unknown as { activeOnly: boolean };
      const configs = await ZupDrivePlatformConfigService.listCommissionConfigs(activeOnly);
      res.json(configs);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Regional Configuration
 */

/**
 * POST /api/zupdrive/admin/config/regions
 * Créer ou mettre à jour une configuration régionale
 */
router.post(
  "/regions",
  ...adminAuth,
  validateRequest({
    body: z.object({
      region: z.enum(["BRUXELLES", "WALLONIE", "FLANDRE"]),
      minPrice: z.number().min(0),
      baseSurgeMultiplier: z.number().min(1).max(3),
      maxSurgeMultiplier: z.number().min(1).max(3),
      peakHours: z.string(), // "09:00-12:00,17:00-20:00"
      peakSurgeMultiplier: z.number().min(1),
      active: z.boolean(),
    }),
  }),
  async (req, res, next) => {
    try {
      const config = await ZupDrivePlatformConfigService.upsertRegionalConfig(req.body);
      await journaliser(req, "ZUPDRIVE_UPSERT_REGIONAL_CONFIG", config.id, req.body);
      res.status(201).json(config);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/config/regions
 * Lister les configurations régionales
 */
router.get("/regions", ...adminAuth, async (_req, res, next) => {
  try {
    const configs = await ZupDrivePlatformConfigService.listRegionalConfigs();
    res.json(configs);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/zupdrive/admin/config/regions/:region
 * Récupérer la configuration d'une région spécifique
 */
router.get(
  "/regions/:region",
  ...adminAuth,
  validateRequest({
    params: z.object({
      region: z.enum(["BRUXELLES", "WALLONIE", "FLANDRE"]),
    }),
  }),
  async (req, res, next) => {
    try {
      const { region } = req.params as { region: "BRUXELLES" | "WALLONIE" | "FLANDRE" };
      const config = await ZupDrivePlatformConfigService.getRegionalConfig(region);
      res.json(config);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Pricing Rules
 */

/**
 * POST /api/zupdrive/admin/config/pricing-rules
 * Créer ou mettre à jour une règle de tarification
 */
router.post(
  "/pricing-rules",
  ...adminAuth,
  validateRequest({
    body: z.object({
      name: z.string().min(3).max(100),
      type: z.enum(["DISTANCE", "TIME", "AREA", "CUSTOM"]),
      basePricePerKm: z.number().min(0),
      basePricePerMin: z.number().min(0),
      minPrice: z.number().min(0),
      maxPrice: z.number().min(0).optional(),
      description: z.string().min(5).max(500),
      active: z.boolean(),
    }),
  }),
  async (req, res, next) => {
    try {
      const rule = await ZupDrivePlatformConfigService.upsertPricingRule(req.body);
      await journaliser(req, "ZUPDRIVE_UPSERT_PRICING_RULE", rule.id, req.body);
      res.status(201).json(rule);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/config/pricing-rules
 * Lister les règles de tarification
 */
router.get(
  "/pricing-rules",
  ...adminAuth,
  validateRequest({
    query: z.object({
      activeOnly: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
    }),
  }),
  async (req, res, next) => {
    try {
      const { activeOnly } = req.query as unknown as { activeOnly: boolean };
      const rules = await ZupDrivePlatformConfigService.listPricingRules(activeOnly);
      res.json(rules);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Platform Settings
 */

/**
 * POST /api/zupdrive/admin/config/settings
 * Créer ou mettre à jour un paramètre de plateforme
 */
router.post(
  "/settings",
  ...adminAuth,
  validateRequest({
    body: z.object({
      key: z.string().min(3).max(100),
      value: z.string(),
      type: z.enum(["STRING", "NUMBER", "BOOLEAN", "JSON"]),
      description: z.string().min(5).max(500),
    }),
  }),
  async (req, res, next) => {
    try {
      const { key, value, type, description } = req.body;
      const setting = await ZupDrivePlatformConfigService.setSetting(key, value, type, description);
      // La valeur n'est pas journalisée : un paramètre peut être sensible.
      await journaliser(req, "ZUPDRIVE_SET_PLATFORM_SETTING", setting.id, { key, type, description });
      res.status(201).json(setting);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/zupdrive/admin/config/settings
 * Lister tous les paramètres
 */
router.get("/settings", ...adminAuth, async (_req, res, next) => {
  try {
    const settings = await ZupDrivePlatformConfigService.getAllSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/zupdrive/admin/config/settings/:key
 * Récupérer un paramètre spécifique
 */
router.get(
  "/settings/:key",
  ...adminAuth,
  async (req, res, next) => {
    try {
      const key = String(req.params.key);
      const setting = await ZupDrivePlatformConfigService.getSetting(key);
      res.json(setting);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Price Calculation
 */

/**
 * POST /api/zupdrive/config/calculate-price
 * Calculer le prix d'une course (accessible publiquement pour estimer le prix)
 */
router.post(
  "/calculate-price",
  validateRequest({
    body: z.object({
      region: z.enum(["BRUXELLES", "WALLONIE", "FLANDRE"]),
      distanceKm: z.number().min(0),
      durationMin: z.number().min(0),
      surgeMultiplier: z.number().min(1).optional(),
    }),
  }),
  async (req, res, next) => {
    try {
      const pricing = await ZupDrivePlatformConfigService.calculateCoursePrice(req.body);
      res.json(pricing);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Full Configuration
 */

/**
 * GET /api/zupdrive/admin/config
 * Récupérer toute la configuration de la plateforme
 */
router.get("/", ...adminAuth, async (_req, res, next) => {
  try {
    const config = await ZupDrivePlatformConfigService.getPlatformConfiguration();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

export default router;
