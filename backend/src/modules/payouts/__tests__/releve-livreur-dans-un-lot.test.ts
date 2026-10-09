import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = { courierPayout: { findUnique: jest.fn(), updateMany: jest.fn() }, orderDelivery: { updateMany: jest.fn() }, courierTip: { updateMany: jest.fn() }, $transaction: jest.fn() };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
import { DriverPayoutService } from "../driver-payout.service";

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation(async (f: any) => f(db));
  db.courierPayout.updateMany.mockResolvedValue({ count: 0 });
});

describe("relevé livreur porté par un lot bancaire actif", () => {
  const dansUnLot = { id: "cp-1", status: "PENDING", driverId: "d1", amount: 40, batchId: "lot-1" };

  it("ne se paie pas à part : le virement partirait deux fois", async () => {
    db.courierPayout.findUnique.mockResolvedValue(dansUnLot);
    await expect(DriverPayoutService.payer("cp-1", { method: "BANK_TRANSFER" }, "admin")).rejects.toMatchObject({ code: "PAYOUT_IN_BATCH" });
    expect(db.courierPayout.updateMany).toHaveBeenCalledWith({ where: { id: "cp-1", status: "PENDING", batchId: null }, data: expect.objectContaining({ status: "PAID" }) });
  });

  it("ne s'annule pas à part", async () => {
    db.courierPayout.findUnique.mockResolvedValue(dansUnLot);
    await expect(DriverPayoutService.annuler("cp-1", "erreur")).rejects.toMatchObject({ code: "PAYOUT_IN_BATCH" });
    expect(db.orderDelivery.updateMany).not.toHaveBeenCalled();
    expect(db.courierTip.updateMany).not.toHaveBeenCalled();
  });
});
