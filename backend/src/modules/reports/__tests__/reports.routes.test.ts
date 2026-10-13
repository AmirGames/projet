import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../auth/auth.middleware", () => ({ authMiddleware: (_req: any, _res: any, next: any) => next() }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn() } }));
jest.mock("../reports.service", () => ({ ReportsService: {
  getSalesReport: jest.fn(async () => ({ totalOrders: 0, orders: [] })),
  getRevenueByDate: jest.fn(async () => []),
  getProductPerformance: jest.fn(async () => ({ products: [], pagination: {} })),
  getCustomerAnalytics: jest.fn(async () => ({ customers: [], pagination: {} })),
  exportToCSV: jest.fn(() => ""),
} }));

import router from "../reports.routes";

const app = express();
app.use(express.json());
app.use("/api/reports", router);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ code: error.code }));

describe("contrat de bornage des rapports", () => {
  it("refuse les dates calendaires impossibles", async () => {
    const response = await request(app).get("/api/reports/sales?storeId=s1&startDate=2026-02-31");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REPORT_DATE");
  });

  it("refuse une période supérieure à 366 jours", async () => {
    const response = await request(app).get("/api/reports/sales?storeId=s1&startDate=2025-01-01&endDate=2026-01-02");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("REPORT_PERIOD_OUT_OF_RANGE");
  });

  it("refuse un lot supérieur à 100 lignes", async () => {
    const response = await request(app).get("/api/reports/sales?storeId=s1&limit=101");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_PAGINATION");
  });

  it("accepte une borne fin de jour date-only et le défaut de 50 lignes", async () => {
    const { ReportsService } = await import("../reports.service");
    const response = await request(app).get("/api/reports/sales?storeId=s1&startDate=2026-01-02&endDate=2026-01-03");
    expect(response.status).toBe(200);
    expect(ReportsService.getSalesReport).toHaveBeenCalledWith(expect.objectContaining({
      startDate: new Date("2026-01-02T00:00:00.000Z"),
      endDate: new Date("2026-01-03T23:59:59.999Z"),
      limit: 50,
      offset: 0,
    }));
  });
});
