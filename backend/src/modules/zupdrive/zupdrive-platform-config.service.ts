import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";

/**
 * Configuration de plateforme ZupDrive.
 * Commissions, tarifs, surge pricing, règles régionales, paramètres globaux.
 */

export interface CommissionConfig {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED";
  value: number; // % ou montant en centimes
  appliesTo: "CHAUFFEUR" | "PLATEFORME";
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegionalConfig {
  id: string;
  region: "BRUXELLES" | "WALLONIE" | "FLANDRE";
  minPrice: number; // centimes
  baseSurgeMultiplier: number; // 1.0 = pas de surge
  maxSurgeMultiplier: number;
  peakHours: string; // "09:00-12:00,17:00-20:00"
  peakSurgeMultiplier: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingRule {
  id: string;
  name: string;
  type: "DISTANCE" | "TIME" | "AREA" | "CUSTOM";
  basePricePerKm: number; // centimes
  basePricePerMin: number; // centimes
  minPrice: number;
  maxPrice?: number;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformSettings {
  id: string;
  key: string;
  value: string;
  type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON";
  description: string;
  updatedAt: Date;
}

export class ZupDrivePlatformConfigService {
  /**
   * Créer/mettre à jour une configuration de commission.
   */
  static async upsertCommissionConfig(data: {
    name: string;
    type: "PERCENTAGE" | "FIXED";
    value: number;
    appliesTo: "CHAUFFEUR" | "PLATEFORME";
    description: string;
    active: boolean;
  }): Promise<CommissionConfig> {
    // Vérifier que la valeur est valide
    if (data.type === "PERCENTAGE" && (data.value < 0 || data.value > 100)) {
      throw new ApiError(400, "La valeur en % doit être entre 0 et 100");
    }
    if (data.type === "FIXED" && data.value < 0) {
      throw new ApiError(400, "La valeur fixe ne peut pas être négative");
    }

    const config = await db.commissionConfig.upsert({
      where: { name: data.name },
      update: {
        type: data.type,
        value: data.value,
        appliesTo: data.appliesTo,
        description: data.description,
        active: data.active,
      },
      create: {
        name: data.name,
        type: data.type,
        value: data.value,
        appliesTo: data.appliesTo,
        description: data.description,
        active: data.active,
      },
    });

    logger.info(`Commission config updated: ${data.name}`);
    return this.formatCommissionConfig(config);
  }

  /**
   * Lister toutes les commissions actives.
   */
  static async listCommissionConfigs(activeOnly = true): Promise<CommissionConfig[]> {
    const configs = await db.commissionConfig.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return configs.map((c) => this.formatCommissionConfig(c));
  }

  /**
   * Créer/mettre à jour une configuration régionale.
   */
  static async upsertRegionalConfig(data: {
    region: "BRUXELLES" | "WALLONIE" | "FLANDRE";
    minPrice: number;
    baseSurgeMultiplier: number;
    maxSurgeMultiplier: number;
    peakHours: string;
    peakSurgeMultiplier: number;
    active: boolean;
  }): Promise<RegionalConfig> {
    // Validations
    if (data.minPrice < 0) throw new ApiError(400, "minPrice ne peut pas être négatif");
    if (data.baseSurgeMultiplier < 1 || data.baseSurgeMultiplier > 3) {
      throw new ApiError(400, "baseSurgeMultiplier doit être entre 1.0 et 3.0");
    }
    if (data.maxSurgeMultiplier <= data.baseSurgeMultiplier) {
      throw new ApiError(400, "maxSurgeMultiplier doit être > baseSurgeMultiplier");
    }

    const config = await db.regionalConfig.upsert({
      where: { region: data.region },
      update: {
        minPrice: data.minPrice,
        baseSurgeMultiplier: data.baseSurgeMultiplier,
        maxSurgeMultiplier: data.maxSurgeMultiplier,
        peakHours: data.peakHours,
        peakSurgeMultiplier: data.peakSurgeMultiplier,
        active: data.active,
      },
      create: {
        region: data.region,
        minPrice: data.minPrice,
        baseSurgeMultiplier: data.baseSurgeMultiplier,
        maxSurgeMultiplier: data.maxSurgeMultiplier,
        peakHours: data.peakHours,
        peakSurgeMultiplier: data.peakSurgeMultiplier,
        active: data.active,
      },
    });

    logger.info(`Regional config updated: ${data.region}`);
    return this.formatRegionalConfig(config);
  }

  /**
   * Récupérer la configuration d'une région.
   */
  static async getRegionalConfig(region: "BRUXELLES" | "WALLONIE" | "FLANDRE"): Promise<RegionalConfig> {
    const config = await db.regionalConfig.findUnique({
      where: { region },
    });

    if (!config) {
      throw new ApiError(404, `Configuration pour région ${region} non trouvée`);
    }

    return this.formatRegionalConfig(config);
  }

  /**
   * Lister toutes les configurations régionales.
   */
  static async listRegionalConfigs(): Promise<RegionalConfig[]> {
    const configs = await db.regionalConfig.findMany({
      orderBy: { region: "asc" },
    });

    return configs.map((c) => this.formatRegionalConfig(c));
  }

  /**
   * Créer/mettre à jour une règle de tarification.
   */
  static async upsertPricingRule(data: {
    name: string;
    type: "DISTANCE" | "TIME" | "AREA" | "CUSTOM";
    basePricePerKm: number;
    basePricePerMin: number;
    minPrice: number;
    maxPrice?: number;
    description: string;
    active: boolean;
  }): Promise<PricingRule> {
    // Validations
    if (data.basePricePerKm < 0 || data.basePricePerMin < 0) {
      throw new ApiError(400, "Les prix ne peuvent pas être négatifs");
    }
    if (data.maxPrice && data.maxPrice < data.minPrice) {
      throw new ApiError(400, "maxPrice doit être >= minPrice");
    }

    const rule = await db.pricingRule.upsert({
      where: { name: data.name },
      update: {
        type: data.type,
        basePricePerKm: data.basePricePerKm,
        basePricePerMin: data.basePricePerMin,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        description: data.description,
        active: data.active,
      },
      create: {
        name: data.name,
        type: data.type,
        basePricePerKm: data.basePricePerKm,
        basePricePerMin: data.basePricePerMin,
        minPrice: data.minPrice,
        maxPrice: data.maxPrice,
        description: data.description,
        active: data.active,
      },
    });

    logger.info(`Pricing rule updated: ${data.name}`);
    return this.formatPricingRule(rule);
  }

  /**
   * Lister toutes les règles de tarification actives.
   */
  static async listPricingRules(activeOnly = true): Promise<PricingRule[]> {
    const rules = await db.pricingRule.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return rules.map((r) => this.formatPricingRule(r));
  }

  /**
   * Mettre à jour un paramètre global de plateforme.
   */
  static async setSetting(key: string, value: string, type: "STRING" | "NUMBER" | "BOOLEAN" | "JSON", description: string): Promise<PlatformSettings> {
    // Valider le type
    if (type === "NUMBER") {
      if (isNaN(Number(value))) throw new ApiError(400, "Valeur invalide pour type NUMBER");
    }
    if (type === "BOOLEAN") {
      if (!["true", "false"].includes(value.toLowerCase())) {
        throw new ApiError(400, "Valeur invalide pour type BOOLEAN");
      }
    }
    if (type === "JSON") {
      try {
        JSON.parse(value);
      } catch (e) {
        throw new ApiError(400, "JSON invalide");
      }
    }

    const setting = await db.platformSettings.upsert({
      where: { key },
      update: {
        value,
        type,
        description,
        updatedAt: new Date(),
      },
      create: {
        key,
        value,
        type,
        description,
      },
    });

    logger.info(`Platform setting updated: ${key} = ${value}`);
    return this.formatPlatformSettings(setting);
  }

  /**
   * Récupérer un paramètre de plateforme.
   */
  static async getSetting(key: string): Promise<PlatformSettings> {
    const setting = await db.platformSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new ApiError(404, `Paramètre ${key} non trouvé`);
    }

    return this.formatPlatformSettings(setting);
  }

  /**
   * Récupérer tous les paramètres.
   */
  static async getAllSettings(): Promise<PlatformSettings[]> {
    const settings = await db.platformSettings.findMany({
      orderBy: { key: "asc" },
    });

    return settings.map((s) => this.formatPlatformSettings(s));
  }

  /**
   * Calculer le prix d'une course basé sur les règles.
   */
  static async calculateCoursePrice(data: {
    region: "BRUXELLES" | "WALLONIE" | "FLANDRE";
    distanceKm: number;
    durationMin: number;
    surgeMultiplier?: number;
  }): Promise<{
    basePrice: number;
    surgeAmount: number;
    finalPrice: number;
    breakdown: Record<string, number>;
  }> {
    const activeRules = await this.listPricingRules(true);
    const regionalConfig = await this.getRegionalConfig(data.region);

    if (activeRules.length === 0) {
      throw new ApiError(400, "Aucune règle de tarification active");
    }

    // Utiliser la première règle active
    const rule = activeRules[0];
    const basePrice = Math.max(rule.minPrice, data.distanceKm * rule.basePricePerKm + data.durationMin * rule.basePricePerMin);

    // Appliquer le cap maxPrice si défini
    const cappedPrice = rule.maxPrice ? Math.min(basePrice, rule.maxPrice) : basePrice;

    // Appliquer le surge multiplier
    const surge = data.surgeMultiplier || regionalConfig.baseSurgeMultiplier;
    const finalPrice = Math.round(cappedPrice * surge);

    return {
      basePrice: cappedPrice,
      surgeAmount: finalPrice - cappedPrice,
      finalPrice,
      breakdown: {
        distanceCharge: Math.round(data.distanceKm * rule.basePricePerKm),
        durationCharge: Math.round(data.durationMin * rule.basePricePerMin),
        surgeMultiplier: surge,
      },
    };
  }

  /**
   * Récupérer la configuration complète de la plateforme.
   */
  static async getPlatformConfiguration() {
    const [commissions, regions, pricingRules, settings] = await Promise.all([
      this.listCommissionConfigs(false),
      this.listRegionalConfigs(),
      this.listPricingRules(false),
      this.getAllSettings(),
    ]);

    return {
      commissions,
      regions,
      pricingRules,
      settings,
      generatedAt: new Date(),
    };
  }

  // Formatters

  private static formatCommissionConfig(config: any): CommissionConfig {
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      value: config.value,
      appliesTo: config.appliesTo,
      description: config.description,
      active: config.active,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private static formatRegionalConfig(config: any): RegionalConfig {
    return {
      id: config.id,
      region: config.region,
      minPrice: config.minPrice,
      baseSurgeMultiplier: config.baseSurgeMultiplier,
      maxSurgeMultiplier: config.maxSurgeMultiplier,
      peakHours: config.peakHours,
      peakSurgeMultiplier: config.peakSurgeMultiplier,
      active: config.active,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private static formatPricingRule(rule: any): PricingRule {
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      basePricePerKm: rule.basePricePerKm,
      basePricePerMin: rule.basePricePerMin,
      minPrice: rule.minPrice,
      maxPrice: rule.maxPrice || undefined,
      description: rule.description,
      active: rule.active,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private static formatPlatformSettings(settings: any): PlatformSettings {
    return {
      id: settings.id,
      key: settings.key,
      value: settings.value,
      type: settings.type,
      description: settings.description,
      updatedAt: settings.updatedAt,
    };
  }
}
