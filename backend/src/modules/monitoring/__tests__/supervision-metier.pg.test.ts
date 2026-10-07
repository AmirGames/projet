import "dotenv/config";

/** Les requêtes des contrôles métier, exécutées sur PostgreSQL : elles doivent compter ce qu'elles annoncent. */

jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ pgtest: Buffer.alloc(32, 77).toString("base64") });
process.env.DATA_ENCRYPTION_ACTIVE_KEY = "pgtest";

import { db } from "../../../services/db";
import { mesurer } from "../supervision-metier.service";

const unique = `sup-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let orgId = "";
let orderId = "";
const evenement = `evt_${unique}`;

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `Org ${unique}`, slug: unique } });
  orgId = org.id;
  const store = await db.store.create({ data: { orgId, name: "Boutique", slug: `${unique}-s` } });
  const order = await db.order.create({
    data: {
      storeId: store.id,
      customerName: "Client",
      customerEmail: `c-${unique}@example.test`,
      customerPhone: "0470000000",
      deliveryType: "PICKUP",
      status: "PENDING",
      paymentStatus: "SUCCEEDED",
      totalAmount: 20,
      taxAmount: 0,
      feesAmount: 0,
      submittedAt: null,
      payments: { create: { amount: 20, status: "SUCCEEDED", paidAt: new Date(Date.now() - 60 * 60_000) } },
    },
  });
  orderId = order.id;
});

afterAll(async () => {
  await db.stripeEvent.deleteMany({ where: { id: evenement } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.store.deleteMany({ where: { orgId } });
  await db.organization.deleteMany({ where: { id: orgId } });
  await db.$disconnect();
});

describe("contrôles métier sur PostgreSQL", () => {
  it("une commande payée depuis une heure et jamais transmise est comptée, puis plus une fois transmise", async () => {
    const avant = await mesurer();
    expect(avant.commandesNonAnnoncees).toBeGreaterThanOrEqual(1);

    await db.order.update({ where: { id: orderId }, data: { submittedAt: new Date() } });
    const apres = await mesurer();
    expect(apres.commandesNonAnnoncees).toBe(avant.commandesNonAnnoncees - 1);
  });

  it("un paiement tout juste encaissé n'est pas encore en retard (délai de grâce)", async () => {
    await db.order.update({ where: { id: orderId }, data: { submittedAt: null } });
    await db.payment.updateMany({ where: { orderId }, data: { paidAt: new Date() } });
    const m = await mesurer();
    await db.payment.updateMany({ where: { orderId }, data: { paidAt: new Date(Date.now() - 60 * 60_000) } });
    const plusTard = await mesurer();
    expect(plusTard.commandesNonAnnoncees).toBe(m.commandesNonAnnoncees + 1);
  });

  it("un événement Stripe non traité depuis une heure est compté, traité il ne l'est plus", async () => {
    await db.stripeEvent.create({ data: { id: evenement, type: "payment_intent.succeeded", receivedAt: new Date(Date.now() - 60 * 60_000) } });
    const avant = await mesurer();
    expect(avant.webhooksBloques).toBeGreaterThanOrEqual(1);

    await db.stripeEvent.update({ where: { id: evenement }, data: { processedAt: new Date() } });
    expect((await mesurer()).webhooksBloques).toBe(avant.webhooksBloques - 1);
  });

  it("les autres mesures s'exécutent sans erreur", async () => {
    const m = await mesurer();
    expect(m.outbox).toEqual({ enAttente: expect.any(Number), echecs: expect.any(Number), retardMs: expect.any(Number) });
    expect(m.remboursementsEnAttente).toEqual(expect.any(Number));
  });
});
