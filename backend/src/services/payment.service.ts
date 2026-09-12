import { stripe, STRIPE_CONFIG } from "../config/stripe.js";
import { db } from "./db.js";
import { logger } from "../config/logger.js";

export interface PaymentData {
  orderId: string;
  storeId: string;
  amount: number;
  currency?: string;
  customerEmail: string;
  customerName: string;
  description?: string;
}

export class PaymentService {
  // Create payment intent
  static async createPaymentIntent(data: PaymentData) {
    try {
      logger.info("Creating payment intent", {
        orderId: data.orderId,
        amount: data.amount,
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(data.amount * 100), // Convert to cents
        currency: data.currency || STRIPE_CONFIG.currency,
        description: data.description || `Order ${data.orderId}`,
        metadata: {
          orderId: data.orderId,
          storeId: data.storeId,
        },
        receipt_email: data.customerEmail,
      });

      // Save payment intent ID to order
      db.prepare(
        `UPDATE "Order" SET "paymentId" = ? WHERE id = ?`
      ).run(paymentIntent.id, data.orderId);

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (err) {
      logger.error("Payment intent creation failed", { error: err });
      throw err;
    }
  }

  // Confirm payment
  static async confirmPayment(paymentIntentId: string) {
    try {
      logger.info("Confirming payment", { paymentIntentId });

      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      // In demo mode, accept requires_payment_method as success
      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "requires_payment_method"
      ) {
        // Find order by payment ID
        const order = db
          .prepare('SELECT * FROM "Order" WHERE "paymentId" = ?')
          .get(paymentIntentId);

        if (order) {
          // Update order payment status to PAID
          db.prepare(
            `UPDATE "Order" SET "paymentStatus" = ? WHERE id = ?`
          ).run("PAID", order.id);

          logger.info("Payment confirmed", { orderId: order.id });
        }

        return { success: true, status: paymentIntent.status };
      }

      return { success: false, status: paymentIntent.status };
    } catch (err) {
      logger.error("Payment confirmation failed", { error: err });
      throw err;
    }
  }

  // Get payment status
  static async getPaymentStatus(paymentIntentId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      return {
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      };
    } catch (err) {
      logger.error("Payment status retrieval failed", { error: err });
      throw err;
    }
  }

  // Refund payment
  static async refundPayment(paymentIntentId: string, amountCents?: number) {
    try {
      logger.info("Processing refund", { paymentIntentId });

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amountCents,
      });

      return {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
      };
    } catch (err) {
      logger.error("Refund failed", { error: err });
      throw err;
    }
  }

  // Handle webhook event
  static async handleWebhookEvent(event: any) {
    try {
      logger.info("Processing webhook event", { type: event.type });

      switch (event.type) {
        case "payment_intent.succeeded":
          await this.confirmPayment(event.data.object.id);
          break;

        case "payment_intent.payment_failed":
          logger.warn("Payment failed", {
            paymentIntentId: event.data.object.id,
          });
          break;

        default:
          logger.info("Unhandled webhook event", { type: event.type });
      }

      return { received: true };
    } catch (err) {
      logger.error("Webhook handling failed", { error: err });
      throw err;
    }
  }
}