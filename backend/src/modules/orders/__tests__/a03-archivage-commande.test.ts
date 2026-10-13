import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  order: { findUnique: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../config/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
  loadEnv: () => ({ NODE_ENV: "test", ENABLE_STRIPE: false }),
}));
jest.mock("../../realtime/socket", () => ({
  emitMerchantEvent: jest.fn(), emitOrderUpdate: jest.fn(), emitNotification: jest.fn(),
}));
jest.mock("../../notifications/email.service", () => ({ EmailService: {} }));
jest.mock("../../notifications/notifier.service", () => ({
  Notifier: {}, enArrierePlan: (p: Promise<unknown>) => p,
}));

import { OrderService } from "../order.service";

beforeEach(() => {
  jest.clearAllMocks();
  db.order.findUnique.mockResolvedValue({ status: "COMPLETED", deletedAt: null });
  db.order.updateMany.mockResolvedValue({ count: 1 });
});

describe("A03 : archivage sécurisé des commandes", () => {
  it("archive une commande terminée sans suppression physique", async () => {
    await expect(OrderService.delete("order-1")).resolves.toEqual({ id: "order-1", archived: true });
    expect(db.order.delete).not.toHaveBeenCalled();
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "COMPLETED", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("autorise l'archivage d'une commande refusée", async () => {
    db.order.findUnique.mockResolvedValue({ status: "REJECTED", deletedAt: null });
    await expect(OrderService.delete("order-1")).resolves.toMatchObject({ archived: true });
    expect(db.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "order-1", status: "REJECTED", deletedAt: null },
    }));
  });

  it.each(["PENDING", "ACCEPTED", "PREPARING", "READY"])(
    "interdit l'archivage d'une commande active : %s", async (status) => {
      db.order.findUnique.mockResolvedValue({ status, deletedAt: null });
      await expect(OrderService.delete("order-1")).rejects.toMatchObject({
        statusCode: 409, code: "ORDER_NOT_TERMINAL",
      });
      expect(db.order.updateMany).not.toHaveBeenCalled();
    }
  );

  it("renvoie 404 pour une commande inexistante", async () => {
    db.order.findUnique.mockResolvedValue(null);
    await expect(OrderService.delete("missing")).rejects.toMatchObject({
      statusCode: 404, code: "ORDER_NOT_FOUND",
    });
  });

  it("empêche le double archivage", async () => {
    db.order.findUnique.mockResolvedValue({ status: "COMPLETED", deletedAt: new Date() });
    await expect(OrderService.delete("order-1")).rejects.toMatchObject({
      statusCode: 409, code: "ORDER_ALREADY_ARCHIVED",
    });
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it("détecte une modification concurrente", async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(OrderService.delete("order-1")).rejects.toMatchObject({
      statusCode: 409, code: "ORDER_STATE_CONFLICT",
    });
  });
});
