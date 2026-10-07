import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
  complianceCheck: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  complianceReport: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  complianceReportDrive: { findFirst: jest.fn(), findUnique: jest.fn() },
  auditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
};
const journaliser: any = jest.fn(async () => undefined);
const sections: Array<string | undefined> = [];
const runFullCompliance: any = jest.fn(async () => ({ overallRiskLevel: "CRITICAL", overallRiskScore: 90, autoDecision: "REJECT" }));
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../zupdrive-compliance-checks.service", () => ({ ZupDriveComplianceChecksService: { runFullCompliance, getPreviousReports: jest.fn(async () => []) } }));
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
import conformite from "../zupdrive-compliance.routes";
import controles from "../zupdrive-compliance-checks.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/compliance", conformite);
app.use("/api/zupdrive/compliance-checks", controles);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const equipe = { "x-user": "agent-1", "x-equipe": "1" };
const ligneControle = { id: "k1", chauffeurId: "c1", type: "PERIODIC_REVIEW", status: "PENDING", findings: [], expiresAt: new Date(), createdAt: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  db.chauffeurDrive.findUnique.mockImplementation(async ({ where }: any) => (where.id === "c1" ? { id: "c1" } : null));
  db.complianceCheck.create.mockResolvedValue(ligneControle);
  db.complianceCheck.findUnique.mockResolvedValue({ id: "k1" });
  db.complianceCheck.update.mockResolvedValue(ligneControle);
  db.complianceReport.create.mockImplementation(async ({ data }: any) => ({ id: "r1", generatedAt: new Date(), ...data }));
});

describe("conformité : le rôle codé en dur ADMIN_ZUPDRIVE est remplacé par la permission « chauffeurs »", () => {
  it("la section demandée est « chauffeurs »", () => expect(sections).toContain("chauffeurs"));

  it.each([
    ["post", "/api/zupdrive/compliance/admin/checks"],
    ["patch", "/api/zupdrive/compliance/admin/checks/k1"],
    ["post", "/api/zupdrive/compliance/admin/reports"],
    ["post", "/api/zupdrive/compliance-checks/admin/compliance/c1/run-checks"],
    ["get", "/api/zupdrive/compliance-checks/admin/compliance/dashboard"],
    ["get", "/api/zupdrive/compliance/admin/audit-logs"],
  ] as const)("%s %s : 401 sans jeton, 403 sans droit d'équipe", async (m, url) => {
    expect((await (request(app) as any)[m](url).send({})).status).toBe(401);
    expect((await (request(app) as any)[m](url).set({ "x-user": "chauffeur" }).send({})).status).toBe(403);
    expect(runFullCompliance).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});

describe("conformité : l'identité vient du jeton, les écritures sont journalisées", () => {
  it("l'audit ne peut plus être écrit par HTTP (acteur falsifiable)", async () => {
    const res = await request(app).post("/api/zupdrive/compliance/admin/audit-logs").set(equipe).send({ action: "FAKE", actorId: "autre", actorType: "ADMIN", resourceId: "x", resourceType: "DRIVER" });
    expect(res.status).toBe(404);
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("le contrôle est clos par le compte du jeton, pas par le corps", async () => {
    const res = await request(app).patch("/api/zupdrive/compliance/admin/checks/k1").set(equipe).send({ status: "PASSED", completedBy: "autre-agent" });
    expect(res.status).toBe(200);
    expect(db.complianceCheck.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ completedBy: "agent-1", status: "PASSED" }) }));
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_UPDATE_COMPLIANCE_CHECK", "k1", { apres: "PASSED", findings: undefined });
  });

  it("contrôle inconnu : 404 ; chauffeur inconnu à la création : 404", async () => {
    db.complianceCheck.findUnique.mockResolvedValue(null);
    expect((await request(app).patch("/api/zupdrive/compliance/admin/checks/zz").set(equipe).send({ status: "PASSED" })).status).toBe(404);
    expect((await request(app).post("/api/zupdrive/compliance/admin/checks").set(equipe).send({ chauffeurId: "inconnu", type: "PERIODIC_REVIEW", expiresAt: "2030-01-01T00:00:00.000Z" })).status).toBe(404);
    expect(db.complianceCheck.update).not.toHaveBeenCalled();
    expect(db.complianceCheck.create).not.toHaveBeenCalled();
  });

  it("le rapport est généré au nom du compte du jeton", async () => {
    const res = await request(app).post("/api/zupdrive/compliance/admin/reports").set(equipe).send({ reportType: "AD_HOC", generatedBy: "autre-agent" });
    expect(res.status).toBe(201);
    expect(JSON.stringify(db.complianceReport.create.mock.calls)).toContain("agent-1");
    expect(JSON.stringify(db.complianceReport.create.mock.calls)).not.toContain("autre-agent");
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_GENERATE_COMPLIANCE_REPORT", "r1", { reportType: "AD_HOC" });
  });

  it("le workflow de vérification de document n'est plus exposé (table en doublon)", async () => {
    expect((await request(app).post("/api/zupdrive/compliance/admin/document-verification").set(equipe).send({ chauffeurId: "c1", documentType: "PERMIS" })).status).toBe(404);
  });

  it("lancer les contrôles est journalisé, sans modifier le dossier du chauffeur", async () => {
    const res = await request(app).post("/api/zupdrive/compliance-checks/admin/compliance/c1/run-checks").set(equipe);
    expect(res.status).toBe(200);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_RUN_COMPLIANCE_CHECKS", "c1", { riskLevel: "CRITICAL", riskScore: 90, autoDecision: "REJECT" });
    expect(db.chauffeurDrive.findUnique).not.toHaveBeenCalled();
  });

  it("un format d'export inconnu est refusé", async () => {
    expect((await request(app).get("/api/zupdrive/compliance-checks/admin/compliance/r1/export?format=xml").set(equipe)).status).toBe(400);
  });
});
