import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Stripe from "stripe";

type Fn = jest.Mock<(...args: any[]) => any>;
const fn = () => jest.fn() as Fn;

const SECRET = "whsec_test_secret";
const vraiStripe = new Stripe("sk_test_factice");

const db: any = {
  order: { findUnique: fn(), update: fn(), updateMany: fn() },
  payment: { findFirst: fn(), upsert: fn(), update: fn(), updateMany: fn() },
};

const stripe: any = {
  webhooks: vraiStripe.webhooks,
  paymentIntents: { create: fn(), retrieve: fn(), cancel: fn() },
  refunds: { create: fn() },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/stripe", () => ({
  stripe,
  STRIPE_CONFIG: { currency: "eur", webhookSecret: SECRET },
}));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { paymentService } from "../payment.service";

function signe(evenement: object) {
  const corps = JSON.stringify(evenement);
  const signature = vraiStripe.webhooks.generateTestHeaderString({ payload: corps, secret: SECRET });
  return { corps: Buffer.from(corps), signature };
}

const intention = (surcharge: object = {}) => ({
  id: "pi_1",
  object: "payment_intent",
  amount: 2350,
  amount_received: 2350,
  status: "succeeded",
  metadata: { orderId: "cmd-1" },
  ...surcharge,
});

const commande = (surcharge: object = {}) => ({
  id: "cmd-1",
  storeId: "boutique-1",
  status: "ACCEPTED",
  totalAmount: 23.5,
  paymentStatus: "PENDING",
  paymentId: "pi_1",
  customerEmail: "client@exemple.fr",
  deletedAt: null,
  payments: [{ id: "pay-1", stripePaymentIntentId: "pi_1", refundedAt: null }],
  ...surcharge,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("webhook Stripe", () => {
  it("refuse un événement mal signé", async () => {
    const { corps } = signe({ id: "evt_1", type: "payment_intent.succeeded", data: { object: intention() } });

    await expect(paymentService.handleWebhook(corps, "t=1,v1=faux")).rejects.toMatchObject({ statusCode: 400 });
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("marque la commande payée à l'encaissement", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: intention() },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "cmd-1" },
      data: { paymentStatus: "SUCCEEDED", paymentId: "pi_1" },
    });
    expect(db.payment.upsert.mock.calls[0][0].update.status).toBe("SUCCEEDED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("rembourse aussitôt un paiement arrivé après le refus", async () => {
    db.order.findUnique
      .mockResolvedValueOnce(commande({ status: "REJECTED" }))
      .mockResolvedValueOnce(commande({ status: "REJECTED", paymentStatus: "SUCCEEDED" }));
    stripe.refunds.create.mockResolvedValue({ id: "re_1", amount: 2350, status: "succeeded" });
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: intention() },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(stripe.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1" }),
      { idempotencyKey: "remboursement-cmd-1" }
    );
    expect(db.order.update).toHaveBeenLastCalledWith({
      where: { id: "cmd-1" },
      data: { paymentStatus: "REFUNDED" },
    });
  });

  it("n'écrase pas un remboursement par un « payé » en retard", async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: "REFUNDED" }));
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: intention() },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("note l'échec sans écraser un paiement réussi", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "payment_intent.payment_failed",
      data: { object: intention({ status: "requires_payment_method" }) },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: "cmd-1", paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });
  });

  it("repasse la commande en « payée » si le remboursement échoue", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "pay-1", orderId: "cmd-1" });
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "refund.failed",
      data: { object: { id: "re_1", object: "refund", status: "failed", payment_intent: "pi_1" } },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "cmd-1" },
      data: { paymentStatus: "SUCCEEDED" },
    });
  });
});

describe("rembourserCommande", () => {
  it("rembourse une commande payée", async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: "SUCCEEDED" }));
    stripe.refunds.create.mockResolvedValue({ id: "re_1", amount: 2350, status: "pending" });

    const remboursement = await paymentService.rembourserCommande("cmd-1", "Commande refusée");

    expect(remboursement).toMatchObject({ id: "re_1" });
    expect(db.payment.upsert.mock.calls[0][0].update).toMatchObject({
      status: "REFUNDED",
      stripeRefundId: "re_1",
      refundedAmount: 23.5,
    });
  });

  it("annule l'intention d'une commande pas encore payée", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "requires_payment_method" });

    const remboursement = await paymentService.rembourserCommande("cmd-1", "Commande refusée");

    expect(remboursement).toBeNull();
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("ne fait rien pour une commande payée en liquide", async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentId: null, payments: [] }));

    expect(await paymentService.rembourserCommande("cmd-1", "Commande refusée")).toBeNull();
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
});

describe("createPaymentIntent", () => {
  it("prend le montant de la commande, pas celui du navigateur, et l'enregistre", async () => {
    db.order.findUnique.mockResolvedValue(commande({ payments: [] }));
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_2", client_secret: "pi_2_secret", status: "requires_payment_method", amount: 2350 });

    await paymentService.createPaymentIntent("cmd-1");

    expect(stripe.paymentIntents.create.mock.calls[0][0]).toMatchObject({
      amount: 2350,
      metadata: { orderId: "cmd-1", storeId: "boutique-1" },
    });
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "cmd-1" },
      data: { paymentId: "pi_2", paymentStatus: "PENDING" },
    });
  });

  it("reprend l'intention encore ouverte au lieu d'en créer une seconde", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "requires_payment_method", amount: 2350 });

    const resultat = await paymentService.createPaymentIntent("cmd-1");

    expect(resultat.id).toBe("pi_1");
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuse de faire payer une commande déjà payée", async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: "SUCCEEDED" }));

    await expect(paymentService.createPaymentIntent("cmd-1")).rejects.toMatchObject({ statusCode: 409 });
  });
});
