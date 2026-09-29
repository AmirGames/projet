import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { paymentService } from "../services/payment.service";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { getEnv } from "../config/env";
import { db } from "../services/db";
import { authMiddleware } from "../middleware/auth";
import { limiterCadence } from "../middleware/throttle";
import { jetonReconnu } from "../services/suivi-commande.service";

const router = Router();

/**
 * Qui peut agir sur le paiement d'une commande.
 *
 * Ces routes restaient ouvertes à tous : un simple identifiant de commande
 * donnait le secret de son intention Stripe (et son montant), et n'importe qui
 * pouvait déclencher en masse les relevés chez Stripe. Il faut désormais
 * prouver que la commande est la sienne : être le client connecté qui l'a
 * passée, ou présenter son jeton de suivi (remis à la création). Tout autre
 * appelant reçoit le même 404 qu'une commande inexistante.
 */
async function appelantFacultatif(req: Request, res: Response): Promise<string | undefined> {
  if (!req.headers.authorization?.startsWith("Bearer ")) return undefined;
  try {
    await new Promise<void>((ok, ko) => {
      authMiddleware(req, res, (err?: unknown) => (err ? ko(err) : ok()));
    });
    return req.userId;
  } catch {
    // Session expirée : elle ne compte pour rien, le jeton de suivi reste.
    return undefined;
  }
}

const introuvable = () => new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");

async function commandeDeLAppelant(req: Request, res: Response, orderId: string, jeton: unknown) {
  const commande = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      trackingTokenHash: true,
      jetonsDeSuivi: { select: { tokenHash: true } },
      customer: { select: { userId: true } },
    },
  });
  if (!commande) throw introuvable();

  const userId = await appelantFacultatif(req, res);
  const proprietaire = Boolean(userId && commande.customer?.userId === userId);
  const empreintes = [commande.trackingTokenHash, ...commande.jetonsDeSuivi.map((j) => j.tokenHash)];
  if (!proprietaire && !jetonReconnu(jeton, empreintes)) throw introuvable();

  return commande;
}

/** Assez pour quelques tentatives de carte, pas pour une énumération. */
const limiterPaiement = limiterCadence({
  max: 20,
  fenetreMs: 60 * 1000,
  message: "Trop de demandes de paiement. Réessayez dans un instant.",
  cle: (req) => `paiement|${req.ip || "inconnue"}`,
});

/** Le relevé d'état peut se répéter pendant que la banque répond. */
const limiterReleve = limiterCadence({
  max: 60,
  fenetreMs: 60 * 1000,
  message: "Trop de relevés de paiement. Réessayez dans un instant.",
  cle: (req) => `releve-paiement|${req.ip || "inconnue"}`,
});

// Le montant n'est plus lu ici : il vient de la commande, en base. Les
// identifiants de commande sont des cuid, pas des uuid — la validation
// précédente refusait toutes les commandes.
const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  trackingToken: z.string().optional(),
});

const confirmSchema = z.object({
  orderId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  trackingToken: z.string().optional(),
});

// POST /payments/intent - Create payment intent
router.post("/intent", limiterPaiement, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createPaymentSchema.parse(req.body);
    const commande = await commandeDeLAppelant(req, res, body.orderId, body.trackingToken);

    // Seule une commande en attente, pas encore payée, se paie.
    if (commande.status !== "PENDING") {
      throw new ApiError(409, "Cette commande ne peut plus être payée.", "ORDER_NOT_PAYABLE");
    }

    logger.info("Creating payment intent", { orderId: commande.id });

    const result = await paymentService.createPaymentIntent(commande.id);

    res.status(201).json({
      message: "Payment intent created",
      clientSecret: result.client_secret,
      paymentIntentId: result.id,
      amount: result.amount / 100,
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/confirm - L'état du paiement, relu chez Stripe
router.post("/confirm", limiterReleve, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parse = confirmSchema.safeParse(req.body);
    if (!parse.success) {
      throw new ApiError(400, "orderId et paymentIntentId requis", "INVALID_INPUT");
    }
    const body = parse.data;
    const commande = await commandeDeLAppelant(req, res, body.orderId, body.trackingToken);

    logger.info("Confirming payment", { orderId: commande.id, paymentIntentId: body.paymentIntentId });

    const result = await paymentService.confirmPayment(commande.id, body.paymentIntentId);

    res.json({
      message: "Payment confirmed",
      success: result.status === "succeeded",
      status: result.status,
    });
  } catch (err) {
    next(err);
  }
});

// GET /payments/status/:paymentIntentId?orderId=…&t=… - Get payment status
router.get(
  "/status/:paymentIntentId",
  limiterReleve,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const paymentIntentId = req.params.paymentIntentId as string;
      const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
      if (!orderId) throw new ApiError(400, "orderId requis", "INVALID_INPUT");

      const commande = await commandeDeLAppelant(req, res, orderId, req.query.t);
      const status = await paymentService.confirmPayment(commande.id, paymentIntentId);

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