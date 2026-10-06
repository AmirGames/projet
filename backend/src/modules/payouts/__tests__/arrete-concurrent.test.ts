import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  $executeRaw: jest.fn(),
  order: { findMany: jest.fn(), updateMany: jest.fn() },
  merchantPayout: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
};
const db: any = { $transaction: jest.fn(async (f: any) => f(tx)), order: tx.order, merchantPayout: tx.merchantPayout };

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ PAYOUTS_START_DATE: undefined }) }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../driver-payout.service", () => ({ DriverPayoutService: { arreterTous: jest.fn() }, MOYENS_VERSEMENT: [] }));

import { MerchantPayoutService } from "../merchant-payout.service";

const debut = new Date("2026-09-28T00:00:00Z");
const fin = new Date("2026-10-05T00:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (f: any) => f(tx));
  tx.merchantPayout.findMany.mockResolvedValue([]);
  tx.merchantPayout.create.mockResolvedValue({ id: "r-1", amount: 0, status: "PAID" });
});

describe("arrêté d'un commerçant : un seul relevé par passage", () => {
  it("prend un verrou par commerçant et relit les commandes dans la transaction", async () => {
    tx.order.findMany.mockResolvedValue([]);
    expect(await MerchantPayoutService.arreter("org-1", debut, fin)).toBeNull();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.order.findMany).toHaveBeenCalledTimes(1);
    expect(db.order.findMany).toBe(tx.order.findMany);
    expect(tx.merchantPayout.create).not.toHaveBeenCalled();
  });

  it("rattache seulement les commandes encore libres", async () => {
    tx.order.findMany.mockResolvedValue([]);
    tx.merchantPayout.findMany.mockResolvedValue([{ id: "rep-1", amount: -5 }]);
    tx.merchantPayout.create.mockResolvedValue({ id: "r-1", amount: -5, status: "CARRIED" });
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 1 });
    await MerchantPayoutService.arreter("org-1", debut, fin);
    expect(tx.merchantPayout.updateMany.mock.calls[0][0].where).toMatchObject({ carriedToId: null });
  });

  it("un rattachement partiel (autre relevé passé entre-temps) annule la transaction", async () => {
    tx.merchantPayout.findMany.mockResolvedValue([{ id: "rep-1", amount: -5 }]);
    tx.order.findMany.mockResolvedValue([]);
    tx.merchantPayout.updateMany.mockResolvedValue({ count: 0 });
    await expect(MerchantPayoutService.arreter("org-1", debut, fin)).rejects.toMatchObject({ code: "PAYOUT_CONFLICT" });
  });
});
