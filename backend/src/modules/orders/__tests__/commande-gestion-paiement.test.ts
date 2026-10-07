import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/** Le commerçant lit le paiement de ses commandes, jamais le secret client Stripe. */
const db: any = {
  order: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), count: jest.fn(async () => 0) },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
import { OrderManagementService } from "../order-management.service";

const paiementsDemandes = (appel: any) => appel.include.payments;

beforeEach(() => { jest.clearAllMocks(); });

describe("réponses de gestion des commandes", () => {
  it("la liste ne sélectionne pas stripeClientSecret", async () => {
    await OrderManagementService.getOrders("s1");
    const payments = paiementsDemandes(db.order.findMany.mock.calls[0][0]);
    expect(payments).not.toBe(true);
    expect(payments.select.stripeClientSecret).toBeUndefined();
    expect(payments.select.status).toBe(true);
  });

  it("le détail ne sélectionne pas stripeClientSecret", async () => {
    await OrderManagementService.getOrder("s1", "o1").catch(() => undefined);
    const appel: any = db.order.findUnique.mock.calls[0][0];
    const payments = paiementsDemandes(appel);
    expect(payments).not.toBe(true);
    expect(payments.select.stripeClientSecret).toBeUndefined();
  });
});
