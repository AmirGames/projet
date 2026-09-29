import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

/**
 * Le client n'impose aucun montant (SEC-07).
 *
 * Le total, la taxe, les frais et le prix des lignes sont calculés par le
 * serveur : un panier vide est refusé, et ce que le navigateur annonce —
 * `totalAmount`, `feesAmount` négatif, `items[].price` — n'a aucun effet.
 */

const db: any = {
  store: { findUnique: jest.fn() },
  customer: { findUnique: jest.fn(), create: jest.fn() },
  product: { findMany: jest.fn() },
  paymentMethod: { findFirst: jest.fn() },
  systemConfig: { findFirst: jest.fn() },
  planTier: { findUnique: jest.fn() },
  order: { create: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../../config/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ ENABLE_STRIPE: false }) }));
jest.mock("../../../services/webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../../../services/email.service", () => ({ EmailService: { sendOrderConfirmation: jest.fn() } }));
jest.mock("../../../services/notifier.service", () => ({
  Notifier: { pushEquipeBoutique: jest.fn(async () => 0) },
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));
jest.mock("../../drivers/dispatch.service", () => ({ DispatchService: {} }));
jest.mock("../pourboire.service", () => ({ PourboireService: {} }));
jest.mock("../../delivery/store-hours.service", () => ({ StoreHoursService: { isOpenNow: () => true } }));
jest.mock("../../catalog/variant.service", () => ({
  VariantService: { prixDeLaLigne: jest.fn(async () => 12.5) },
}));
jest.mock("../../catalog/supplement.service", () => ({
  SupplementService: { tarifer: jest.fn(async () => ({ montant: 0, retenus: [] })) },
}));
jest.mock("../../catalog/tax.service", () => ({
  TaxService: {
    tauxAAjouter: jest.fn(async () => new Map()),
    ttc: (montant: number) => montant,
    taxeDesLignes: jest.fn(async () => ({ aAjouter: 0, total: 0, taux: 0, parLigne: [] })),
  },
}));
jest.mock("../../delivery/delivery-zone.service", () => ({
  DeliveryZoneService: {
    controlerLaLivraison: jest.fn(async () => ({ frais: 3.5, mode: "OWN" })),
  },
}));
jest.mock("../../../services/promotion.service", () => ({ PromotionService: {} }));
jest.mock("../../../services/acceptation-conditions.service", () => {
  const { z } = jest.requireActual<typeof import("zod")>("zod");
  return {
    champAcceptation: { conditionsAcceptees: z.literal(true) },
    enregistrerAcceptation: jest.fn(async () => undefined),
  };
});

import { OrderService } from "../order.service";
import { DeliveryZoneService } from "../../delivery/delivery-zone.service";
import orderRouter from "../order.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const STORE_ID = "ckboutique00000000000000";

const app = express();
app.use(express.json());
app.use("/api/orders", orderRouter);
app.use(errorHandler);

const commande = (surcharge: Record<string, unknown> = {}) => ({
  storeId: STORE_ID,
  customerName: "Dupont",
  customerEmail: "dupont@example.com",
  customerPhone: "+32470000000",
  deliveryType: "PICKUP",
  conditionsAcceptees: true,
  items: [{ productId: "pizza", quantity: 2 }],
  ...surcharge,
});

/** Les données transmises à db.order.create lors du dernier appel. */
const commandeEnregistree = () => (db.order.create.mock.calls.at(-1) as any[])[0].data;

beforeEach(() => {
  db.store.findUnique.mockResolvedValue({
    isOpen: true,
    operatingHours: null,
    deletedAt: null,
    name: "Chez Luigi",
    org: { approvedAt: new Date(), tier: null, commissionFreeActive: false, commissionFreeUntil: null },
  });
  db.customer.findUnique.mockResolvedValue({ id: "client-1" });
  db.product.findMany.mockResolvedValue([
    { id: "pizza", name: "Margherita", storeId: STORE_ID, isAvailable: true, deletedAt: null, categoryId: null },
  ]);
  db.paymentMethod.findFirst.mockResolvedValue(null);
  db.systemConfig.findFirst.mockResolvedValue({
    serviceFee: 0.25,
    platformFeePercent: 5,
    minOrderAmount: 0,
    maxOrderAmount: 0,
  });
  db.planTier.findUnique.mockResolvedValue(null);
  db.order.create.mockImplementation(async ({ data }: any) => ({ id: "cmd-1", createdAt: new Date(), ...data, items: [] }));
});

describe("POST /api/orders — le panier est obligatoire", () => {
  it("refuse une commande sans items", async () => {
    const { items: _items, ...sansPanier } = commande();
    const res = await request(app).post("/api/orders").send({ ...sansPanier, totalAmount: 0.01 });

    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("refuse un panier vide", async () => {
    const res = await request(app).post("/api/orders").send(commande({ items: [], totalAmount: 0.01 }));

    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders — les montants du client sont ignorés", () => {
  it("ne transmet au service ni totalAmount, ni taxAmount, ni feesAmount, ni items[].price", async () => {
    const espion = jest.spyOn(OrderService, "create");

    const res = await request(app)
      .post("/api/orders")
      .send(
        commande({
          totalAmount: 0.01,
          taxAmount: -10,
          feesAmount: -50,
          items: [{ productId: "pizza", quantity: 2, price: 0.01 }],
        })
      );

    expect(res.status).toBe(201);
    const transmis = espion.mock.calls[0][0] as any;
    expect(transmis).not.toHaveProperty("totalAmount");
    expect(transmis).not.toHaveProperty("taxAmount");
    expect(transmis).not.toHaveProperty("feesAmount");
    expect(transmis.items[0]).not.toHaveProperty("price");
    espion.mockRestore();
  });

  it("en retrait, des frais négatifs n'abaissent pas le total", async () => {
    const res = await request(app).post("/api/orders").send(commande({ feesAmount: -50 }));

    expect(res.status).toBe(201);
    const enregistree = commandeEnregistree();
    // 2 × 12,50 € + 0,25 € de frais de service, sans frais de livraison.
    expect(enregistree.feesAmount).toBe(0);
    expect(enregistree.totalAmount).toBe(25.25);
  });

  it("ignore le totalAmount annoncé et recalcule depuis le catalogue", async () => {
    const res = await request(app).post("/api/orders").send(commande({ totalAmount: 0.01 }));

    expect(res.status).toBe(201);
    expect(commandeEnregistree().totalAmount).toBe(25.25);
  });

  it("enregistre les lignes au prix de la base, pas au prix envoyé", async () => {
    await request(app)
      .post("/api/orders")
      .send(commande({ items: [{ productId: "pizza", quantity: 2, price: 0.01 }] }));

    const ligne = commandeEnregistree().items.create[0];
    expect(ligne.price).toBe(12.5);
    expect(ligne.total).toBe(25);
  });
});

describe("OrderService.create — frais de livraison", () => {
  it("prend les frais de la zone de livraison, quoi que dise l'appelant", async () => {
    await OrderService.create({
      ...(commande({ deliveryType: "DELIVERY", deliveryAddress: "Rue Neuve 1" }) as any),
      feesAmount: -50,
      totalAmount: 0.01,
    });

    expect(DeliveryZoneService.controlerLaLivraison).toHaveBeenCalled();
    const enregistree = commandeEnregistree();
    expect(enregistree.feesAmount).toBe(3.5);
    expect(enregistree.totalAmount).toBe(28.75);
  });

  it("refuse un panier vide même appelé directement", async () => {
    await expect(OrderService.create({ ...(commande() as any), items: [] })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
