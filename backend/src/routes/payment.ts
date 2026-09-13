import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { paymentService } from "../services/payment.service";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { STRIPE_CONFIG } from "../config/stripe";
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

      const result = await paymentService.createPaymentIntent(body.amount, body.customerEmail, body.orderId);

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

      const result = await paymentService.confirmPayment(paymentIntentId);

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

// TODO: Implement refund endpoint when refundPayment method is added to paymentService

// TODO: Implement webhook endpoint when handleWebhook method is added to paymentService

export default router;