import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  courseDrive: { findMany: jest.fn() },
  paymentIntentDrive: { aggregate: jest.fn() },
  driverPayoutDrive: { aggregate: jest.fn(), groupBy: jest.fn() },
  chauffeurDrive: { findMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
import { ZupDriveReportingService } from "../zupdrive-reporting.service";

beforeEach(() => {
  jest.clearAllMocks();
  db.driverPayoutDrive.groupBy.mockResolvedValue([]);
  db.chauffeurDrive.findMany.mockResolvedValue([]);
});

describe("rapport financier : marge de la plateforme", () => {
  it("netProfit = commissions : la part chauffeur versée n'est pas retirée une seconde fois", async () => {
    // 2 courses de 5000 c. à 20 % : commission 1000 + 1000, versements 4000 + 4000.
    db.courseDrive.findMany.mockResolvedValue([{ prixCentimes: 5000 }, { prixCentimes: 5000 }]);
    db.paymentIntentDrive.aggregate.mockResolvedValue({ _sum: { platformCommissionCentimes: 2000 } });
    db.driverPayoutDrive.aggregate.mockResolvedValue({ _sum: { amountCentimes: 8000 } });

    const r = await ZupDriveReportingService.generateFinancialReport({ startDate: new Date(0), endDate: new Date() });

    expect(r.revenue.total).toBe(10000);
    expect(r.expenses).toMatchObject({ commissions: 2000, payouts: 8000, refunds: 0, platformFees: 0 });
    expect(r.netProfit).toBe(2000);
    expect(r.profitMargin).toBe(20);
  });

  it("sans paiement confirmé, la marge est nulle (pas négative)", async () => {
    db.courseDrive.findMany.mockResolvedValue([{ prixCentimes: 5000 }]);
    db.paymentIntentDrive.aggregate.mockResolvedValue({ _sum: { platformCommissionCentimes: null } });
    db.driverPayoutDrive.aggregate.mockResolvedValue({ _sum: { amountCentimes: null } });
    const r = await ZupDriveReportingService.generateFinancialReport({ startDate: new Date(0), endDate: new Date() });
    expect(r.netProfit).toBe(0);
  });
});
