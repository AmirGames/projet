import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const db: any = {
  order: { findFirst: jest.fn() },
  orderDelivery: { findUnique: jest.fn() },
  orderTrackingToken: { create: jest.fn() },
  membership: { findFirst: jest.fn() },
};

jest.mock("../../services/db", () => ({ db }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../config/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));
// La configuration réelle exige une base et des secrets absents des tests.
jest.mock("../../config/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
  loadEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
}));
jest.mock("../../services/email.service", () => ({ EmailService: {} }));
jest.mock("../../services/notifier.service", () => ({
  Notifier: {},
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));

/**
 * La session, réduite à ce qui compte ici : « Bearer <userId> ». Le compte de
 * la plateforme se reconnaît à son nom.
 */
jest.mock("../../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const entete: string | undefined = req.headers.authorization;
    if (!entete?.startsWith("Bearer ")) return next(new Error("sans session"));
    const userId = entete.slice(7);
    req.userId = userId;
    req.compte = {
      id: userId,
      isSuperOwner: userId === "user-plateforme",
      isSystemAdmin: false,
      acces: {},
    };
    next();
  },
}));

import ordersRouter from "../order";
import { empreinteDuJeton, genererJetonDeSuivi } from "../../services/suivi-commande.service";

const app = express();
app.use(express.json());
app.use("/api/orders", ordersRouter);
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
});

const { jeton, empreinte } = genererJetonDeSuivi();

/** Une commande en livraison, le livreur en route vers la porte. */
function commande(etatCourse = "PICKED_UP") {
  return {
    id: "cmd_1234567890abcdefghij",
    storeId: "store-1",
    status: "READY",
    paymentStatus: "SUCCEEDED",
    submittedAt: new Date(),
    customerId: "customer-1",
    customerName: "Alice Martin",
    customerEmail: "alice@exemple.fr",
    customerPhone: "0600000000",
    deliveryType: "DELIVERY",
    deliveryMode: "PLATFORM",
    pickupTime: null,
    deliveryAddress: "1 rue de la Paix",
    deliveryCity: "Paris",
    deliveryPostal: "75002",
    deliveryLat: 48.86,
    deliveryLng: 2.33,
    totalAmount: 25,
    taxAmount: 2.27,
    taxRate: 10,
    feesAmount: 3,
    serviceFeeAmount: 0.5,
    tipAmount: 0,
    promoCode: null,
    discountAmount: 0,
    paymentMethodName: "Carte",
    notes: null,
    acceptedAt: new Date(),
    preparationMinutes: 15,
    estimatedReadyAt: new Date(),
    rejectedAt: null,
    rejectionReason: null,
    rejectionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    trackingTokenHash: empreinte,
    jetonsDeSuivi: [] as { tokenHash: string }[],
    store: { orgId: "org-1" },
    customer: { userId: "user-client" },
    items: [
      {
        id: "item-1",
        productId: "prod-1",
        variantId: null,
        quantity: 2,
        price: 10,
        total: 20,
        selectedOptions: {},
        taxRate: 10,
        taxAmount: 1.82,
        product: { id: "prod-1", name: "Pizza", category: { name: "Pizzas" } },
        variant: null,
      },
    ],
    payments: [
      {
        id: "pay-1",
        amount: 25,
        currency: "EUR",
        status: "SUCCEEDED",
        paidAt: new Date(),
        refundedAt: null,
        refundedAmount: null,
        createdAt: new Date(),
        // Ce que la base contient, et qui ne doit jamais sortir.
        stripeClientSecret: "pi_123_secret_456",
        stripePaymentIntentId: "pi_123",
      },
    ],
    delivery: {
      status: etatCourse,
      deliveryCode: "4821",
      proofType: null,
      proofAt: null,
      proofPhoto: null,
      proofNote: null,
      nearCustomerNotifiedAt: null,
      customerWaitStartedAt: null,
      driver: { userId: "user-livreur" },
    },
  };
}

const URL_COMMANDE = "/api/orders/cmd_1234567890abcdefghij";

/** Aucun secret, où qu'il soit caché dans la réponse. */
function sansSecret(corps: any) {
  const texte = JSON.stringify(corps);
  expect(texte).not.toContain("pi_123_secret_456");
  expect(texte).not.toContain("stripeClientSecret");
  expect(texte).not.toContain("deliveryCode");
  expect(corps.delivery?.deliveryCode).toBeUndefined();
}

describe("GET /api/orders/:id", () => {
  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(commande());
    db.membership.findFirst.mockResolvedValue(null);
  });

  it("répond 404 à un visiteur sans jeton", async () => {
    const reponse = await request(app).get(URL_COMMANDE);
    expect(reponse.status).toBe(404);
    expect(JSON.stringify(reponse.body)).not.toContain("4821");
  });

  it("répond 404 à un mauvais jeton", async () => {
    const autre = genererJetonDeSuivi().jeton;
    const reponse = await request(app).get(`${URL_COMMANDE}?t=${autre}`);
    expect(reponse.status).toBe(404);
  });

  it("répond 404 à un jeton mal formé", async () => {
    const reponse = await request(app).get(`${URL_COMMANDE}?t=${empreinte}`);
    expect(reponse.status).toBe(404);
  });

  it("répond 404 à une commande qui n'existe pas, comme à un refus", async () => {
    db.order.findFirst.mockResolvedValue(null);
    const reponse = await request(app).get(`${URL_COMMANDE}?t=${jeton}`);
    expect(reponse.status).toBe(404);
  });

  it("rend la vue réduite au bon jeton : ni secret, ni code brut, ni contact", async () => {
    const reponse = await request(app).get(`${URL_COMMANDE}?t=${jeton}`);

    expect(reponse.status).toBe(200);
    sansSecret(reponse.body);
    expect(reponse.body.payments).toBeUndefined();
    expect(reponse.body.customerEmail).toBeUndefined();
    expect(reponse.body.customerPhone).toBeUndefined();
    expect(JSON.stringify(reponse.body)).not.toContain("alice@exemple.fr");
    expect(JSON.stringify(reponse.body)).not.toContain("0600000000");
    expect(reponse.body.trackingTokenHash).toBeUndefined();
    // Ce que le client a besoin de voir.
    expect(reponse.body.status).toBe("READY");
    expect(reponse.body.items).toHaveLength(1);
    expect(reponse.body.codeRemise).toBe("4821");
  });

  it("reconnaît le jeton d'un lien envoyé par e-mail ou SMS", async () => {
    const lien = genererJetonDeSuivi();
    db.order.findFirst.mockResolvedValue({ ...commande(), jetonsDeSuivi: [{ tokenHash: lien.empreinte }] });

    const reponse = await request(app).get(`${URL_COMMANDE}?t=${lien.jeton}`);
    expect(reponse.status).toBe(200);
  });

  it("retire le code de la vue réduite une fois la commande remise", async () => {
    db.order.findFirst.mockResolvedValue(commande("DELIVERED"));
    const reponse = await request(app).get(`${URL_COMMANDE}?t=${jeton}`);
    expect(reponse.status).toBe(200);
    expect(reponse.body.codeRemise).toBeNull();
  });

  it("ne donne jamais le code au livreur de la course", async () => {
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-livreur");
    expect(reponse.status).toBe(404);
    expect(JSON.stringify(reponse.body)).not.toContain("4821");
  });

  it("ne donne jamais le code au livreur, même muni du jeton", async () => {
    const reponse = await request(app)
      .get(`${URL_COMMANDE}?t=${jeton}`)
      .set("Authorization", "Bearer user-livreur");
    expect(reponse.status).toBe(404);
    expect(JSON.stringify(reponse.body)).not.toContain("4821");
  });

  it("répond 404 à un compte étranger à la commande", async () => {
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-inconnu");
    expect(reponse.status).toBe(404);
  });

  it("rend la commande complète et le code au client propriétaire tant qu'elle n'est pas remise", async () => {
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-client");

    expect(reponse.status).toBe(200);
    sansSecret(reponse.body);
    expect(reponse.body.codeRemise).toBe("4821");
    expect(reponse.body.customerEmail).toBe("alice@exemple.fr");
    expect(reponse.body.payments).toHaveLength(1);
    expect(reponse.body.payments[0].stripePaymentIntentId).toBeUndefined();
  });

  it("retire le code au client propriétaire une fois la commande remise", async () => {
    db.order.findFirst.mockResolvedValue(commande("DELIVERED"));
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-client");
    expect(reponse.status).toBe(200);
    expect(reponse.body.codeRemise).toBeNull();
  });

  it("rend la commande sans code à l'équipe du commerce", async () => {
    db.membership.findFirst.mockResolvedValue({ id: "membre-1" });
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-commercant");

    expect(reponse.status).toBe(200);
    sansSecret(reponse.body);
    expect(reponse.body.codeRemise).toBeNull();
    expect(reponse.body.customerPhone).toBe("0600000000");
    expect(db.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-commercant", orgId: "org-1" } })
    );
  });

  it("rend la commande sans code à l'équipe de la plateforme", async () => {
    const reponse = await request(app).get(URL_COMMANDE).set("Authorization", "Bearer user-plateforme");
    expect(reponse.status).toBe(200);
    sansSecret(reponse.body);
    expect(reponse.body.codeRemise).toBeNull();
  });
});

describe("GET /api/orders/:id/delivery", () => {
  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(commande());
    db.membership.findFirst.mockResolvedValue(null);
    db.orderDelivery.findUnique.mockResolvedValue(null);
  });

  it("répond 404 sans jeton : la position du livreur ne se lit pas avec l'identifiant seul", async () => {
    const reponse = await request(app).get(`${URL_COMMANDE}/delivery`);
    expect(reponse.status).toBe(404);
    expect(db.orderDelivery.findUnique).not.toHaveBeenCalled();
  });

  it("répond avec le bon jeton", async () => {
    const reponse = await request(app).get(`${URL_COMMANDE}/delivery?t=${jeton}`);
    expect(reponse.status).toBe(200);
  });
});

describe("Jeton de suivi", () => {
  it("fait 32 octets aléatoires et n'est jamais son empreinte", () => {
    const a = genererJetonDeSuivi();
    const b = genererJetonDeSuivi();
    expect(Buffer.from(a.jeton, "base64url")).toHaveLength(32);
    expect(a.jeton).not.toBe(b.jeton);
    expect(a.empreinte).toBe(empreinteDuJeton(a.jeton));
    expect(a.empreinte).not.toContain(a.jeton);
  });
});
