import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";

const SECRET = "whsec_a03_local_test";
const signatureStripe = new Stripe("sk_test_factice");
const api = {
  webhooks: signatureStripe.webhooks,
  paymentIntents: { retrieve: jest.fn<(...args: any[]) => Promise<any>>() },
  refunds: {
    list: jest.fn<(...args: any[]) => Promise<any>>(),
    create: jest.fn<(...args: any[]) => Promise<any>>(),
  },
};
jest.mock("../stripe", () => ({
  stripe: api,
  STRIPE_CONFIG: { currency: "eur", webhookSecret: SECRET },
}));
jest.mock("../../realtime/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitMerchantEvent: jest.fn(),
  emitNotification: jest.fn(),
}));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../../../config/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("../../zupdrive/zupdrive-payment.service", () => ({
  ZupDrivePaymentService: {
    estUnPaiementDrive: () => false,
    surRemboursement: async () => false,
  },
}));

import { db } from "../../../services/db";
import { RefundService } from "../refund.service";
import { paymentService } from "../payment.service";
import { OrderAcceptanceService } from "../../orders/order-acceptance.service";

// Base réelle, jamais une base de production. Activée explicitement en CI.
const integration =
  process.env.REFUND_INTEGRATION === "true" ? describe : describe.skip;
integration("A03 — transactions PostgreSQL et Stripe simulé", () => {
  const prefixe = `a03-${randomUUID()}`;
  let storeId: string;
  let orderId: string;
  let paymentId: string;
  let intentionId: string;
  let externe: any[] = [];
  let montant = 3574; // 32,74 € + 3 € de pourboire
  let statut = "succeeded";
  let perteReponse = false;
  const cles = new Map<string, any>();

  const intention = () => ({
    id: intentionId,
    object: "payment_intent",
    status: "succeeded",
    currency: "eur",
    amount: montant,
    amount_received: montant,
    metadata: { orderId },
  });
  const operation = () =>
    db.refundOperation.findUniqueOrThrow({ where: { paymentId } });
  const evenement = async (
    type = "payment_intent.succeeded",
    objet: any = intention(),
    id = `evt-${randomUUID()}`,
  ) => {
    const payload = JSON.stringify({
      id,
      object: "event",
      type,
      data: { object: objet },
    });
    await paymentService.handleWebhook(
      Buffer.from(payload),
      signatureStripe.webhooks.generateTestHeaderString({
        payload,
        secret: SECRET,
      }),
    );
    return id;
  };
  const payer = () => evenement();
  const travailler = async () => {
    const op = await operation();
    await RefundService.traiterLesDus(
      1,
      new Date(Math.max(Date.now(), op.nextAttemptAt.getTime()) + 1),
      op.id,
    );
    return operation();
  };
  const refund = (surcharge: object = {}) => ({
    id: `re-${randomUUID()}`,
    payment_intent: intentionId,
    amount: 3574,
    currency: "eur",
    status: "succeeded",
    metadata: {},
    ...surcharge,
  });

  beforeAll(async () => {
    if (!/test/i.test(new URL(process.env.DATABASE_URL!).pathname))
      throw new Error("Une base de test dédiée est obligatoire");
    const org = await db.organization.create({
      data: { name: prefixe, slug: prefixe },
    });
    const store = await db.store.create({
      data: { orgId: org.id, name: prefixe, slug: prefixe },
    });
    storeId = store.id;
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    externe = [];
    cles.clear();
    montant = 3574;
    statut = "succeeded";
    perteReponse = false;
    const order = await db.order.create({
      data: {
        storeId,
        customerName: "Test A03",
        customerEmail: "a03@example.test",
        customerPhone: "000000000",
        deliveryType: "PICKUP",
        status: "REJECTED",
        submittedAt: null,
        totalAmount: 32.74,
        tipAmount: 3,
        taxAmount: 0,
        feesAmount: 0,
      },
    });
    orderId = order.id;
    intentionId = `pi-${randomUUID()}`;
    const payment = await db.payment.create({
      data: { orderId, amount: 35.74, stripePaymentIntentId: intentionId },
    });
    paymentId = payment.id;
    api.paymentIntents.retrieve.mockImplementation(async () => intention());
    api.refunds.list.mockImplementation(async ({ starting_after }: any) => {
      const start = starting_after
        ? externe.findIndex((r) => r.id === starting_after) + 1
        : 0;
      return {
        data: externe.slice(start, start + 100),
        has_more: externe.length > start + 100,
      };
    });
    api.refunds.create.mockImplementation(
      async (payload: any, options: any) => {
        let r = cles.get(options.idempotencyKey);
        if (!r) {
          r = refund({
            amount: payload.amount,
            metadata: payload.metadata,
            status: statut,
          });
          cles.set(options.idempotencyKey, r);
          externe.push(r);
        }
        if (perteReponse)
          throw new Error("Réponse perdue après création chez Stripe");
        return r;
      },
    );
  });
  afterAll(async () => {
    const ids = (
      await db.payment.findMany({
        where: { order: { storeId } },
        select: { id: true },
      })
    ).map((p) => p.id);
    await db.refundOperationEvent.deleteMany({
      where: { operation: { paymentId: { in: ids } } },
    });
    await db.refundOperation.deleteMany({ where: { paymentId: { in: ids } } });
    await db.stripeEvent.deleteMany({
      where: {
        orderId: {
          in: (
            await db.order.findMany({
              where: { storeId },
              select: { id: true },
            })
          ).map((o) => o.id),
        },
      },
    });
    const store = await db.store.findUnique({ where: { id: storeId } });
    if (store) await db.organization.delete({ where: { id: store.orgId } });
    await db.$disconnect();
  });

  it("acquitte seulement après persistance, sans Stripe dans la transaction", async () => {
    const eventId = await payer();
    expect(
      (await db.stripeEvent.findUniqueOrThrow({ where: { id: eventId } }))
        .processedAt,
    ).not.toBeNull();
    expect(await operation()).toMatchObject({
      status: "REQUESTED",
      amountCents: 3574,
      currency: "eur",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect(api.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
  it("panne avant réponse : reprise durable, montant et pourboire inchangés", async () => {
    await payer();
    api.refunds.create.mockRejectedValueOnce(new Error("Panne Stripe"));
    expect((await travailler()).status).toBe("RETRY");
    expect((await operation()).stripeRefundId).toBeNull();
    expect((await travailler()).status).toBe("SUCCEEDED");
    expect(externe).toHaveLength(1);
    const paiement = await db.payment.findUniqueOrThrow({
      where: { id: paymentId },
    });
    expect(Number(paiement.amount)).toBe(35.74);
    expect(Number(paiement.refundedAmount)).toBe(35.74);
    expect(
      (
        await db.order.findUniqueOrThrow({ where: { id: orderId } })
      ).tipAmount.toString(),
    ).toBe("3");
  });
  it("réponse perdue après remboursement : retrouve l'opération sans second POST", async () => {
    await payer();
    perteReponse = true;
    expect((await travailler()).status).toBe("RETRY");
    expect((await operation()).stripeRefundId).toBeNull();
    perteReponse = false;
    expect((await travailler()).status).toBe("SUCCEEDED");
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
    expect(externe).toHaveLength(1);
  });
  it("redémarrage après appel : un bail expiré est repris et réconcilié", async () => {
    await payer();
    const op = await operation();
    externe.push(refund({ metadata: { refundOperationId: op.id } }));
    await db.refundOperation.update({
      where: { id: op.id },
      data: {
        status: "PROCESSING",
        lockedUntil: new Date(0),
        firstCallAt: new Date(),
        attempts: 1,
      },
    });
    expect((await travailler()).status).toBe("SUCCEEDED");
    expect(api.refunds.create).not.toHaveBeenCalled();
  });
  it("webhook signé doublé et événement distinct retardé : une seule opération", async () => {
    const id = await payer();
    const paidAt = (
      await db.payment.findUniqueOrThrow({ where: { id: paymentId } })
    ).paidAt;
    await evenement("payment_intent.succeeded", intention(), id);
    await payer();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).paidAt,
    ).toEqual(paidAt);
    expect(await db.refundOperation.count({ where: { paymentId } })).toBe(1);
    await travailler();
    await payer();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } }))
        .paymentStatus,
    ).toBe("REFUNDED");
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("deux workers concurrents : une seule prise et un seul remboursement", async () => {
    await payer();
    const op = await operation();
    await Promise.all(
      Array.from({ length: 6 }, () =>
        RefundService.traiterLesDus(1, new Date(), op.id),
      ),
    );
    expect((await operation()).status).toBe("SUCCEEDED");
    expect(externe).toHaveLength(1);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("un worker dont le bail a été repris ne peut pas écraser son successeur", async () => {
    await payer();
    const vieux = await operation();
    await db.refundOperation.update({
      where: { id: vieux.id },
      data: { status: "PROCESSING", version: 2 },
    });
    await RefundService.terminer(
      { ...vieux, status: "PROCESSING", version: 1 },
      "ABANDONED",
      { lastError: "OLD_WORKER" },
      new Date(),
    );
    expect((await operation()).version).toBe(2);
    expect((await operation()).status).toBe("PROCESSING");
  });
  it.each(["pending", "requires_action"])(
    "création %s : reste payé jusqu'à réussite réelle",
    async (status) => {
      await payer();
      statut = status;
      expect((await travailler()).status).toBe("WAITING_STRIPE");
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: paymentId } }))
          .status,
      ).toBe("SUCCEEDED");
      externe[0].status = "succeeded";
      await evenement("refund.updated", { ...externe[0], status: "pending" }); // ancien payload
      expect((await travailler()).status).toBe("SUCCEEDED");
      await evenement("refund.failed", { ...externe[0], status: "failed" });
      expect((await operation()).status).toBe("SUCCEEDED");
      expect(api.refunds.create).toHaveBeenCalledTimes(1);
    },
  );
  it("webhook remboursement avant webhook payé : son état actuel réconcilie la commande", async () => {
    await payer();
    externe.push(refund());
    await evenement("charge.refunded", {
      id: "ch-test",
      payment_intent: intentionId,
    });
    await travailler();
    await payer();
    expect((await operation()).status).toBe("SUCCEEDED");
    expect(api.refunds.create).not.toHaveBeenCalled();
  });
  it("montant Stripe incohérent : alerte et aucun mouvement", async () => {
    await payer();
    montant = 1;
    expect(await travailler()).toMatchObject({
      status: "ABANDONED",
      lastError: "REFUND_AMOUNT_MISMATCH",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
  });
  it("montant webhook incorrect : transaction non validée, webhook non acquitté", async () => {
    montant = 1;
    await expect(payer()).rejects.toMatchObject({
      code: "PAYMENT_AMOUNT_MISMATCH",
    });
    expect(await db.refundOperation.count({ where: { paymentId } })).toBe(0);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status,
    ).toBe("PENDING");
  });
  it("rollback de l'intention : le webhook reste reprenable", async () => {
    const spy = jest
      .spyOn(RefundService, "enregistrerPourCommande")
      .mockRejectedValueOnce(new Error("Insertion impossible"));
    await expect(payer()).rejects.toThrow("Insertion impossible");
    spy.mockRestore();
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status,
    ).toBe("PENDING");
    expect(await db.refundOperation.count({ where: { paymentId } })).toBe(0);
    expect(
      await db.stripeEvent.count({ where: { orderId, processedAt: null } }),
    ).toBe(1);
    await payer();
    expect((await operation()).status).toBe("REQUESTED");
  });
  it("abandon de commande : le paiement tardif conserve le soft-delete et se rembourse", async () => {
    await db.order.update({
      where: { id: orderId },
      data: { status: "PENDING", deletedAt: new Date() },
    });
    await payer();
    await travailler();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: orderId } })).deletedAt,
    ).not.toBeNull();
    expect((await operation()).status).toBe("SUCCEEDED");
  });
  it("refus métier payé : commit de l'intention malgré panne Stripe", async () => {
    await db.order.update({
      where: { id: orderId },
      data: {
        status: "ACCEPTED",
        submittedAt: new Date(),
        paymentStatus: "SUCCEEDED",
      },
    });
    await db.payment.update({
      where: { id: paymentId },
      data: { status: "SUCCEEDED" },
    });
    const notification = jest
      .spyOn(OrderAcceptanceService, "prevenirLeClient")
      .mockResolvedValue(undefined);
    api.refunds.create.mockRejectedValueOnce(new Error("Stripe indisponible"));
    try {
      const refusee = await OrderAcceptanceService.refuser(
        storeId,
        orderId,
        "TOO_BUSY",
      );
      expect(refusee.status).toBe("REJECTED");
      expect((await operation()).status).toBe("RETRY");
      expect((await travailler()).status).toBe("SUCCEEDED");
    } finally {
      notification.mockRestore();
    }
  });
  it("course entre paiement et refus : aucun encaissement refusé sans intention", async () => {
    await db.order.update({
      where: { id: orderId },
      data: { status: "ACCEPTED", submittedAt: new Date() },
    });
    const notification = jest
      .spyOn(OrderAcceptanceService, "prevenirLeClient")
      .mockResolvedValue(undefined);
    try {
      await Promise.all([
        payer(),
        OrderAcceptanceService.refuser(storeId, orderId, "TOO_BUSY"),
      ]);
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
      ).toBe("REJECTED");
      expect(await db.refundOperation.count({ where: { paymentId } })).toBe(1);
      await travailler();
      expect((await operation()).status).toBe("SUCCEEDED");
    } finally {
      notification.mockRestore();
    }
  });
  it("reprise auditée : conserve clé et fenêtre après perte de réponse", async () => {
    await payer();
    api.refunds.create.mockRejectedValueOnce(new Error("Stripe indisponible"));
    await travailler();
    const avant = await operation();
    const admin = await db.user.create({
      data: {
        email: `${prefixe}@example.test`,
        passwordHash: await bcrypt.hash("MotDePasseTestA03!", 4),
        name: "Test A03",
      },
    });
    try {
      const reprise = await RefundService.reprendre(
        orderId,
        "Reprise après panne",
        admin.id,
      );
      expect(reprise.idempotencyKey).toBe(avant.idempotencyKey);
      expect(reprise.firstCallAt).toEqual(avant.firstCallAt);
      expect(
        await db.systemAuditLog.count({
          where: { adminId: admin.id, action: "REFUND_RETRY", target: orderId },
        }),
      ).toBe(1);
      expect((await travailler()).status).toBe("SUCCEEDED");
    } finally {
      await db.systemAuditLog.deleteMany({ where: { adminId: admin.id } });
      await db.user.delete({ where: { id: admin.id } });
    }
  });
  it("échec Stripe définitif : reprise de réconciliation sans seconde création", async () => {
    await payer();
    statut = "failed";
    expect((await travailler()).status).toBe("ABANDONED");
    externe.push(refund({ amount: 100 }));
    await evenement("refund.failed", externe[0]);
    expect((await travailler()).status).toBe("ABANDONED");
    expect(
      Number(
        (await db.payment.findUniqueOrThrow({ where: { id: paymentId } }))
          .refundedAmount,
      ),
    ).toBe(1);
    expect(api.refunds.create).toHaveBeenCalledTimes(1);
  });
  it("fenêtre Stripe expirée : réconciliation seulement, aucun deuxième mouvement", async () => {
    await payer();
    const op = await operation();
    await db.refundOperation.update({
      where: { id: op.id },
      data: { firstCallAt: new Date(0) },
    });
    expect(await travailler()).toMatchObject({
      status: "ABANDONED",
      lastError: "REFUND_IDEMPOTENCY_WINDOW_EXPIRED",
    });
    expect(api.refunds.create).not.toHaveBeenCalled();
  });
  it("remboursement partiel : conserve le montant rendu et exige un examen", async () => {
    await payer();
    externe.push(refund({ amount: 100 }));
    expect((await travailler()).status).toBe("ABANDONED");
    expect(api.refunds.create).not.toHaveBeenCalled();
    expect(
      Number(
        (await db.payment.findUniqueOrThrow({ where: { id: paymentId } }))
          .refundedAmount,
      ),
    ).toBe(1);
  });
  it("pagination : un succès au-delà des 100 premiers remboursements est retrouvé", async () => {
    await payer();
    externe.push(
      ...Array.from({ length: 100 }, () =>
        refund({ status: "failed", amount: 1 }),
      ),
      refund(),
    );
    expect((await travailler()).status).toBe("SUCCEEDED");
    expect(api.refunds.list).toHaveBeenCalledTimes(2);
    expect(api.refunds.create).not.toHaveBeenCalled();
  });
  it("supervision : inclut un cas sans identifiant de remboursement Stripe", async () => {
    await payer();
    expect(await RefundService.aExaminer()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId, stripeRefundId: null }),
      ]),
    );
  });
});
