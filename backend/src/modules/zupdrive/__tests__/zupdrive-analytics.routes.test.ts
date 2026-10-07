import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const service: any = {
  getPeriodAnalytics: jest.fn(async () => ({ ok: true })),
  getDriverPerformance: jest.fn(async () => []),
  getRegionalAnalytics: jest.fn(async () => []),
  getPaymentAnalytics: jest.fn(async () => ({})),
  comparePeriods: jest.fn(async () => ({})),
  getDashboardSummary: jest.fn(async () => ({})),
};
const sections: Array<string | undefined> = [];
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../zupdrive-analytics.service", () => ({ ZupDriveAnalyticsService: service }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    req.compte = { id: req.userId, isSuperOwner: false, isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: (_r: string, _p: string, section?: string) => {
    sections.push(section);
    return (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" }));
  },
}));
import router from "../zupdrive-analytics.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/analytics", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const equipe = { "x-user": "agent", "x-equipe": "1" };
const periode = "startDate=2026-01-01T00:00:00.000Z&endDate=2026-02-01T00:00:00.000Z";

beforeEach(() => { jest.clearAllMocks(); });

describe("statistiques ZupDrive", () => {
  it("section « courses-drive »", () => expect(sections).toContain("courses-drive"));

  it.each(["period", "drivers", "regions", "payments", "dashboard"])("/%s : 401 sans jeton, 403 pour un chauffeur", async (chemin) => {
    expect((await request(app).get(`/api/zupdrive/analytics/${chemin}?${periode}`)).status).toBe(401);
    expect((await request(app).get(`/api/zupdrive/analytics/${chemin}?${periode}`).set({ "x-user": "chauffeur" })).status).toBe(403);
    expect(service.getPeriodAnalytics).not.toHaveBeenCalled();
  });

  it("l'équipe lit une période valide", async () => {
    expect((await request(app).get(`/api/zupdrive/analytics/period?${periode}`).set(equipe)).status).toBe(200);
    expect(service.getPeriodAnalytics).toHaveBeenCalledTimes(1);
  });

  it("refuse une période inversée ou de plus d'un an", async () => {
    expect((await request(app).get("/api/zupdrive/analytics/period?startDate=2026-02-01T00:00:00.000Z&endDate=2026-01-01T00:00:00.000Z").set(equipe)).status).toBe(400);
    expect((await request(app).get("/api/zupdrive/analytics/regions?startDate=2020-01-01T00:00:00.000Z&endDate=2026-01-01T00:00:00.000Z").set(equipe)).status).toBe(400);
    expect((await request(app).get("/api/zupdrive/analytics/compare?period1Start=2026-01-01T00:00:00.000Z&period1End=2026-02-01T00:00:00.000Z&period2Start=2010-01-01T00:00:00.000Z&period2End=2026-01-01T00:00:00.000Z").set(equipe)).status).toBe(400);
    expect(service.getPeriodAnalytics).not.toHaveBeenCalled();
    expect(service.getRegionalAnalytics).not.toHaveBeenCalled();
    expect(service.comparePeriods).not.toHaveBeenCalled();
  });
});
