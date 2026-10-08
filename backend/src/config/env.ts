import { z } from "zod";
import { assertPrivacyConfiguration } from "../modules/privacy/crypto";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.literal("15m").default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.literal("7d").default("7d"),
  API_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  // Domaines supplémentaires autorisés à appeler l'API, séparés par des
  // virgules (le site est servi depuis un domaine public et un domaine
  // professionnel).
  ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  REDIS_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  // Le compte de la plateforme qui paie commerçants et livreurs : il figure
  // comme donneur d'ordre dans le fichier de virements groupés SEPA.
  SEPA_DEBTOR_NAME: z.string().optional(),
  SEPA_DEBTOR_IBAN: z.string().optional(),
  SEPA_DEBTOR_BIC: z.string().optional(),
  // Le premier lundi des reversements hebdomadaires (AAAA-MM-JJ). Vide : l'arrêté
  // automatique ne tourne pas. Les commandes d'avant ne sont jamais reprises —
  // elles ont été réglées à l'ancienne, sans relevé.
  PAYOUTS_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // L'émetteur des factures électroniques Peppol : la société qui exploite la
  // plateforme. Sans son numéro de TVA et son adresse, aucune facture n'est émise.
  PLATFORM_LEGAL_NAME: z.string().optional(),
  PLATFORM_VAT_NUMBER: z.string().optional(),
  PLATFORM_REGISTRATION_NUMBER: z.string().optional(),
  PLATFORM_ADDRESS: z.string().optional(),
  PLATFORM_POSTAL_CODE: z.string().optional(),
  PLATFORM_CITY: z.string().optional(),
  PLATFORM_COUNTRY: z.string().length(2).default("BE"),
  PLATFORM_EMAIL: z.string().email().optional(),
  // Le compte où les commerçants paient leur facture (SEPA_DEBTOR_IBAN à défaut).
  PLATFORM_IBAN: z.string().optional(),
  // TVA appliquée aux services de la plateforme (commission, livraison, frais).
  PLATFORM_VAT_RATE: z.coerce.number().min(0).max(100).default(21),
  // Les commissions et frais sont-ils déjà TTC ? Faux (défaut) : ce sont des
  // montants hors taxe, la TVA s'y ajoute. Vrai : la TVA y est incluse — ce qui
  // est retenu sur un reversement est alors tout ce que le commerçant doit.
  PLATFORM_AMOUNTS_INCLUDE_VAT: z.string().default("false").transform((v) => v === "true"),
  // Le fournisseur d'Access Point Peppol. Vide : les factures sont générées mais
  // s'envoient à la main (téléchargement du XML).
  PEPPOL_PROVIDER: z.string().optional(),
  // Itinéraire des courses ZupDrive (distance et durée du devis) :
  // « estimation » (défaut, sans service externe) ou « osrm » (OSRM_API_URL,
  // une instance OSRM, idéalement hébergée par vous). Voir itineraire.service.ts.
  ROUTING_PROVIDER: z.enum(["estimation", "osrm"]).default("estimation"),
  OSRM_API_URL: z.string().url().optional(),
  // Secret partagé avec le fournisseur d'envoi : signe les accusés de notification ZupDrive (HMAC-SHA256).
  ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET: z.string().min(32, 'Secret du webhook de notifications ZupDrive : au moins 32 caractères').optional(),
  // ZupDrive : tant que la course n'est pas payée en ligne, aucun chauffeur ne la reçoit (elle expire sans
  // chauffeur comme les autres après RECHERCHE_MAX_MS). Faux par défaut : à activer quand l'écran de paiement est en ligne.
  ZUPDRIVE_PAIEMENT_OBLIGATOIRE: z.string().default("false").transform((v) => v === "true"),
  ENABLE_STRIPE: z.string().default("true").transform((v) => v === "true"),
  ENABLE_EMAIL_VERIFICATION: z.string().default("true").transform((v) => v === "true"),
  ASSISTANT_MODE: z.enum(['auto', 'real', 'degraded', 'simulation']).default('auto'),
  ASSISTANT_PROVIDER: z.enum(['ollama', 'openai']).default('ollama'),
  ASSISTANT_OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  ASSISTANT_OLLAMA_MODEL: z.string().max(100).optional(),
  ASSISTANT_HOSTS: z.string().optional(),
  ASSISTANT_GATEWAY_SECRET: z.string().optional().refine(v => !v || v.length >= 32, 'Secret de relais : au moins 32 caractères'),
  ASSISTANT_OPENAI_KEY: z.string().optional(),
  ASSISTANT_OPENAI_MODEL: z.string().max(100).optional(),
  ASSISTANT_DAILY_MESSAGES: z.coerce.number().int().min(1).max(1000000).default(1000),
  ASSISTANT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ASSISTANT_GUEST_DAYS: z.coerce.number().int().min(1).max(365).default(1),
  ASSISTANT_PRIVACY_URL: z.string().optional(),
  ASSISTANT_DISABLED_AGENTS: z.string().optional(),
}).superRefine((config, contexte) => {
  if (config.NODE_ENV === 'production' && config.ASSISTANT_MODE === 'simulation') {
    contexte.addIssue({ code: 'custom', path: ['ASSISTANT_MODE'], message: 'La simulation est interdite en production' });
  }
  if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
    contexte.addIssue({ code: "custom", path: ["JWT_REFRESH_SECRET"], message: "Les secrets access et refresh doivent être distincts" });
  }
  if (config.NODE_ENV === "production" && !config.REDIS_URL) {
    contexte.addIssue({ code: "custom", path: ["REDIS_URL"], message: "Redis est obligatoire pour les quotas partagés en production" });
  }
});

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function loadEnv(): Env {
  if (env) return env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten());
    process.exit(1);
  }

  env = result.data;
  if (env.NODE_ENV === "production") assertPrivacyConfiguration();
  console.log(`✅ Environment loaded: ${env.NODE_ENV}`);
  return env;
}

export function getEnv(): Env {
  if (!env) {
    return loadEnv();
  }
  return env;
}
