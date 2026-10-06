import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tx: any = {
  $executeRaw: jest.fn(),
  order: { findMany: jest.fn(), updateMany: jest.fn() },
  merchantPayout: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  payment: { updateMany: jest.fn() },
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
    // commandes dues + remboursements à répercuter
    expect(tx.order.findMany).toHaveBeenCalledTimes(2);
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

  it("répercute un remboursement sur une commande déjà versée, une seule fois", async () => {
    const vendue = {
      id: "o-1", totalAmount: 20.25, feesAmount: 5, serviceFeeAmount: 0.25, discountAmount: 0,
      commissionAmount: 1.2, deliveryMode: "PLATFORM", paymentId: "pi_1", status: "COMPLETED",
      payments: [{ id: "pay-1", refundedAmount: 10.125, refundAccountedAmount: 0 }],
    };
    tx.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([vendue]);
    tx.merchantPayout.create.mockResolvedValue({ id: "r-2", amount: -6.9, status: "CARRIED" });
    tx.payment.updateMany.mockResolvedValue({ count: 1 });

    await MerchantPayoutService.arreter("org-1", debut, fin);

    const ligne = (tx.merchantPayout.create.mock.calls[0][0] as any).data.lines;
    expect(ligne.map((l: any) => [l.code, l.montant])).toEqual([["210", 0.6], ["310", -7.5]]);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "pay-1", refundAccountedAmount: 0 },
      data: { refundAccountedAmount: 10.125 },
    });
  });

  it("un remboursement déjà repris par un autre relevé annule la transaction", async () => {
    const vendue = {
      id: "o-1", totalAmount: 20.25, feesAmount: 5, serviceFeeAmount: 0.25, discountAmount: 0,
      commissionAmount: 1.2, deliveryMode: "PLATFORM", paymentId: "pi_1", status: "COMPLETED",
      payments: [{ id: "pay-1", refundedAmount: 20.25, refundAccountedAmount: 0 }],
    };
    tx.order.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([vendue]);
    tx.merchantPayout.create.mockResolvedValue({ id: "r-2", amount: -13.8, status: "CARRIED" });
    tx.payment.updateMany.mockResolvedValue({ count: 0 });
    await expect(MerchantPayoutService.arreter("org-1", debut, fin)).rejects.toMatchObject({ code: "PAYOUT_CONFLICT" });
  });
});
