import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import Stripe from "stripe";

type Fn = jest.Mock<(...args: any[]) => any>;
const fn = () => jest.fn() as Fn;

const SECRET = "whsec_test_secret";
const vraiStripe = new Stripe("sk_test_factice");

const db: any = {
  $transaction: fn(),
  order: { findUnique: fn(), findUniqueOrThrow: fn(), findMany: fn(), update: fn(), updateMany: fn() },
  payment: { findUnique: fn(), findUniqueOrThrow: fn(), findFirst: fn(), upsert: fn(), update: fn(), updateMany: fn() },
  stripeEvent: { create: fn(), findUnique: fn(), update: fn() },
  refundOperation: { createMany: fn(), findUniqueOrThrow: fn(), findFirst: fn() },
  // Les remboursements sont d'abord cherchés côté ZupDrive : ici l'intention n'en est pas une.
  paymentIntentDrive: { findUnique: fn() },
};

const stripe: any = {
  webhooks: vraiStripe.webhooks,
  paymentIntents: { create: fn(), retrieve: fn(), cancel: fn() },
  refunds: { create: fn(), retrieve: fn(), list: fn() },
  charges: { retrieve: fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../stripe", () => ({
  stripe,
  STRIPE_CONFIG: { currency: "eur", webhookSecret: SECRET },
}));
const annoncerAuCommercant = fn();
const libererUtilisation = fn();
jest.mock("../../marketing/promotion.service", () => ({ PromotionService: { libererUtilisation } }));
const enregistrerOutbox = fn();
const traiterLesDus = fn();
jest.mock("../../jobs/outbox.service", () => ({ Outbox: { enregistrer: enregistrerOutbox, traiterLesDus } }));
jest.mock("../../orders/order.service", () => ({ OrderService: { annoncerAuCommercant } }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const demanderRefund = fn();
const traiterRefunds = fn();
jest.mock("../refund.service", () => ({ RefundService: {
  demander: demanderRefund, traiterLesDus: traiterRefunds, reveiller: async () => false,
  enregistrerPourCommande: async () => db.refundOperation.createMany({ data: { status: "REQUESTED" } }),
} }));

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
  db.payment.findUniqueOrThrow.mockResolvedValue({ refundedAmount: null, status: "SUCCEEDED" });
  db.order.findUniqueOrThrow.mockImplementation(async () => db.order.findUnique());
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
    expect(enregistrerOutbox).toHaveBeenCalledTimes(1);
    expect(enregistrerOutbox.mock.calls[0][0]).toBe("commande.annonce_commercant");
    expect(enregistrerOutbox.mock.calls[0][2]).toMatchObject({ dedupeKey: "annonce-commande-cmd-1" });
  });

  it("un paiement tardif persiste la demande dans la transaction sans appel Stripe", async () => {
    db.order.findUnique.mockResolvedValue(commande({ status: "REJECTED" }));
    const { corps, signature } = signe({ id: "evt_1", type: "payment_intent.succeeded", data: { object: intention() } });
    await paymentService.handleWebhook(corps, signature);
    expect(db.refundOperation.createMany).toHaveBeenCalledTimes(1);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });

  it("A03 : conserve une intention durable avant acquittement même si Stripe est indisponible", async () => {
    db.order.findUnique.mockResolvedValue(commande({ status: "REJECTED", paymentStatus: "SUCCEEDED" }));
    stripe.refunds.create.mockRejectedValue(new Error("Stripe indisponible"));
    const { corps, signature } = signe({ id: "evt-a03", type: "payment_intent.succeeded", data: { object: intention() } });
    await paymentService.handleWebhook(corps, signature);
    expect(db.refundOperation.createMany).toHaveBeenCalled();
    expect(db.refundOperation.createMany.mock.invocationCallOrder[0]).toBeLessThan(db.stripeEvent.update.mock.invocationCallOrder.at(-1));
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
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { id: "ch_1", amount: 2350, amount_refunded: 0 } });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_1", amount: 2350, status: "failed" }] });
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
  it("persiste la demande puis expose une création en attente sans annoncer un succès", async () => {
    db.order.findUnique.mockResolvedValue(commande({ paymentStatus: "SUCCEEDED" }));
    demanderRefund.mockResolvedValue({ id: "op-1" });
    db.refundOperation.findUniqueOrThrow.mockResolvedValue({ id: "op-1", amountCents: 2350, stripeRefundId: null, status: "RETRY" });
    const resultat = await paymentService.rembourserCommande("cmd-1", "Commande refusée");
    expect(demanderRefund).toHaveBeenCalledWith("cmd-1", "Commande refusée", undefined);
    expect(demanderRefund.mock.invocationCallOrder[0]).toBeLessThan(traiterRefunds.mock.invocationCallOrder[0]);
    expect(resultat).toMatchObject({ status: "pending", operationStatus: "RETRY", amount: 2350 });
  });

  it("refund.updated « succeeded » : la commande devient remboursée", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "pay-1", orderId: "cmd-1", refundedAt: null });
    stripe.charges.retrieve.mockResolvedValue({ id: "ch_1", amount: 2350 });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_1", amount: 2350, status: "succeeded" }] });
    const { corps, signature } = signe({
      id: "evt-ref-ok",
      type: "refund.updated",
      data: { object: { id: "re_1", object: "refund", status: "succeeded", payment_intent: "pi_1", charge: "ch_1" } },
    });

    await paymentService.handleWebhook(corps, signature);

    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe("REFUNDED");
  });

  it("charge.refunded avec un remboursement encore en attente : reste payée", async () => {
    stripe.charges.retrieve.mockResolvedValue({ id: "ch_1", payment_intent: "pi_1", amount: 2350, amount_refunded: 2350 });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_1", amount: 2350, status: "pending" }] });
    db.payment.findFirst.mockResolvedValue({ id: "pay-1", orderId: "cmd-1", refundedAt: null });

    await paymentService.marquerRembourse({ id: "ch_1", payment_intent: "pi_1" } as any);

    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe("SUCCEEDED");
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ status: "SUCCEEDED", refundedAmount: null });
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
    expect(enregistrerOutbox).not.toHaveBeenCalled();
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'cmd-1', paymentStatus: { not: 'REFUNDED' } },
      data: { paymentStatus: 'SUCCEEDED', paymentId: 'pi_1' },
    });
  });
  it('un événement partiel ancien utilise le cumul Stripe actuel', async () => {
    stripe.charges.retrieve.mockResolvedValue({ id: 'ch_1', payment_intent: 'pi_1', amount: 2350, amount_refunded: 2350 });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: 're_1', amount: 2350, status: 'succeeded' }] });
    await paymentService.marquerRembourse({ id: 'ch_1', payment_intent: 'pi_1', amount: 2350, amount_refunded: 100 } as any);
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ status: 'REFUNDED', refundedAmount: 23.5 });
    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe('REFUNDED');
  });
  it('un échec de remboursement conserve les remboursements partiels réussis', async () => {
    stripe.paymentIntents.retrieve.mockResolvedValue({ latest_charge: { id: 'ch_1', amount: 2350, amount_refunded: 500 } });
    stripe.refunds.list.mockResolvedValue({ data: [{ id: 're_ok', amount: 500, status: 'succeeded' }, { id: 're_1', amount: 1850, status: 'failed' }] });
    await paymentService.remboursementEchoue({ id: 're_1', payment_intent: 'pi_1' } as any);
    expect(db.payment.update.mock.calls[0][0].data).toMatchObject({ status: 'SUCCEEDED', refundedAmount: 5 });
  });
  it.each([
    { amount_received: 1 }, { amount_received: 99999 }, { currency: 'usd' }, { status: 'processing' },
  ])('refuse le succès incohérent %j sans livrer ni écrire', async (modifications) => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = signe({ id: 'evt-invalid', type: 'payment_intent.succeeded', data: { object: intention(modifications) } });
    await expect(paymentService.handleWebhook(corps, signature)).rejects.toMatchObject({ statusCode: 409 });
    expect(db.payment.upsert).not.toHaveBeenCalled(); expect(db.order.update).not.toHaveBeenCalled();
    expect(enregistrerOutbox).not.toHaveBeenCalled();
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

  it("rend l'utilisation du code promo d'une commande abandonnée, une seule fois (C-15)", async () => {
    db.order.findMany.mockResolvedValue([{ id: "cmd-1", paymentId: null, storeId: "s1", promoCode: "BIENVENUE" }]);
    db.order.updateMany.mockResolvedValue({ count: 1 });
    await paymentService.abandonnerLesPaiementsNonAboutis();
    expect(libererUtilisation).toHaveBeenCalledWith("s1", "BIENVENUE");

    // Retirée entre-temps par un autre passage : rien à rendre de plus.
    libererUtilisation.mockClear();
    db.order.updateMany.mockResolvedValue({ count: 0 });
    await paymentService.abandonnerLesPaiementsNonAboutis();
    expect(libererUtilisation).not.toHaveBeenCalled();
  });

  it("transmet au lieu de retirer si l'encaissement a eu lieu sans webhook", async () => {
    db.order.findMany.mockResolvedValue([{ id: "cmd-1", paymentId: "pi_1" }]);
    stripe.paymentIntents.retrieve.mockResolvedValue(intention());
    db.order.findUnique.mockResolvedValue(commande({ submittedAt: null }));
    db.order.updateMany.mockResolvedValue({ count: 1 });

    expect(await paymentService.abandonnerLesPaiementsNonAboutis()).toBe(0);
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
    expect(enregistrerOutbox).toHaveBeenCalledTimes(1);
    expect(enregistrerOutbox.mock.calls[0][0]).toBe("commande.annonce_commercant");
    expect(enregistrerOutbox.mock.calls[0][2]).toMatchObject({ dedupeKey: "annonce-commande-cmd-1" });
  });
});

describe("journal des événements Stripe", () => {
  const evenementPaye = () =>
    signe({ id: "evt-dup", type: "payment_intent.succeeded", data: { object: intention() } });

  it("inscrit l'événement puis le marque traité", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = evenementPaye();
    await paymentService.handleWebhook(corps, signature);
    expect(db.stripeEvent.create.mock.calls[0][0].data).toMatchObject({ id: "evt-dup", type: "payment_intent.succeeded" });
    expect(db.stripeEvent.update.mock.calls.at(-1)[0].data.processedAt).toBeInstanceOf(Date);
  });

  it("un événement déjà traité n'a aucun effet", async () => {
    db.stripeEvent.create.mockRejectedValue({ code: "P2002" });
    db.stripeEvent.findUnique.mockResolvedValue({ processedAt: new Date() });
    const { corps, signature } = evenementPaye();
    await paymentService.handleWebhook(corps, signature);
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(db.payment.upsert).not.toHaveBeenCalled();
    expect(enregistrerOutbox).not.toHaveBeenCalled();
  });

  it("un événement dont le traitement a échoué est repris au renvoi de Stripe", async () => {
    db.stripeEvent.create.mockRejectedValue({ code: "P2002" });
    db.stripeEvent.findUnique.mockResolvedValue({ processedAt: null });
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = evenementPaye();
    await paymentService.handleWebhook(corps, signature);
    expect(db.stripeEvent.update.mock.calls[0][0].data).toEqual({ attempts: { increment: 1 } });
    expect(db.stripeEvent.update.mock.calls.at(-1)[0].data.processedAt).toBeInstanceOf(Date);
  });

  it("un échec de traitement reste visible et laisse l'événement à rejouer", async () => {
    db.order.findUnique.mockResolvedValue(commande());
    const { corps, signature } = signe({ id: "evt-ko", type: "payment_intent.succeeded", data: { object: intention({ amount_received: 1 }) } });
    await expect(paymentService.handleWebhook(corps, signature)).rejects.toMatchObject({ statusCode: 409 });
    const ecritures = db.stripeEvent.update.mock.calls.map((c: any) => c[0].data);
    expect(ecritures.some((d: any) => d.lastError)).toBe(true);
    expect(ecritures.some((d: any) => d.processedAt)).toBe(false);
  });

  it("un litige carte est inscrit au journal avec sa commande", async () => {
    db.payment.findFirst.mockResolvedValue({ orderId: "cmd-1" });
    const { corps, signature } = signe({
      id: "evt-litige",
      type: "charge.dispute.created",
      data: { object: { id: "dp_1", object: "dispute", amount: 2350, currency: "eur", reason: "fraudulent", status: "needs_response", payment_intent: "pi_1" } },
    });
    await paymentService.handleWebhook(corps, signature);
    const inscrit = db.stripeEvent.update.mock.calls.map((c: any) => c[0].data).find((d: any) => d.detail);
    expect(inscrit).toMatchObject({ objectId: "dp_1", orderId: "cmd-1", detail: { montant: 2350, motif: "fraudulent" } });
  });
});

describe("annonce au commerçant après encaissement (C-10)", () => {
  it("l'annonce est écrite dans la même transaction que la transmission", async () => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
    await paymentService.transmettreAuCommercant("cmd-1");
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(enregistrerOutbox.mock.calls[0][2].tx).toBe(db);
  });

  it("déjà transmise : aucune seconde annonce", async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    expect(await paymentService.transmettreAuCommercant("cmd-1")).toBe(false);
    expect(enregistrerOutbox).not.toHaveBeenCalled();
  });

  it("l'outbox indisponible à l'instant T ne fait pas échouer la transmission", async () => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
    traiterLesDus.mockRejectedValue(new Error("redémarrage"));
    await expect(paymentService.transmettreAuCommercant("cmd-1")).resolves.toBe(true);
  });

  it("l'échec d'écriture de l'annonce remonte : la transaction n'est pas validée sans elle", async () => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
    enregistrerOutbox.mockRejectedValue(new Error("base coupée"));
    db.$transaction.mockImplementation(async (traitement: any) => traitement(db));
    await expect(paymentService.transmettreAuCommercant("cmd-1")).rejects.toThrow("base coupée");
  });
});
