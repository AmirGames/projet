import { z } from "zod";
import { assertPrivacyConfiguration } from "../modules/privacy/crypto";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MFA_MODE: z.enum(["enrollment", "enforced"]).default("enrollment"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url().refine((v) => ["postgres:", "postgresql:"].includes(new URL(v).protocol), "DATABASE_URL doit être une URL PostgreSQL"),
  DATABASE_URL_MIGRATION: z.string().url().refine((v) => ["postgres:", "postgresql:"].includes(new URL(v).protocol), "DATABASE_URL_MIGRATION doit être une URL PostgreSQL").optional(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.literal("15m").default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.literal("7d").default("7d"),
  API_URL: z.string().url().refine((v) => /^https?:\/\//.test(v), "API_URL doit utiliser http(s)"),
  FRONTEND_URL: z.string().url().refine((v) => /^https?:\/\//.test(v), "FRONTEND_URL doit utiliser http(s)"),
  // Domaines supplémentaires autorisés à appeler l'API, séparés par des
  // virgules (le site est servi depuis un domaine public et un domaine
  // professionnel).
  ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("debug"),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  EMAIL_FROM: z.string().email().optional(),
  REDIS_URL: z.string().url().refine((v) => ["redis:", "rediss:"].includes(new URL(v).protocol), "REDIS_URL doit utiliser redis(s)").optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  DATABASE_URL_APP: z.string().url().refine((v) => ["postgres:", "postgresql:"].includes(new URL(v).protocol), "DATABASE_URL_APP doit être une URL PostgreSQL").optional(),
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
  // Nom exact d'un adaptateur Peppol enregistré. Vide : aucun envoi externe ;
  // valeur inconnue : refus explicite. Aucun adaptateur réel n'est enregistré A07.
  PEPPOL_PROVIDER: z.string().optional(),
  // Itinéraire des courses ZupDrive (distance et durée du devis) :
  // « estimation » (défaut, sans service externe) ou « osrm » (OSRM_API_URL,
  // une instance OSRM, idéalement hébergée par vous). Voir itineraire.service.ts.
  ROUTING_PROVIDER: z.enum(["estimation", "osrm"]).default("estimation"),
  OSRM_API_URL: z.string().url().optional(),
  // Secret partagé avec le fournisseur d'envoi : signe les accusés de notification ZupDrive (HMAC-SHA256).
  ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET: z.string().min(32, 'Secret du webhook de notifications ZupDrive : au moins 32 caractères').optional(),
  // Sorties ZupDrive désactivées jusqu'au branchement transactionnel des événements métier.
  ZUPDRIVE_WEBHOOKS_ENABLED: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  // ZupDrive : tant que la course n'est pas payée en ligne, aucun chauffeur ne la reçoit (elle expire sans
  // chauffeur comme les autres après RECHERCHE_MAX_MS). Faux par défaut : à activer quand l'écran de paiement est en ligne.
  ZUPDRIVE_PAIEMENT_OBLIGATOIRE: z.string().default("false").transform((v) => v === "true"),
  ENABLE_STRIPE: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
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
  const secrets = [
    ["JWT_SECRET", config.JWT_SECRET],
    ["JWT_REFRESH_SECRET", config.JWT_REFRESH_SECRET],
    ["STRIPE_SECRET_KEY", config.STRIPE_SECRET_KEY],
    ["STRIPE_WEBHOOK_SECRET", config.STRIPE_WEBHOOK_SECRET],
    ["ASSISTANT_GATEWAY_SECRET", config.ASSISTANT_GATEWAY_SECRET],
    ["ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET", config.ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  for (let i = 0; i < secrets.length; i++) {
    for (let j = i + 1; j < secrets.length; j++) {
      if (secrets[i][1] === secrets[j][1]) contexte.addIssue({ code: "custom", path: [secrets[j][0]], message: `Le secret ${secrets[j][0]} doit être distinct de ${secrets[i][0]}` });
    }
  }
  if (config.NODE_ENV === "production" && !config.REDIS_URL) {
    contexte.addIssue({ code: "custom", path: ["REDIS_URL"], message: "Redis est obligatoire pour les quotas partagés en production" });
  }
  if (config.NODE_ENV === "production" && config.DATABASE_URL_MIGRATION && config.DATABASE_URL === config.DATABASE_URL_MIGRATION) {
    contexte.addIssue({ code: "custom", path: ["DATABASE_URL_MIGRATION"], message: "Le rôle applicatif et le rôle de migration doivent utiliser des identifiants distincts" });
  }
  if (config.NODE_ENV === "production" && config.DATABASE_URL_APP && config.DATABASE_URL_MIGRATION) {
    const roleApp = decodeURIComponent(new URL(config.DATABASE_URL_APP).username);
    const roleMigration = decodeURIComponent(new URL(config.DATABASE_URL_MIGRATION).username);
    if (!roleApp || !roleMigration || roleApp === roleMigration) contexte.addIssue({ code: "custom", path: ["DATABASE_URL_MIGRATION"], message: "Les URLs doivent utiliser des rôles PostgreSQL distincts" });
  }
  if (config.NODE_ENV === "production" && (!config.DATABASE_URL_APP || !config.DATABASE_URL_MIGRATION)) {
    contexte.addIssue({ code: "custom", path: [!config.DATABASE_URL_APP ? "DATABASE_URL_APP" : "DATABASE_URL_MIGRATION"], message: "Rôles PostgreSQL applicatif et migration distincts requis en production" });
  }
  if (config.NODE_ENV === "production" && (!config.SMTP_HOST || !config.EMAIL_FROM)) {
    contexte.addIssue({ code: "custom", path: [!config.SMTP_HOST ? "SMTP_HOST" : "EMAIL_FROM"], message: "SMTP_HOST et EMAIL_FROM sont requis en production pour les courriels de compte et d'exploitation" });
  }
  if (config.ENABLE_STRIPE) {
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
      if (!config[name]) contexte.addIssue({ code: "custom", path: [name], message: `${name} requis quand ENABLE_STRIPE=true` });
    }
    if (config.STRIPE_SECRET_KEY && !/^sk_(test|live)_/.test(config.STRIPE_SECRET_KEY)) contexte.addIssue({ code: "custom", path: ["STRIPE_SECRET_KEY"], message: "Clé Stripe secrète invalide" });
    if (config.STRIPE_PUBLISHABLE_KEY && !/^pk_(test|live)_/.test(config.STRIPE_PUBLISHABLE_KEY)) contexte.addIssue({ code: "custom", path: ["STRIPE_PUBLISHABLE_KEY"], message: "Clé Stripe publique invalide" });
    if (config.STRIPE_SECRET_KEY && config.STRIPE_PUBLISHABLE_KEY && config.STRIPE_SECRET_KEY.split("_")[1] !== config.STRIPE_PUBLISHABLE_KEY.split("_")[1]) contexte.addIssue({ code: "custom", path: ["STRIPE_PUBLISHABLE_KEY"], message: "Les clés Stripe doivent appartenir au même mode (test/live)" });
    if (config.STRIPE_WEBHOOK_SECRET && !config.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) contexte.addIssue({ code: "custom", path: ["STRIPE_WEBHOOK_SECRET"], message: "Secret webhook Stripe invalide" });
  }
  const cloudinary = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;
  const nbCloudinary = cloudinary.filter((name) => Boolean(config[name]?.trim())).length;
  if (nbCloudinary > 0 && nbCloudinary !== cloudinary.length) contexte.addIssue({ code: "custom", path: ["CLOUDINARY_CLOUD_NAME"], message: "Cloudinary incomplet : renseignez les trois identifiants ou aucun" });
  if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD)) contexte.addIssue({ code: "custom", path: ["SMTP_PASSWORD"], message: "SMTP_USER et SMTP_PASSWORD doivent être fournis ensemble" });
  if (config.SMTP_HOST && !config.EMAIL_FROM) contexte.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: "EMAIL_FROM requis avec SMTP_HOST" });
});

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function loadEnv(): Env {
  if (env) return env;

  const source = { ...process.env };
  if (source.NODE_ENV === "production") {
    if (!source.DATABASE_URL_APP) console.error("DATABASE_URL_APP requis en production : le rôle propriétaire ne doit pas être utilisé par l'API");
    if (!source.DATABASE_URL_MIGRATION) console.error("DATABASE_URL_MIGRATION requis en production pour le service de migration");
    // L'API consomme exclusivement le rôle applicatif en production. Aucune
    // retombée silencieuse vers le DATABASE_URL historique/propriétaire.
    if (source.DATABASE_URL_APP) source.DATABASE_URL = source.DATABASE_URL_APP;
  }
  const result = envSchema.safeParse(source);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.flatten());
    process.exit(1);
  }

  if (source.NODE_ENV === "production" && (!source.DATABASE_URL_APP || !source.DATABASE_URL_MIGRATION)) {
    process.exit(1);
  }

  env = result.data;
  if (env.NODE_ENV === "production") assertPrivacyConfiguration();
  console.log(`✅ Environment loaded: ${env.NODE_ENV}`);
  console.log(`Capabilities: Stripe=${env.ENABLE_STRIPE ? "enabled" : "disabled"}, Cloudinary=${env.CLOUDINARY_CLOUD_NAME ? "enabled" : "disabled"}, SMTP=${env.SMTP_HOST ? "configured" : "local-default"}, email-verification=${env.ENABLE_EMAIL_VERIFICATION ? "enabled" : "disabled"}, assistant=${env.ASSISTANT_MODE}, OSRM=${env.ROUTING_PROVIDER === "osrm" ? "enabled" : "estimation"}`);
  return env;
}

export function getEnv(): Env {
  if (!env) {
    return loadEnv();
  }
  return env;
}
