/**
 * Tests de caractérisation des contrôles de conformité ZupDrive (administration,
 * section « chauffeurs »). Ils figent accès, statuts, formes de réponse,
 * requêtes Prisma et journal avant l'extraction de la logique vers un service
 * (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  complianceReportDrive: model("findFirst", "findMany", "findUnique", "count", "aggregate"),
  systemAuditLog: model("create"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../zupdrive-garde", () => ({
  adminAuthSection: (section: string) => [
    (req: any, res: any, next: any) => {
      if (!req.headers["x-user"]) return res.status(401).json({ code: "UNAUTHORIZED" });
      const droits = String(req.headers["x-droits"] ?? "").split(",");
      if (!droits.includes("owner") && !droits.includes(section)) return res.status(403).json({ code: "FORBIDDEN" });
      req.userId = req.headers["x-user"];
      next();
    },
  ],
}));
jest.mock("../zupdrive-compliance-checks.service", () => ({
  ZupDriveComplianceChecksService: {
    runFullCompliance: jest.fn(async () => ({ overallRiskLevel: "LOW", overallRiskScore: 12, autoDecision: "APPROVE" })),
    getPreviousReports: jest.fn(async () => [{ id: "r1" }, { id: "r2" }]),
  },
}));

import router from "../zupdrive-compliance-checks.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { ZupDriveComplianceChecksService as Service } from "../zupdrive-compliance-checks.service";

const app = express();
app.use(express.json());
app.use("/api/zupdrive", router);
app.use(errorHandler);
const equipe = { "x-user": "equipe", "x-droits": "chauffeurs" };

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("accès : section « chauffeurs »", () => {
  it.each([
    ["post", "/admin/compliance/ch1/run-checks"], ["get", "/admin/compliance/ch1/latest"], ["get", "/admin/compliance/ch1/history"],
    ["get", "/admin/compliance/flagged-for-review"], ["get", "/admin/compliance/dashboard"], ["get", "/admin/compliance/r1/export"],
  ])("%s %s : 401 sans jeton, 403 sans la section", async (method, path) => {
    expect((await (request(app) as any)[method](`/api/zupdrive${path}`)).status).toBe(401);
    expect((await (request(app) as any)[method](`/api/zupdrive${path}`).set({ "x-user": "u", "x-droits": "courses-drive" })).status).toBe(403);
    expect(Service.runFullCompliance).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("contrôles et rapports", () => {
  it("POST …/run-checks : lance les contrôles et journalise", async () => {
    const r = await request(app).post("/api/zupdrive/admin/compliance/ch1/run-checks").set(equipe);
    expect(r.body).toEqual({ success: true, message: "Compliance checks completed", report: { overallRiskLevel: "LOW", overallRiskScore: 12, autoDecision: "APPROVE" } });
    expect(Service.runFullCompliance).toHaveBeenCalledWith("ch1");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "equipe", action: "ZUPDRIVE_RUN_COMPLIANCE_CHECKS", target: "ch1", changes: { riskLevel: "LOW", riskScore: 12, autoDecision: "APPROVE" } },
    });
    expect((await request(app).post(`/api/zupdrive/admin/compliance/${"x".repeat(65)}/run-checks`).set(equipe)).status).toBe(400);
  });
  it("GET …/:chauffeurId/latest : dernier rapport ou 404", async () => {
    db.complianceReportDrive.findFirst.mockResolvedValue(null);
    let r = await request(app).get("/api/zupdrive/admin/compliance/ch1/latest").set(equipe);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "No compliance report found" });
    db.complianceReportDrive.findFirst.mockResolvedValue({ id: "r1" });
    r = await request(app).get("/api/zupdrive/admin/compliance/ch1/latest").set(equipe);
    expect(r.body).toEqual({ success: true, report: { id: "r1" } });
    expect(db.complianceReportDrive.findFirst).toHaveBeenCalledWith({ where: { chauffeurId: "ch1" }, orderBy: { createdAt: "desc" } });
  });
  it("GET …/:chauffeurId/history : limite 10 par défaut, max 50", async () => {
    const r = await request(app).get("/api/zupdrive/admin/compliance/ch1/history").set(equipe);
    expect(r.body).toEqual({ success: true, count: 2, reports: [{ id: "r1" }, { id: "r2" }] });
    expect(Service.getPreviousReports).toHaveBeenCalledWith("ch1", 10);
    await request(app).get("/api/zupdrive/admin/compliance/ch1/history?limit=50").set(equipe);
    expect(Service.getPreviousReports).toHaveBeenLastCalledWith("ch1", 50);
    expect((await request(app).get("/api/zupdrive/admin/compliance/ch1/history?limit=51").set(equipe)).status).toBe(400);
  });
  it("GET …/flagged-for-review : risque élevé, score le plus bas d'abord", async () => {
    db.complianceReportDrive.findMany.mockResolvedValue([{ id: "r1" }]);
    const r = await request(app).get("/api/zupdrive/admin/compliance/flagged-for-review").set(equipe);
    expect(r.body).toEqual({ success: true, count: 1, flaggedCases: [{ id: "r1" }] });
    expect(db.complianceReportDrive.findMany).toHaveBeenCalledWith({
      where: { riskLevel: { in: ["HIGH", "CRITICAL"] } }, orderBy: { complianceScore: "asc" }, take: 50,
      select: { id: true, chauffeurId: true, complianceScore: true, riskLevel: true, createdAt: true, chauffeur: { select: { nomComplet: true, user: { select: { email: true } } } } },
    });
  });
  it("GET …/dashboard : répartition des risques et score moyen", async () => {
    db.complianceReportDrive.count.mockImplementation(async (a: any) => {
      const n = a?.where?.riskLevel;
      return n === undefined ? 20 : n === "CRITICAL" ? 1 : n === "HIGH" ? 2 : n === "MEDIUM" ? 5 : n === "LOW" ? 12 : 3;
    });
    db.complianceReportDrive.findMany.mockResolvedValue([{ id: "r9" }]);
    db.complianceReportDrive.aggregate.mockResolvedValue({ _avg: { complianceScore: 82.4 } });
    const r = await request(app).get("/api/zupdrive/admin/compliance/dashboard").set(equipe);
    expect(r.body).toEqual({
      success: true,
      dashboard: { totalReports: 20, riskDistribution: { critical: 1, high: 2, medium: 5, low: 12 }, flaggedForReview: 3, averageRiskScore: 18, recentReports: [{ id: "r9" }] },
    });
    expect(db.complianceReportDrive.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" }, take: 5, select: { id: true, chauffeurId: true, complianceScore: true, riskLevel: true, createdAt: true },
    });
    db.complianceReportDrive.aggregate.mockResolvedValue({ _avg: { complianceScore: null } });
    expect((await request(app).get("/api/zupdrive/admin/compliance/dashboard").set(equipe)).body.dashboard.averageRiskScore).toBe(0);
  });
  it("GET …/:reportId/export : json, pdf non implémenté, rapport inconnu", async () => {
    db.complianceReportDrive.findUnique.mockResolvedValue(null);
    let r = await request(app).get("/api/zupdrive/admin/compliance/r1/export").set(equipe);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Report not found" });
    db.complianceReportDrive.findUnique.mockResolvedValue({ id: "r1" });
    r = await request(app).get("/api/zupdrive/admin/compliance/r1/export").set(equipe);
    expect(r.body).toEqual({ success: true, report: { id: "r1" } });
    expect(db.complianceReportDrive.findUnique).toHaveBeenCalledWith({
      where: { id: "r1" },
      include: { chauffeur: { select: { nomComplet: true, region: true, user: { select: { email: true } } } } },
    });
    r = await request(app).get("/api/zupdrive/admin/compliance/r1/export?format=pdf").set(equipe);
    expect(r.status).toBe(501);
    expect(r.body).toEqual({ error: "PDF export not yet implemented" });
    expect((await request(app).get("/api/zupdrive/admin/compliance/r1/export?format=xml").set(equipe)).status).toBe(400);
  });
});
