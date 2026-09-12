import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { PaymentService } from "../services/payment.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { logger } from "../config/logger.js";
import { STRIPE_CONFIG } from "../config/stripe.js";
import Stripe from "stripe";

const router = Router();

const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  storeId: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  customerEmail: z.string().email(),
  customerName: z.string().min(2),
  description: z.string().optional(),
});

// POST /payments/intent - Create payment intent
router.post(
  "/intent",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createPaymentSchema.parse(req.body);

      logger.info("Creating payment intent", {
        orderId: body.orderId,
        amount: body.amount,
      });

      const result = await PaymentService.createPaymentIntent(body);

      res.status(201).json({
        message: "Payment intent created",
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
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

      const result = await PaymentService.confirmPayment(paymentIntentId);

      res.json({
        message: "Payment confirmed",
        success: result.success,
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

      const status = await PaymentService.getPaymentStatus(paymentIntentId);

      res.json({
        paymentIntentId,
        ...status,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /payments/refund - Refund payment
router.post(
  "/refund",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paymentIntentId, amount } = req.body;

      if (!paymentIntentId) {
        throw new ApiError(400, "Payment intent ID required", "INVALID_INPUT");
      }

      logger.info("Processing refund", { paymentIntentId, amount });

      const result = await PaymentService.refundPayment(
        paymentIntentId,
        amount ? Math.round(amount * 100) : undefined
      );

      res.json({
        message: "Refund processed",
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /payments/webhook - Stripe webhook
router.post(
  "/webhook",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        throw new ApiError(400, "Missing stripe signature", "INVALID_INPUT");
      }

      const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
        apiVersion: "2026-08-26.dahlia" as any,
      });

      let event;
      try {
        event = stripeClient.webhooks.constructEvent(
          req.body,
          signature as string,
          STRIPE_CONFIG.webhookSecret
        );
      } catch (err) {
        logger.error("Webhook signature verification failed", { error: err });
        throw new ApiError(400, "Invalid signature", "INVALID_SIGNATURE");
      }

      logger.info("Webhook event received", { type: event.type });

      await PaymentService.handleWebhook(event);

      res.json({ received: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;