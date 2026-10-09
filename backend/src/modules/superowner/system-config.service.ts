import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { ApiKeyService } from "../auth/api-key.service";
import { objetJson } from "../../utils/json";

/** Les réglages modifiables de la plateforme (champs de SystemConfig). */
export type ModificationConfig = {
  platformFeePercent?: number;
  minOrderAmount?: number;
  maxOrderAmount?: number;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  driverMaxRadiusKm?: number;
  driverBikeMaxKm?: number;
  driverScooterMaxKm?: number;
  driverExceptionSeconds?: number;
  driverSoonFreeKm?: number;
  driverSoonFreeSeconds?: number;
  driverOfferSeconds?: number;
  driverMaxCourses?: number;
  driverGroupClientKm?: number;
  driverGroupDetourKm?: number;
  driverBaseFee?: number;
  driverPerKmFee?: number;
  serviceFee?: number;
};

export type ReglagesAvances = {
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  debugMode?: boolean;
  enabledFeatures?: string[];
  performanceOptimizations?: {
    cacheEnabled?: boolean;
    cacheDuration?: number;
    compressionEnabled?: boolean;
  };
};

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

/** La configuration de la plateforme, créée vide si elle n'existe pas encore. */
async function lireOuCreer() {
  let config = await db.systemConfig.findFirst();
  if (!config) config = await db.systemConfig.create({ data: {} });
  return config;
}

// Les réglages avancés sont conservés dans le champ JSON de SystemConfig.
async function chargerReglages() {
  const config = await lireOuCreer();

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

/** Les réglages de la plateforme en nombres, tels que l'interface les lit. */
function presenter(config: Awaited<ReturnType<typeof lireOuCreer>>) {
  return {
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
  };
}

/** Configuration de la plateforme : lecture, réglages de livraison et de maintenance, réglages avancés. */
export const SystemConfigService = {
  /** La configuration brute (créée si absente). */
  lireOuCreer,

  /** Met à jour la configuration brute, sans contrôle de plage (administration système). */
  async mettreAJour(body: Record<string, unknown>) {
    const config = await lireOuCreer();

    return db.systemConfig.update({
      where: { id: config.id },
      data: body,
    });
  },

  /** L'état réel du système : base, webhooks, clés d'API et réglages. */
  async etatDuSysteme() {
    // Cette réponse était entièrement fabriquée (version de base en dur, cache
    // Redis inexistant, clés API fictives). Elle reflète désormais l'état réel.
    const config = await lireOuCreer();

    const [versionBase, nbWebhooks, nbWebhooksActifs, cles] = await Promise.all([
      db.$queryRaw<{ version: string }[]>`SELECT version() as version`.catch(() => []),
      db.webhook.count(),
      db.webhook.count({ where: { status: "ACTIVE" } }),
      ApiKeyService.list(),
    ]);

    const version = versionBase[0]?.version?.match(/PostgreSQL ([\d.]+)/)?.[1] || "inconnue";

    return {
      apiVersion: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
      webhookUrl: `${process.env.API_URL || ""}/api/webhooks`,
      database: { status: versionBase.length ? "CONNECTED" : "UNREACHABLE", version },
      webhooks: { enabled: nbWebhooksActifs > 0, count: nbWebhooks, active: nbWebhooksActifs },
      apiKeys: cles,
      // Réglages modifiables de la plateforme.
      ...presenter(config),
    };
  },

  /** Modifie les réglages de la plateforme, en contrôlant les plages. Rend l'ancienne configuration (id) et la nouvelle. */
  async modifier(body: ModificationConfig) {
    if (
      body.minOrderAmount !== undefined &&
      body.maxOrderAmount !== undefined &&
      body.minOrderAmount > body.maxOrderAmount
    ) {
      throw new ApiError(400, "Le montant minimum doit rester inférieur au maximum", "INVALID_RANGE");
    }

    const config = await lireOuCreer();

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

    return { configId: config.id, config: presenter(misAJour) };
  },

  /** Les réglages avancés (valeurs par défaut fusionnées avec ceux qui sont enregistrés). */
  async reglagesAvances() {
    const { settings } = await chargerReglages();
    return settings;
  },

  /** Fusionne et enregistre les réglages avancés ; la maintenance a ses propres colonnes. */
  async modifierReglagesAvances(body: ReglagesAvances) {
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

    return {
      ...fusionnes,
      id: misAJour.id,
      maintenanceMode: misAJour.maintenanceMode,
      maintenanceMessage: misAJour.maintenanceMessage || "",
    };
  },
};
