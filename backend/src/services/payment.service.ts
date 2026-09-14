import Stripe from "stripe";
import { db } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export const paymentService = {
  // `amount` est exprimé en euros, comme partout dans l'API. Stripe attend la
  // plus petite unité monétaire : sans cette conversion, une commande de 12 €
  // serait débitée 0,12 €.
  async createPaymentIntent(amount: number, customerId: string, orderId: string) {
    return stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "eur",
      customer: customerId,
      metadata: { orderId },
      payment_method_types: ["card"],
    });
  },

  async confirmPayment(paymentIntentId: string) {
    return stripe.paymentIntents.retrieve(paymentIntentId);
  },

  async savePaymentMethod(customerId: string, paymentMethodId: string, storeId: string, isDefault = false) {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const saved = await db.paymentMethod.create({
      data: {
        storeId,
        userId: customerId,
        type: paymentMethod.type as any,
        name: paymentMethod.card?.brand || "Card",
        stripePaymentMethodId: paymentMethodId,
        config: {
          last4: paymentMethod.card?.last4,
          brand: paymentMethod.card?.brand,
        },
        isDefault,
      },
    });

    if (isDefault) {
      await db.paymentMethod.updateMany({
        where: { userId: customerId, id: { not: saved.id } },
        data: { isDefault: false },
      });
    }

    return saved;
  },

  async getUserPaymentMethods(userId: string) {
    return db.paymentMethod.findMany({
      where: { userId },
      orderBy: { isDefault: "desc" },
    });
  },

  async deletePaymentMethod(paymentMethodId: string) {
    await stripe.paymentMethods.detach(paymentMethodId);
    return db.paymentMethod.delete({
      where: { stripePaymentMethodId: paymentMethodId },
    });
  },
};
