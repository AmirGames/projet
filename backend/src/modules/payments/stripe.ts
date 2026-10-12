import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeActif = process.env.ENABLE_STRIPE === "true";

function clientDesactive(): Stripe {
  const refuser = () => {
    throw new Error("Stripe est désactivé ou incomplet : vérifiez ENABLE_STRIPE et ses trois secrets");
  };
  const proxy = new Proxy(refuser, {
    get: () => proxy,
    apply: refuser,
  });
  return proxy as unknown as Stripe;
}

// Pas de clé factice : le mode désactivé n'instancie jamais Stripe et toute
// tentative d'appel échoue explicitement. loadEnv() refuse les clés manquantes
// ou incohérentes si ENABLE_STRIPE=true.
export const stripe: Stripe = stripeActif && stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2026-08-26.dahlia" })
  : clientDesactive();

export const STRIPE_CONFIG = {
  currency: "eur",
  webhookSecret: stripeActif ? process.env.STRIPE_WEBHOOK_SECRET || "" : "",
};
