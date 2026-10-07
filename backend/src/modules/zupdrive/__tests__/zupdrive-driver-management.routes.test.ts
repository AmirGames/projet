import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const journaliser: any = jest.fn(async () => undefined);
const service: any = {
  suspendDriver: jest.fn(async () => undefined),
  reactivateDriver: jest.fn(async () => undefined),
  validateDocument: jest.fn(async () => undefined),
  reportInfraction: jest.fn(async () => "inf-1"),
  resolveInfraction: jest.fn(async () => undefined),
};
const sections: Array<string | undefined> = [];
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../zupdrive-driver-management.service", () => ({ ZupDriveDriverManagementService: service }));
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
import router from "../zupdrive-driver-management.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/admin", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const equipe = { "x-user": "equipe", "x-equipe": "1" };
const chauffeur = { "x-user": "chauffeur" };

beforeEach(() => { jest.clearAllMocks(); });

describe("gestion des chauffeurs : équipe uniquement", () => {
  it("la section demandée est « chauffeurs »", () => expect(sections).toContain("chauffeurs"));

  it.each([
    ["post", "/drivers/c1/suspend", { reason: "Motif de suspension" }],
    ["post", "/drivers/c1/reactivate", {}],
    ["post", "/drivers/c1/validate-document", { type: "PERMIS", expiresAt: "2030-01-01T00:00:00.000Z" }],
    ["post", "/drivers/c1/report-infraction", { type: "AUTRE", description: "Une description assez longue", severity: "BASSE" }],
    ["post", "/infractions/i1/resolve", { resolution: "Résolu après entretien" }],
  ] as const)("sans jeton, %s %s : 401", async (m, url, corps) => {
    expect((await (request(app) as any)[m](`/api/zupdrive/admin${url}`).send(corps)).status).toBe(401);
    expect(journaliser).not.toHaveBeenCalled();
  });

  it("un chauffeur ne peut pas se réactiver lui-même", async () => {
    const res = await request(app).post("/api/zupdrive/admin/drivers/c1/reactivate").set(chauffeur);
    expect(res.status).toBe(403);
    expect(service.reactivateDriver).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});

describe("gestion des chauffeurs : chaque écriture est journalisée", () => {
  it("suspension", async () => {
    const res = await request(app).post("/api/zupdrive/admin/drivers/c1/suspend").set(equipe).send({ reason: "Plaintes répétées" });
    expect(res.status).toBe(200);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_SUSPEND_CHAUFFEUR", "c1", { apres: "SUSPENDU", motif: "Plaintes répétées" });
  });

  it("réactivation", async () => {
    await request(app).post("/api/zupdrive/admin/drivers/c1/reactivate").set(equipe);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_REACTIVATE_CHAUFFEUR", "c1", { avant: "SUSPENDU", apres: "VALIDE" });
  });

  it("validation d'une pièce", async () => {
    await request(app).post("/api/zupdrive/admin/drivers/c1/validate-document").set(equipe).send({ type: "PERMIS", expiresAt: "2030-01-01T00:00:00.000Z" });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_VALIDATE_CHAUFFEUR_DOCUMENT", "c1", { type: "PERMIS", expiresAt: "2030-01-01T00:00:00.000Z" });
  });

  it("infraction grave : la suspension automatique est tracée", async () => {
    await request(app).post("/api/zupdrive/admin/drivers/c1/report-infraction").set(equipe).send({ type: "ACCIDENT", description: "Accident avec blessés", severity: "HAUTE" });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_REPORT_INFRACTION", "c1", { infractionId: "inf-1", type: "ACCIDENT", severity: "HAUTE", suspensionAutomatique: true });
  });

  it("résolution d'une infraction", async () => {
    await request(app).post("/api/zupdrive/admin/infractions/i1/resolve").set(equipe).send({ resolution: "Résolu après entretien" });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_RESOLVE_INFRACTION", "i1", { resolution: "Résolu après entretien" });
  });

  it("une entrée invalide n'écrit ni ne journalise rien", async () => {
    const res = await request(app).post("/api/zupdrive/admin/drivers/c1/suspend").set(equipe).send({ reason: "x" });
    expect(res.status).toBe(400);
    expect(service.suspendDriver).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});
