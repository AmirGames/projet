import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

const db: any = {
  order: { findFirst: jest.fn() },
  payment: { findFirst: jest.fn() },
  courierTip: { findFirst: jest.fn() },
};
const stripeMock: any = { paymentIntents: { retrieve: jest.fn() } };

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../stripe", () => ({
  stripe: stripeMock,
  STRIPE_CONFIG: { currency: "eur", webhookSecret: "whsec_test" },
}));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: true }),
  loadEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: true }),
}));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = (req.headers.authorization as string).slice(7);
    next();
  },
}));

import paymentRouter from "../payment.routes";
import { paymentService } from "../payment.service";
import { genererJetonDeSuivi } from "../../orders/suivi-commande.service";

const app = express();
app.use(express.json());
app.use("/api/payments", paymentRouter);
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.statusCode || 500).json({ error: err.message, code: err.code });
});

const { jeton, empreinte } = genererJetonDeSuivi();

const commande = {
  id: "cmd_1",
  status: "PENDING",
  paymentStatus: "PENDING",
  trackingTokenHash: empreinte,
  jetonsDeSuivi: [],
  customer: { userId: "user-client" },
};

describe("Routes de paiement : preuve de possession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.order.findFirst.mockResolvedValue(commande);
  });

  it("intent sans preuve → 404", async () => {
    const creer = jest.spyOn(paymentService, "createPaymentIntent");
    const r = await request(app).post("/api/payments/intent").send({ orderId: "cmd_1" });
    expect(r.status).toBe(404);
    expect(creer).not.toHaveBeenCalled();
  });

  it("intent avec un mauvais jeton, ou la session d'un autre → 404", async () => {
    const r1 = await request(app).post("/api/payments/intent").send({ orderId: "cmd_1", trackingToken: "faux" });
    const r2 = await request(app)
      .post("/api/payments/intent")
      .set("Authorization", "Bearer user-autre")
      .send({ orderId: "cmd_1" });
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });

  it("intent avec le jeton de suivi → 201", async () => {
    jest
      .spyOn(paymentService, "createPaymentIntent")
      .mockResolvedValue({ id: "pi_1", client_secret: "sec", amount: 2500 } as any);
    const r = await request(app).post("/api/payments/intent").send({ orderId: "cmd_1", trackingToken: jeton });
    expect(r.status).toBe(201);
    expect(r.body.clientSecret).toBe("sec");
  });

  it("intent par le client propriétaire connecté → 201", async () => {
    jest
      .spyOn(paymentService, "createPaymentIntent")
      .mockResolvedValue({ id: "pi_1", client_secret: "sec", amount: 2500 } as any);
    const r = await request(app)
      .post("/api/payments/intent")
      .set("Authorization", "Bearer user-client")
      .send({ orderId: "cmd_1" });
    expect(r.status).toBe(201);
  });

  it("intent sur une commande qui n'est plus payable → 409", async () => {
    db.order.findFirst.mockResolvedValue({ ...commande, status: "REJECTED" });
    const r = await request(app).post("/api/payments/intent").send({ orderId: "cmd_1", trackingToken: jeton });
    expect(r.status).toBe(409);
  });

  it("confirm avec l'intention d'une autre commande → refus, sans appel à Stripe", async () => {
    db.payment.findFirst.mockResolvedValue(null);
    db.courierTip.findFirst.mockResolvedValue(null);
    const r = await request(app)
      .post("/api/payments/confirm")
      .send({ orderId: "cmd_1", paymentIntentId: "pi_autre", trackingToken: jeton });
    expect(r.status).toBe(404);
    expect(db.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: "cmd_1", stripePaymentIntentId: "pi_autre" } })
    );
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();
  });

  it("confirm de sa propre intention : lecture seule quand le webhook est configuré", async () => {
    db.payment.findFirst.mockResolvedValue({ id: "pay-1" });
    db.courierTip.findFirst.mockResolvedValue(null);
    stripeMock.paymentIntents.retrieve.mockResolvedValue({
      id: "pi_1",
      status: "succeeded",
      metadata: { orderId: "cmd_1" },
    });
    const marquer = jest.spyOn(paymentService, "marquerPaye");
    const r = await request(app)
      .post("/api/payments/confirm")
      .send({ orderId: "cmd_1", paymentIntentId: "pi_1", trackingToken: jeton });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(marquer).not.toHaveBeenCalled();
  });

  it("status sans preuve → 404", async () => {
    const r = await request(app).get("/api/payments/status/pi_1?orderId=cmd_1");
    expect(r.status).toBe(404);
  });
});
