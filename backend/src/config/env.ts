import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
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
  // Le fournisseur d'Access Point Peppol. Vide : les factures sont générées mais
  // s'envoient à la main (téléchargement du XML).
  PEPPOL_PROVIDER: z.string().optional(),
  ENABLE_STRIPE: z.string().default("true").transform((v) => v === "true"),
  ENABLE_EMAIL_VERIFICATION: z.string().default("true").transform((v) => v === "true"),
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
  console.log(`✅ Environment loaded: ${env.NODE_ENV}`);
  return env;
}

export function getEnv(): Env {
  if (!env) {
    return loadEnv();
  }
  return env;
}
