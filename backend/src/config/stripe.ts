import Stripe from "stripe";
import { logger } from "./logger";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  logger.error("STRIPE_SECRET_KEY not set in environment variables");
}

// La bibliothèque refuse une clé vide dès la construction, ce qui arrêtait
// l'API entière quand Stripe n'est pas encore configuré (ENABLE_STRIPE=false).
// Une clé factice la laisse démarrer : seuls les appels à Stripe échouent.
export const stripe = new Stripe(stripeSecretKey || "sk_non_configuree", {
  apiVersion: "2026-08-26.dahlia" as any,
});

export const STRIPE_CONFIG = {
  currency: "eur",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
};