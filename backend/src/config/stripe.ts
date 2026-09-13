import Stripe from "stripe";
import { logger } from "./logger";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  logger.error("STRIPE_SECRET_KEY not set in environment variables");
}

export const stripe = new Stripe(stripeSecretKey || "", {
  apiVersion: "2026-08-26.dahlia" as any,
});

export const STRIPE_CONFIG = {
  currency: "eur",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
};