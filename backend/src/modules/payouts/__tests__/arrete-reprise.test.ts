import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  order: { findMany: jest.fn() },
  merchantPayout: { findMany: jest.fn(), count: jest.fn() },
  courierPayout: { count: jest.fn() },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ PAYOUTS_START_DATE: undefined }) }));
jest.mock("../../realtime/socket", () => ({ emitNotification: jest.fn() }));
jest.mock("../driver-payout.service", () => ({ DriverPayoutService: { arreterTous: jest.fn() }, MOYENS_VERSEMENT: [] }));

import { MerchantPayoutService } from "../merchant-payout.service";

const debut = new Date("2026-09-28T00:00:00Z");
const fin = new Date("2026-10-05T00:00:00Z");

describe("arreterTous — reprise après échec partiel", () => {
  beforeEach(() => { jest.resetAllMocks(); });

  it("saute les commerçants déjà arrêtés, rattrape les autres et survit à une erreur", async () => {
    db.order.findMany.mockResolvedValue([{ store: { orgId: "a" } }, { store: { orgId: "b" } }, { store: { orgId: "c" } }]);
    db.merchantPayout.findMany
      .mockResolvedValueOnce([]) // reports
      .mockResolvedValueOnce([{ orgId: "a" }]); // déjà arrêtés pour la période

    const arreter = jest
      .spyOn(MerchantPayoutService, "arreter")
      .mockRejectedValueOnce(new Error("panne") as never)
      .mockResolvedValueOnce({ id: "r-c" } as never);

    const releves = await MerchantPayoutService.arreterTous(debut, fin);

    expect(arreter).toHaveBeenCalledTimes(2);
    expect(arreter).not.toHaveBeenCalledWith("a", debut, fin);
    expect(releves).toEqual([{ id: "r-c" }]);
  });
});
