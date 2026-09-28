import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

type Fn = jest.Mock<(...args: any[]) => any>;
const fn = () => jest.fn() as Fn;

const db: any = {
  paymentMethod: { findFirst: fn(), findUnique: fn(), delete: fn() },
  store: { findUnique: fn() },
  membership: { findFirst: fn() },
};
const stripe: any = { paymentMethods: { detach: fn(), retrieve: fn() } };

jest.mock("../../services/db", () => ({ db }));
jest.mock("../../config/stripe", () => ({ stripe, STRIPE_CONFIG: { currency: "eur" } }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
// L'appelant est désigné par l'en-tête x-test-user.
jest.mock("../../middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = req.headers["x-test-user"];
    req.user = { userId: req.headers["x-test-user"] };
    next();
  },
}));

import paymentMethodRouter from "../payment-method";
import paymentMethodsApiRouter from "../payment-methods-api";
import { errorHandler } from "../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/payment-methods", paymentMethodRouter);
app.use("/api/payment-methods", paymentMethodsApiRouter);
app.use(errorHandler);

// pm_B appartient à B.
const moyens = [{ id: "m-b", stripePaymentMethodId: "pm_B", userId: "user-b" },
  { id: "m-a", stripePaymentMethodId: "pm_A", userId: "user-a" }];

beforeEach(() => {
  jest.clearAllMocks();
  db.paymentMethod.findFirst.mockImplementation(async ({ where }: any) =>
    moyens.find((m) => m.stripePaymentMethodId === where.stripePaymentMethodId && m.userId === where.userId) ?? null
  );
  db.paymentMethod.delete.mockResolvedValue({});
  stripe.paymentMethods.detach.mockResolvedValue({});
});

describe("DELETE /api/payment-methods/:id", () => {
  it("A ne peut pas détacher la carte de B : 404, Stripe jamais appelé", async () => {
    const res = await request(app).delete("/api/payment-methods/pm_B").set("x-test-user", "user-a");

    expect(res.status).toBe(404);
    expect(stripe.paymentMethods.detach).not.toHaveBeenCalled();
    expect(db.paymentMethod.delete).not.toHaveBeenCalled();
  });

  it("A supprime sa propre carte : 200", async () => {
    const res = await request(app).delete("/api/payment-methods/pm_A").set("x-test-user", "user-a");

    expect(res.status).toBe(200);
    expect(stripe.paymentMethods.detach).toHaveBeenCalledWith("pm_A");
    expect(db.paymentMethod.delete).toHaveBeenCalledWith({ where: { id: "m-a" } });
  });
});

describe("routes /api/payment-methods/:storeId/…", () => {
  beforeEach(() => {
    db.store.findUnique.mockResolvedValue({ orgId: "org-b", deletedAt: null });
    db.membership.findFirst.mockImplementation(async ({ where }: any) =>
      where.userId === "user-b" && where.orgId === "org-b" ? { id: "mb" } : null
    );
    db.paymentMethod.findUnique.mockResolvedValue({ id: "m-b", storeId: "store-b" });
  });

  it("refuse la boutique d'une autre organisation", async () => {
    const res = await request(app).delete("/api/payment-methods/store-b/m-b").set("x-test-user", "user-a");

    expect(res.status).toBe(404);
    expect(db.paymentMethod.findUnique).not.toHaveBeenCalled();
    expect(db.paymentMethod.delete).not.toHaveBeenCalled();
  });

  it("laisse passer un membre de l'organisation", async () => {
    const res = await request(app).delete("/api/payment-methods/store-b/m-b").set("x-test-user", "user-b");

    expect(res.status).toBe(200);
    expect(db.paymentMethod.delete).toHaveBeenCalled();
  });
});
