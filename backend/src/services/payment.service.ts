import { stripe, STRIPE_CONFIG } from "../config/stripe.js";
import { db } from "./db.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../middleware/errorHandler.js";

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
  static async createPaymentIntent(data: PaymentData) {
    try {
      logger.info("Creating payment intent", {
        orderId: data.orderId,
        amount: data.amount,
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(data.amount * 100),
        currency: data.currency || STRIPE_CONFIG.currency,
        description: data.description || `Order ${data.orderId}`,
        metadata: {
          orderId: data.orderId,
          storeId: data.storeId,
        },
        receipt_email: data.customerEmail,
      });

      await db.payment.create({
        data: {
          orderId: data.orderId,
          amount: data.amount,
          currency: data.currency || STRIPE_CONFIG.currency,
          status: "PENDING" as any,
          stripePaymentIntentId: paymentIntent.id,
          stripeClientSecret: paymentIntent.client_secret,
          stripeStatus: paymentIntent.status,
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    } catch (err) {
      logger.error("Payment intent creation failed", { error: err });
      throw err;
    }
  }

  static async confirmPayment(paymentIntentId: string) {
    try {
      logger.info("Confirming payment", { paymentIntentId });

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (
        paymentIntent.status === "succeeded" ||
        paymentIntent.status === "requires_payment_method"
      ) {
        const payment = await db.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntentId },
        });

        if (payment) {
          await db.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: "SUCCEEDED" as any },
          });

          await db.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED" as any, paidAt: new Date() },
          });

          logger.info("Payment confirmed", { orderId: payment.orderId });
        }

        return { success: true, status: paymentIntent.status };
      }

      throw new ApiError(400, "Payment not completed", "PAYMENT_INCOMPLETE");
    } catch (err) {
      logger.error("Payment confirmation failed", { error: err });
      throw err;
    }
  }

  static async getPaymentByOrderId(orderId: string) {
    const payment = await db.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new ApiError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    }

    return payment;
  }

  static async getPaymentStatus(paymentIntentId: string) {
    const payment = await db.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!payment) {
      throw new ApiError(404, "Payment not found", "PAYMENT_NOT_FOUND");
    }

    const stripePayment = await stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      status: stripePayment.status,
      amount: payment.amount,
      currency: payment.currency,
      paidAt: payment.paidAt,
    };
  }

  static async handleWebhook(event: any) {
    try {
      if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;
        await this.confirmPayment(paymentIntent.id);
      } else if (event.type === "payment_intent.payment_failed") {
        const paymentIntent = event.data.object;
        const payment = await db.payment.findFirst({
          where: { stripePaymentIntentId: paymentIntent.id },
        });

        if (payment) {
          await db.payment.update({
            where: { id: payment.id },
            data: { status: "FAILED" as any },
          });

          await db.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: "FAILED" as any },
          });
        }
      }

      return { success: true };
    } catch (err) {
      logger.error("Webhook handling failed", { error: err });
      throw err;
    }
  }

  static async refundPayment(paymentIntentId: string, amount?: number) {
    try {
      const refundData: any = { payment_intent: paymentIntentId };
      if (amount) {
        refundData.amount = amount;
      }

      const refund = await stripe.refunds.create(refundData);

      const payment = await db.payment.findFirst({
        where: { stripePaymentIntentId: paymentIntentId },
      });

      if (payment) {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: "REFUNDED" as any },
        });
      }

      return refund;
    } catch (err) {
      logger.error("Refund failed", { error: err });
      throw err;
    }
  }
}
