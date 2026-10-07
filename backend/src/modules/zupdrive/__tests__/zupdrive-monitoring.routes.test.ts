import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn(), count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  courseDrive: { count: jest.fn(async () => 0) },
  noteCourseDrive: { aggregate: jest.fn(async () => ({ _avg: { note: 4 } })), groupBy: jest.fn(async () => []) },
  complianceReportDrive: { findMany: jest.fn(async () => []) },
  documentChauffeurDrive: { findMany: jest.fn(async () => []) },
  driverPayoutDrive: { findMany: jest.fn(async () => []) },
};
const service: any = {
  getUnreadNotifications: jest.fn(async () => []),
  getNotificationStats: jest.fn(async () => ({})),
  markAsRead: jest.fn(async () => undefined),
  markAllAsRead: jest.fn(async () => 0),
  getDriverMetrics: jest.fn(async () => ({})),
  getAdminDashboard: jest.fn(async () => ({})),
};
const demandes: Array<string | undefined> = [];
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../zupdrive-monitoring.service", () => ({ ZupDriveMonitoringService: service }));
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
    demandes.push(section);
    return (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" }));
  },
}));
import router from "../zupdrive-monitoring.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const equipe = { "x-user": "agent", "x-equipe": "1" };
const ROUTES_ADMIN = ["dashboard", "driver/c1/metrics", "alerts", "compliance-alerts", "document-expiration-alerts", "payout-failure-alerts", "health"];

beforeEach(() => { jest.clearAllMocks(); });

describe("supervision ZupDrive : routes d'administration", () => {
  it("demandent une section d'équipe, plus un rôle codé en dur", () => {
    expect(demandes).toEqual(expect.arrayContaining(["courses-drive", "chauffeurs"]));
  });

  it.each(ROUTES_ADMIN)("/admin/%s : 401 sans jeton, 403 pour un compte sans droit d'équipe", async (chemin) => {
    expect((await request(app).get(`/api/zupdrive/admin/${chemin}`)).status).toBe(401);
    expect((await request(app).get(`/api/zupdrive/admin/${chemin}`).set(alice)).status).toBe(403);
    expect(service.getAdminDashboard).not.toHaveBeenCalled();
    expect(service.getDriverMetrics).not.toHaveBeenCalled();
  });

  it.each(ROUTES_ADMIN)("/admin/%s : l'équipe y accède", async (chemin) => {
    expect((await request(app).get(`/api/zupdrive/admin/${chemin}`).set(equipe)).status).toBe(200);
  });

  it("type d'alerte inconnu : 400", async () => {
    expect((await request(app).get("/api/zupdrive/admin/alerts?type=n-importe-quoi").set(equipe)).status).toBe(400);
  });
});

describe("supervision ZupDrive : côté chauffeur", () => {
  it("les notifications sont celles du compte du jeton ; limit invalide : 400", async () => {
    expect((await request(app).get("/api/zupdrive/notifications?limit=5").set(alice)).status).toBe(200);
    expect(service.getUnreadNotifications).toHaveBeenCalledWith("user-alice", 5);
    expect((await request(app).get("/api/zupdrive/notifications?limit=abc").set(alice)).status).toBe(400);
  });

  it("marquer lue passe l'identité du jeton au service (qui refuse la notification d'un autre)", async () => {
    await request(app).post("/api/zupdrive/notifications/n1/read").set(alice);
    expect(service.markAsRead).toHaveBeenCalledWith("n1", "user-alice");
  });

  it("le point d'entrée /ws qui renvoyait le jeton dans une URL n'existe plus", async () => {
    expect((await request(app).get("/api/zupdrive/ws").set(alice)).status).toBe(404);
  });
});
