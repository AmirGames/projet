import { envSchema } from "../env";

const base = () => ({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://app:secret@localhost:5432/app_test",
  JWT_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
  API_URL: "http://localhost:3001",
  FRONTEND_URL: "http://localhost:3000",
});

describe("configuration des capacités", () => {
  it("désactive Stripe par défaut sans exiger de clés", () => {
    const resultat = envSchema.safeParse(base());
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.ENABLE_STRIPE).toBe(false);
  });

  it("refuse Stripe activé sans clés secrète, publique et webhook", () => {
    const resultat = envSchema.safeParse({ ...base(), ENABLE_STRIPE: "true" });
    expect(resultat.success).toBe(false);
    if (!resultat.success) {
      const chemins = resultat.error.issues.map((issue) => issue.path[0]);
      expect(chemins).toEqual(expect.arrayContaining(["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"]));
    }
  });

  it("refuse des clés Stripe de modes différents", () => {
    const resultat = envSchema.safeParse({ ...base(), ENABLE_STRIPE: "true", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PUBLISHABLE_KEY: "pk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    expect(resultat.success).toBe(false);
  });

  it("accepte Stripe complet et SMTP correctement identifié", () => {
    const resultat = envSchema.safeParse({
      ...base(),
      ENABLE_STRIPE: "true",
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_PUBLISHABLE_KEY: "pk_test_public",
      STRIPE_WEBHOOK_SECRET: "whsec_webhook",
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      EMAIL_FROM: "noreply@example.test",
      SMTP_USER: "relay-user",
      SMTP_PASSWORD: "relay-password",
    });
    expect(resultat.success).toBe(true);
  });

  it("refuse un Cloudinary partiel et une authentification SMTP partielle", () => {
    expect(envSchema.safeParse({ ...base(), CLOUDINARY_CLOUD_NAME: "cloud" }).success).toBe(false);
    expect(envSchema.safeParse({ ...base(), SMTP_HOST: "smtp.example", EMAIL_FROM: "noreply@example.com", SMTP_USER: "user" }).success).toBe(false);
  });

  it("exige les deux URLs SQL distinctes en production", () => {
    const resultat = envSchema.safeParse({ ...base(), NODE_ENV: "production", REDIS_URL: "redis://localhost:6379", DATABASE_URL_APP: base().DATABASE_URL, DATABASE_URL_MIGRATION: base().DATABASE_URL });
    expect(resultat.success).toBe(false);
    if (!resultat.success) expect(resultat.error.issues.some((issue) => issue.path[0] === "DATABASE_URL_MIGRATION")).toBe(true);
  });
});
