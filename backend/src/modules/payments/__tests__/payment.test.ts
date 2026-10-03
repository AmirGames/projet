import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Stripe from "stripe";

type Fn = jest.Mock<(...args: any[]) => any>;
const fn = () => jest.fn() as Fn;

const SECRET = "whsec_test_secret";
const vraiStripe = new Stripe("sk_test_factice");

const db: any = {
  $transaction: fn(),
  order: { findUnique: fn(), findMany: fn(), update: fn(), updateMany: fn() },
  payment: { findFirst: fn(), upsert: fn(), update: fn(), updateMany: fn() },
};

const stripe: any = {
  webhooks: vraiStripe.webhooks,
  paymentIntents: { create: fn(), retrieve: fn(), cancel: fn() },
  refunds: { create: fn() },
  charges: { retrieve: fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../stripe", () => ({
  stripe,
  STRIPE_CONFIG: { currency: "eur", webhookSecret: SECRET },
}));
const annoncerAuCommercant = fn();
jest.mock("../../orders/order.service", () => ({ OrderService: { annoncerAuCommercant } }));
jest.mock("../../../config/logger", () => ({
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
  currency: "eur",
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
  jest.resetAllMocks();
  db.order.updateMany.mockImplementation(async ({ where }: any) => ({ count: where.paymentStatus?.not === 'REFUNDED' ? 1 : 0 }));
  db.$transaction.mockImplementation(async (traitement: any) => traitement(db));
  db.payment.findFirst.mockResolvedValue({ id: "pay-1", orderId: "cmd-1", stripeRefundId: "re_1" });
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

    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: "cmd-1", paymentStatus: { not: 'REFUNDED' } },
      data: { paymentStatus: "SUCCEEDED", paymentId: "pi_1" },
    });
    expect(db.payment.upsert.mock.calls[0][0].update.status).toBe("SUCCEEDED");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("transmet la commande au commerçant une fois payée, une seule fois", async () => {
    db.order.findUnique.mockResolvedValue(commande({ submittedAt: null }));
    let transmis = false;
    db.order.updateMany.mockImplementation(async ({ where }: any) => {
      if (where.paymentStatus?.not === 'REFUNDED') return { count: 1 };
      const count = transmis ? 0 : 1; transmis = true; return { count };
    });
    const { corps, signature } = signe({
      id: "evt_1",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: intention() },
    });

    await paymentService.handleWebhook(corps, signature);
    await paymentService.handleWebhook(corps, signature);

    expect(db.order.updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: "cmd-1", submittedAt: null, status: "PENDING", deletedAt: null, paymentStatus: 'SUCCEEDED' },
    });
    expect(annoncerAuCommercant).toHaveBeenCalledTimes(1);
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
    db.payment.findFirst.mockResolvedValue({ id: "pay-1", orderId: "cmd-1", stripeRefundId: "re_1" });
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { amount: 2350, amount_refunded: 0 } });
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
  it.each(['processing', 'requires_capture', 'succeeded'])("ne crée aucun second paiement pendant %s", async (status) => {
    db.order.findUnique.mockResolvedValue(commande());
    stripe.paymentIntents.retrieve.mockResolvedValue(intention({ status }));
    expect((await paymentService.createPaymentIntent('cmd-1')).id).toBe('pi_1');
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('deux premières demandes concurrentes utilisent la même clé Stripe', async () => {
    db.order.findUnique.mockResolvedValue(commande({ payments: [] }));
    stripe.paymentIntents.create.mockResolvedValue(intention());
    await Promise.all([paymentService.createPaymentIntent('cmd-1'), paymentService.createPaymentIntent('cmd-1')]);
    expect(stripe.paymentIntents.create.mock.calls.map((args: any[]) => args[1])).toEqual([
      { idempotencyKey: 'commande-cmd-1-initial' }, { idempotencyKey: 'commande-cmd-1-initial' },
    ]);
  });

  it('montant modifié : aucun second paiement tant que le premier est actif', async () => {
    db.order.findUnique.mockResolvedValue(commande());
    stripe.paymentIntents.retrieve.mockResolvedValue(intention({ amount: 1 }));
    await expect(paymentService.createPaymentIntent('cmd-1')).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
  it("prend le montant de la commande, pas celui du navigateur, et l'enregistre", async () => {
    db.order.findUnique.mockResolvedValue(commande({ payments: [] }));
    stripe.paymentIntents.create.mockResolvedValue({ id: "pi_2", client_secret: "pi_2_secret", status: "requires_payment_method", amount: 2350 });

    await paymentService.createPaymentIntent("cmd-1");

    expect(stripe.paymentIntents.create.mock.calls[0][0]).toMatchObject({
      amount: 2350,
      metadata: { orderId: "cmd-1", storeId: "boutique-1" },
    });
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: "cmd-1", paymentStatus: { in: ['PENDING', 'FAILED'] } },
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

describe('intégrité des événements Stripe', () => {
  it('remboursement concurrent après la lecture : ne réécrit plus payé', async () => {
    db.order.findUnique.mockResolvedValue(commande());
    db.order.updateMany.mockResolvedValueOnce({ count: 0 });
    await paymentService.marquerPaye(intention() as any);
    expect(db.payment.upsert).not.toHaveBeenCalled();
    expect(annoncerAuCommercant).not.toHaveBeenCalled();
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'cmd-1', paymentStatus: { not: 'REFUNDED' } },
      data: { paymentStatus: 'SUCCEEDED', paymentId: 'pi_1' },
    });
  });
  it('un événement partiel ancien utilise le cumul Stripe actuel', async () => {
    stripe.charges.retrieve.mockResolvedValue({ id: 'ch_1', payment_intent: 'pi_1', amount: 2350, amount_refunded: 2350 });
    await paymentService.marquerRembourse({ id: 'ch_1', payment_intent: 'pi_1', amount: 2350, amount_refunded: 100 } as any);
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ status: 'REFUNDED', refundedAmount: 23.5 });
    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe('REFUNDED');
  });
  it('un échec de remboursement conserve les remboursements partiels réussis', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { amount: 2350, amount_refunded: 500 } });
    await paymentService.remboursementEchoue({ id: 're_1', payment_intent: 'pi_1' } as any);
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCEEDED', refundedAmount: 5 });
  });
  it('Stripe refuse immédiatement le remboursement : ne marque pas remboursé', async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: 'SUCCEEDED' }));
    stripe.refunds.create.mockResolvedValue({ id: 're_failed', status: 'failed', amount: 2350 });
    await expect(paymentService.rembourserCommande('cmd-1', 'test')).rejects.toMatchObject({ code: 'REFUND_FAILED' });
    expect(db.order.update).not.toHaveBeenCalled(); expect(db.payment.upsert).not.toHaveBeenCalled();
    expect(db.payment.updateMany).toHaveBeenCalledWith({ where: { orderId: 'cmd-1' }, data: { stripeRefundId: 're_failed' } });
  });
  it('après un remboursement échoué, une nouvelle tentative a une autre clé', async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: 'SUCCEEDED', payments: [{ stripePaymentIntentId: 'pi_1', stripeRefundId: 're_failed' }] }));
    stripe.refunds.create.mockResolvedValue({ id: 're_new', status: 'succeeded', amount: 2350 });
    await paymentService.rembourserCommande('cmd-1', 'test');
    expect(stripe.refunds.create.mock.calls[0][1]).toEqual({ idempotencyKey: 'remboursement-cmd-1-re_failed' });
  });
  it.each([
    { amount_received: 1 }, { amount_received: 99999 }, { currency: 'usd' }, { status: 'processing' },
  ])('refuse le succès incohérent %j sans livrer ni écrire', async (modifications) => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = signe({ id: 'evt-invalid', type: 'payment_intent.succeeded', data: { object: intention(modifications) } });
    await expect(paymentService.handleWebhook(corps, signature)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.payment.upsert).not.toHaveBeenCalled(); expect(db.order.update).not.toHaveBeenCalled();
    expect(annoncerAuCommercant).not.toHaveBeenCalled();
  });
  it('la métadonnée seule ne rattache pas un paiement inconnu', async () => {
    db.payment.findFirst.mockResolvedValue(null);
    expect(await paymentService.marquerPaye(intention() as any)).toBeNull();
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });
  it('la métadonnée ne peut remplacer la commande du paiement enregistré', async () => {
    await expect(paymentService.marquerPaye(intention({ metadata: { orderId: 'bob' } }) as any))
      .rejects.toMatchObject({ code: 'PAYMENT_ORDER_MISMATCH' });
    expect(db.order.update).not.toHaveBeenCalled();
  });
  it('échec d’un ancien remboursement : garde le remboursement actuel intact', async () => {
    db.payment.findFirst.mockResolvedValue({ id: 'pay-1', orderId: 'cmd-1', stripeRefundId: 're-new' });
    await paymentService.remboursementEchoue({ id: 're-old', payment_intent: 'pi_1' } as any);
    expect(db.payment.update).not.toHaveBeenCalled(); expect(db.order.update).not.toHaveBeenCalled();
  });
  it('signature manquante : aucune écriture', async () => {
    await expect(paymentService.handleWebhook(Buffer.from('{}'), undefined)).rejects.toMatchObject({ code: 'STRIPE_SIGNATURE_MISSING' });
    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe("abandonnerLesPaiementsNonAboutis", () => {
  it("retire une commande jamais payée et annule son intention", async () => {
    db.order.findMany.mockResolvedValue([{ id: "cmd-1", paymentId: "pi_1" }]);
    stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_1", status: "requires_payment_method" });

    expect(await paymentService.abandonnerLesPaiementsNonAboutis()).toBe(1);
    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_1");
    expect(db.order.updateMany.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it("transmet au lieu de retirer si l'encaissement a eu lieu sans webhook", async () => {
    db.order.findMany.mockResolvedValue([{ id: "cmd-1", paymentId: "pi_1" }]);
    stripe.paymentIntents.retrieve.mockResolvedValue(intention());
    db.order.findUnique.mockResolvedValue(commande({ submittedAt: null }));
    db.order.updateMany.mockResolvedValue({ count: 1 });

    expect(await paymentService.abandonnerLesPaiementsNonAboutis()).toBe(0);
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(annoncerAuCommercant).toHaveBeenCalledTimes(1);
  });
});
