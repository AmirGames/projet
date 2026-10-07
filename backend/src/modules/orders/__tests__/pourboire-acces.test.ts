import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const db: any = {
  order: { findFirst: jest.fn() },
  orderDelivery: { findUnique: jest.fn() },
  orderTrackingToken: { create: jest.fn() },
  membership: { findFirst: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../realtime/socket", () => ({
  emitOrderUpdate: jest.fn(),
  emitNotification: jest.fn(),
  emitMerchantEvent: jest.fn(),
}));
// La configuration réelle exige une base et des secrets absents des tests.
jest.mock("../../../config/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
  loadEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
}));
jest.mock("../../notifications/email.service", () => ({ EmailService: {} }));
const situation = jest.fn(async (_id: string) => ({ possible: true, livreur: "Karim" }));
const creerIntention = jest.fn(async (_id: string, _montant: number) => ({ clientSecret: "cs_tip", montant: 3 }));
jest.mock("../pourboire.service", () => ({ PourboireService: { situation, creerIntention } }));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: {},
  enArrierePlan: (envoi: Promise<unknown>) => envoi,
}));

/**
 * La session, réduite à ce qui compte ici : « Bearer <userId> ». Le compte de
 * la plateforme se reconnaît à son nom.
 */
jest.mock("../../auth/auth.middleware", () => ({
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
  // POST /orders : le jeton est facultatif, un visiteur passe sans.
  authFacultative: (_req: any, _res: any, next: any) => next(),
}));

import ordersRouter from "../order.routes";
import { genererJetonDeSuivi } from "../suivi-commande.service";

const app = express();
app.use(express.json());
app.use("/api/orders", ordersRouter);
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
});

const { jeton, empreinte } = genererJetonDeSuivi();
const ID = "cmd_1234567890abcdefghij";
const commande = () => ({
  id: ID,
  storeId: "store-1",
  trackingTokenHash: empreinte,
  jetonsDeSuivi: [],
  store: { orgId: "org-1" },
  customer: { userId: "user-client" },
  delivery: null,
  items: [],
  payments: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  db.order.findFirst.mockResolvedValue(commande());
  db.membership.findFirst.mockResolvedValue(null);
});

describe("pourboire : le numéro de commande ne suffit plus (C-17)", () => {
  it("GET refuse un visiteur sans jeton, avec 404 uniforme", async () => {
    const res = await request(app).get(`/api/orders/${ID}/pourboire`);
    expect(res.status).toBe(404);
    expect(situation).not.toHaveBeenCalled();
  });

  it("GET refuse un mauvais jeton", async () => {
    const res = await request(app).get(`/api/orders/${ID}/pourboire`).query({ t: "pas-le-bon" });
    expect(res.status).toBe(404);
    expect(situation).not.toHaveBeenCalled();
  });

  it("GET accepte le jeton de suivi, sans mise en cache", async () => {
    const res = await request(app).get(`/api/orders/${ID}/pourboire`).query({ t: jeton });
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(situation).toHaveBeenCalledWith(ID);
  });

  it("POST ne crée aucun paiement Stripe sans accès à la commande", async () => {
    const res = await request(app).post(`/api/orders/${ID}/pourboire`).send({ montant: 3 });
    expect(res.status).toBe(404);
    expect(creerIntention).not.toHaveBeenCalled();
  });

  it("POST crée l'intention pour le client connecté propriétaire", async () => {
    const res = await request(app).post(`/api/orders/${ID}/pourboire`).set("Authorization", "Bearer user-client").send({ montant: 3 });
    expect(res.status).toBe(201);
    expect(creerIntention).toHaveBeenCalledWith(ID, 3);
  });

  it("POST refuse un client connecté étranger à la commande", async () => {
    const res = await request(app).post(`/api/orders/${ID}/pourboire`).set("Authorization", "Bearer autre-client").send({ montant: 3 });
    expect(res.status).toBe(404);
    expect(creerIntention).not.toHaveBeenCalled();
  });

  it("POST accepte le jeton de suivi d'un client invité", async () => {
    const res = await request(app).post(`/api/orders/${ID}/pourboire`).query({ t: jeton }).send({ montant: 3 });
    expect(res.status).toBe(201);
  });
});
