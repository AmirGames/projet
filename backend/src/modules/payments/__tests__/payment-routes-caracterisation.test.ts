import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const findFirst = jest.fn<(...args: any[]) => any>();
const db = { order: { findFirst } };
jest.mock("../../../services/db", () => ({ db }));

const createPaymentIntent = jest.fn<(...args: any[]) => any>();
const confirmPayment = jest.fn<(...args: any[]) => any>();
jest.mock("../payment.service", () => ({ paymentService: { createPaymentIntent, confirmPayment } }));

jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (req.headers.authorization !== "Bearer client-alice") return res.status(401).json({ error: "Unauthorized" });
    req.userId = "user-alice";
    return next();
  },
}));
jest.mock("../../orders/suivi-commande.service", () => ({
  jetonReconnu: (jeton: unknown, empreintes: (string | null)[]) => jeton === "suivi-valide" && empreintes.includes("hash-suivi"),
}));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ ENABLE_STRIPE: true }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import paymentRouter from "../payment.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/payments", paymentRouter);
app.use(errorHandler);

const commande = (customerUserId: string | null = "user-alice") => ({
  id: "cmd-1", status: "PENDING", paymentStatus: "PENDING", trackingTokenHash: "hash-suivi",
  jetonsDeSuivi: [], customer: customerUserId ? { userId: customerUserId } : null,
});

beforeEach(() => {
  jest.clearAllMocks();
  findFirst.mockResolvedValue(commande());
  createPaymentIntent.mockResolvedValue({ id: "pi_test", client_secret: "pi_test_secret", amount: 2350 });
  confirmPayment.mockResolvedValue({ status: "requires_action" });
  process.env.STRIPE_SECRET_KEY = "sk_test_contract";
  process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_contract";
});

describe("contrat HTTP /api/payments", () => {
  it("GET /config est public et n'expose la clé publiable qu'en mode en ligne", async () => {
    const response = await request(app).get("/api/payments/config");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { enLigne: true, publishableKey: "pk_test_contract" } });
  });

  it("POST /intent accepte le propriétaire connecté et renvoie le secret seulement au client", async () => {
    const response = await request(app).post("/api/payments/intent").set("Authorization", "Bearer client-alice").send({ orderId: "cmd-1" });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ message: "Payment intent created", clientSecret: "pi_test_secret", paymentIntentId: "pi_test", amount: 23.5 });
    expect(createPaymentIntent).toHaveBeenCalledWith("cmd-1");
  });

  it("POST /intent autorise une commande invitée uniquement avec son jeton de suivi", async () => {
    findFirst.mockResolvedValue(commande(null));
    const refus = await request(app).post("/api/payments/intent").send({ orderId: "cmd-1", trackingToken: "incorrect" });
    expect(refus.status).toBe(404);
    const accepte = await request(app).post("/api/payments/intent").send({ orderId: "cmd-1", trackingToken: "suivi-valide" });
    expect(accepte.status).toBe(201);
  });

  it("POST /intent masque une commande d'un autre client et refuse une commande non payable", async () => {
    findFirst.mockResolvedValue(commande("user-bob"));
    expect((await request(app).post("/api/payments/intent").set("Authorization", "Bearer client-alice").send({ orderId: "cmd-1" })).status).toBe(404);
    findFirst.mockResolvedValue({ ...commande(), status: "ACCEPTED" });
    expect((await request(app).post("/api/payments/intent").set("Authorization", "Bearer client-alice").send({ orderId: "cmd-1" })).status).toBe(409);
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });

  it("POST /confirm exige les identifiants et conserve requires_action sans déclarer payé", async () => {
    const invalide = await request(app).post("/api/payments/confirm").set("Authorization", "Bearer client-alice").send({ orderId: "cmd-1" });
    expect(invalide.status).toBe(400);
    const response = await request(app).post("/api/payments/confirm").set("Authorization", "Bearer client-alice").send({ orderId: "cmd-1", paymentIntentId: "pi_test" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Payment confirmed", success: false, status: "requires_action" });
    expect(confirmPayment).toHaveBeenCalledWith("cmd-1", "pi_test");
  });
});

