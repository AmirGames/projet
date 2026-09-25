import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { paymentService } from "../services/payment.service";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { getEnv } from "../config/env";

const router = Router();

// Le montant n'est plus lu ici : il vient de la commande, en base. Les
// identifiants de commande sont des cuid, pas des uuid — la validation
// précédente refusait toutes les commandes.
const createPaymentSchema = z.object({
  orderId: z.string().min(1),
});

// POST /payments/intent - Create payment intent
router.post(
  "/intent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createPaymentSchema.parse(req.body);

      logger.info("Creating payment intent", {
        orderId: body.orderId,
      });

      const result = await paymentService.createPaymentIntent(body.orderId);

      res.status(201).json({
        message: "Payment intent created",
        clientSecret: result.client_secret,
        paymentIntentId: result.id,
        amount: result.amount / 100,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /payments/confirm - Confirm payment
router.post(
  "/confirm",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        throw new ApiError(400, "Payment intent ID required", "INVALID_INPUT");
      }

      logger.info("Confirming payment", { paymentIntentId });

      const result = await paymentService.confirmPayment(paymentIntentId);

      res.json({
        message: "Payment confirmed",
        success: result.status === "succeeded",
        status: result.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /payments/status/:paymentIntentId - Get payment status
router.get(
  "/status/:paymentIntentId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentIntentId = req.params.paymentIntentId as string;
      const status = await paymentService.confirmPayment(paymentIntentId);

      res.json({
        paymentIntentId,
        status: status.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/payments/config — le paiement en ligne est-il branché ?
 *
 * L'application mobile en a besoin avant de proposer un moyen de paiement :
 * une commande payée en ligne n'arrive au commerçant qu'une fois encaissée,
 * et sans clé publique l'application ne saurait pas l'encaisser. La clé
 * publique n'a rien de secret : c'est celle que le navigateur reçoit aussi.
 */
router.get("/config", (_req: Request, res: Response) => {
  const enLigne = getEnv().ENABLE_STRIPE && Boolean(process.env.STRIPE_SECRET_KEY);
  res.json({
    success: true,
    data: {
      enLigne,
      publishableKey: enLigne ? process.env.STRIPE_PUBLISHABLE_KEY || null : null,
    },
  });
});

/**
 * POST /api/payments/webhook — les événements Stripe.
 *
 * Monté dans app.ts avant le lecteur JSON : la signature se vérifie sur le
 * corps brut, octet pour octet. Une erreur de traitement répond 500 pour que
 * Stripe renvoie l'événement plus tard ; une signature invalide répond 400.
 */
export async function stripeWebhookHandler(req: Request, res: Response) {
  try {
    const evenement = await paymentService.handleWebhook(
      req.body as Buffer,
      req.get("stripe-signature") || undefined
    );
    res.json({ received: true, type: evenement.type });
  } catch (err) {
    if (err instanceof ApiError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    logger.error("Webhook Stripe : traitement échoué", { error: (err as Error).message });
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

export default router;