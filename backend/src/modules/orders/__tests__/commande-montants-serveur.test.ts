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
  order: { create: jest.fn(), findUnique: jest.fn() },
  promotion: { updateMany: jest.fn() },
  orderTrackingToken: { create: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../realtime/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ ENABLE_STRIPE: false }) }));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: { sendOrderConfirmation: jest.fn() } }));
jest.mock("../../notifications/notifier.service", () => ({
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
jest.mock("../../marketing/promotion.service", () => ({ PromotionService: { validateAndApply: jest.fn() } }));
jest.mock("../../legal/acceptation-conditions.service", () => {
  const { z } = jest.requireActual<typeof import("zod")>("zod");
  return {
    champAcceptation: { conditionsAcceptees: z.literal(true) },
    enregistrerAcceptation: jest.fn(async () => undefined),
    acceptationAJour: jest.fn(async () => false),
  };
});

import { OrderService, empreinteDeLAchat } from "../order.service";
import { DeliveryZoneService } from "../../delivery/delivery-zone.service";
import { PromotionService } from "../../marketing/promotion.service";
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
  db.order.findUnique.mockReset();
  db.order.create.mockReset();
  db.$transaction.mockImplementation(async (f: any) => f(db));
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

describe("OrderService.create — commerce suspendu ou fermé", () => {
  it.each(["SUSPENDED", "CLOSED"])("refuse une commande invitée quand le commerce est %s", async (status) => {
    db.store.findUnique.mockResolvedValue({
      isOpen: true,
      operatingHours: null,
      deletedAt: null,
      name: "Chez Luigi",
      org: { approvedAt: new Date(), status, isDemo: false },
    });

    await expect(OrderService.create(commande() as any)).rejects.toMatchObject({
      statusCode: 403,
      code: "MERCHANT_SUSPENDED",
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });
});

describe("idempotence de création (C-14)", () => {
  const CLE = "tentative-0001";

  it("même clé et même panier : la commande déjà créée, un seul enregistrement", async () => {
    const premiere = await OrderService.create(commande() as any, { cleIdempotence: CLE });
    const enregistree = commandeEnregistree();
    expect(enregistree).toMatchObject({ idempotencyKey: CLE });
    expect(typeof enregistree.idempotencyHash).toBe("string");

    // Deuxième envoi : la base connaît la clé.
    db.order.findUnique.mockResolvedValue({
      id: "cmd-1", ...enregistree, items: [], paymentMethodId: null, trackingTokenHash: "h",
    });
    const rejeu: any = await OrderService.create(commande() as any, { cleIdempotence: CLE });

    expect(db.order.create).toHaveBeenCalledTimes(1);
    expect(rejeu.id).toBe("cmd-1");
    expect(rejeu.rejouee).toBe(true);
    // Un nouveau jeton de suivi : le premier n'est conservé qu'en empreinte.
    expect(rejeu.trackingToken).toBeTruthy();
    expect(rejeu.trackingToken).not.toBe((premiere as any).trackingToken);
    expect(db.orderTrackingToken.create).toHaveBeenCalledTimes(1);
    expect(rejeu).not.toHaveProperty("trackingTokenHash");
    expect(rejeu).not.toHaveProperty("idempotencyHash");
  });

  it("même clé, panier différent : refus, jamais une autre commande", async () => {
    await OrderService.create(commande() as any, { cleIdempotence: CLE });
    const enregistree = commandeEnregistree();
    db.order.findUnique.mockResolvedValue({ id: "cmd-1", ...enregistree, items: [] });
    db.order.create.mockClear();

    await expect(
      OrderService.create(commande({ items: [{ productId: "pizza", quantity: 9 }] }) as any, { cleIdempotence: CLE })
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("deux envois simultanés : le second heurte l'unicité et reprend la commande du premier", async () => {
    await OrderService.create(commande() as any, { cleIdempotence: CLE });
    const enregistree = commandeEnregistree();
    db.order.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "cmd-1", ...enregistree, items: [] });
    db.order.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));

    const rejeu: any = await OrderService.create(commande() as any, { cleIdempotence: CLE });
    expect(rejeu.id).toBe("cmd-1");
    expect(rejeu.rejouee).toBe(true);
  });

  it("sans clé, le comportement est inchangé (anciens clients)", async () => {
    await OrderService.create(commande() as any);
    expect(db.order.findUnique).not.toHaveBeenCalled();
    expect(commandeEnregistree()).not.toHaveProperty("idempotencyKey");
  });

  it("la preuve d'acceptation s'écrit dans la transaction de création", async () => {
    const acceptation = jest.fn(async (_tx: unknown, _commande: unknown) => undefined);
    await OrderService.create(commande() as any, { acceptation });
    expect(acceptation).toHaveBeenCalledWith(db, expect.objectContaining({ id: "cmd-1" }));
  });

  it("l'ordre des champs ne change pas l'empreinte du contenu", () => {
    const a = empreinteDeLAchat({ storeId: "s", items: [{ productId: "p", quantity: 1 }] } as any);
    const b = empreinteDeLAchat({ items: [{ quantity: 1, productId: "p" }], storeId: "s" } as any);
    expect(a).toBe(b);
    expect(a).not.toBe(empreinteDeLAchat({ storeId: "s", items: [{ productId: "p", quantity: 2 }] } as any));
  });
});

describe("quota de promotion (C-15)", () => {
  const promotion = { id: "promo-1", code: "BIENVENUE", maxUses: 1 };
  beforeEach(() => {
    (PromotionService.validateAndApply as jest.Mock).mockResolvedValue({
      promotion: { ...promotion, code: "BIENVENUE" },
      discountAmount: 2,
      finalTotal: 0,
    } as never);
  });

  it("la réservation est conditionnelle au plafond et part avec la commande", async () => {
    db.promotion.updateMany.mockResolvedValue({ count: 1 });
    await OrderService.create({ ...(commande() as any), promoCode: "BIENVENUE" });
    expect(db.promotion.updateMany).toHaveBeenCalledWith({
      where: { id: "promo-1", currentUses: { lt: 1 } },
      data: { currentUses: { increment: 1 } },
    });
    expect(db.order.create).toHaveBeenCalledTimes(1);
  });

  it("dernière utilisation prise par un autre : refus, aucune commande", async () => {
    db.promotion.updateMany.mockResolvedValue({ count: 0 });
    await expect(OrderService.create({ ...(commande() as any), promoCode: "BIENVENUE" })).rejects.toMatchObject({
      code: "MAX_USES_REACHED",
    });
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("sans plafond, l'utilisation est comptée sans condition", async () => {
    (PromotionService.validateAndApply as jest.Mock).mockResolvedValue({
      promotion: { id: "promo-2", code: "TOUJOURS", maxUses: null },
      discountAmount: 1,
      finalTotal: 0,
    } as never);
    db.promotion.updateMany.mockResolvedValue({ count: 1 });
    await OrderService.create({ ...(commande() as any), promoCode: "TOUJOURS" });
    expect(db.promotion.updateMany.mock.calls[0][0].where).toEqual({ id: "promo-2" });
  });

  it("si la création échoue, l'utilisation n'est pas consommée (même transaction)", async () => {
    db.promotion.updateMany.mockResolvedValue({ count: 1 });
    db.order.create.mockRejectedValueOnce(new Error("base coupée"));
    await expect(OrderService.create({ ...(commande() as any), promoCode: "BIENVENUE" })).rejects.toThrow("base coupée");
    // Les deux écritures sont dans db.$transaction : l'annulation est celle de la base.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});


describe("POST /api/orders — alcool", () => {
  const avecAlcool = () =>
    db.product.findMany.mockResolvedValue([
      { id: "pizza", name: "Bière", storeId: STORE_ID, isAvailable: true, deletedAt: null, categoryId: null, containsAlcohol: true },
    ]);

  it("refuse un panier contenant de l'alcool sans attestation d'âge", async () => {
    avecAlcool();
    const res = await request(app).post("/api/orders").send(commande());

    expect(res.status).toBe(400);
    expect(res.body.code ?? res.body.error?.code).toBe("AGE_CONFIRMATION_REQUIRED");
    expect(db.order.create).not.toHaveBeenCalled();
  });

  it("accepte le même panier avec l'attestation", async () => {
    avecAlcool();
    const res = await request(app).post("/api/orders").send(commande({ ageMinimumConfirme: true }));

    expect(res.status).toBe(201);
  });
});

describe("POST /api/orders — acceptation des conditions", () => {
  it("refuse sans case cochée ni acceptation antérieure", async () => {
    const { conditionsAcceptees: _c, ...sans } = commande();
    const res = await request(app).post("/api/orders").send(sans);

    expect(res.status).toBe(400);
    expect(db.order.create).not.toHaveBeenCalled();
  });
});
