/**
 * Tests de caractérisation de la configuration de la plateforme côté superowner
 * (/api/superowner/system-config et /advanced-settings). Ils figent accès,
 * validations, formes de réponse, requêtes Prisma, invalidation du cache de
 * maintenance et journal avant l'extraction de la logique vers un service
 * (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  systemConfig: model("findFirst", "create", "update"),
  webhook: model("count"),
  user: model("findUnique"),
  systemAuditLog: model("create"),
};
db.$queryRaw = jest.fn();
const invalidateMaintenanceCache = jest.fn();

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers.authorization?.replace("Bearer ", "");
    if (!["owner", "client"].includes(who)) return res.status(401).json({});
    req.userId = who;
    req.compte = { isSuperOwner: who === "owner", isSystemAdmin: who === "owner", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSuperOwner ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
jest.mock("../../auth/api-key.service", () => ({ ApiKeyService: { list: jest.fn(async () => [{ id: "k1", name: "Clé" }]) } }));
jest.mock("../../monitoring/maintenance.middleware", () => ({ invalidateMaintenanceCache: (...a: any[]) => invalidateMaintenanceCache(...a) }));

import router from "../config.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/superowner", router);
app.use(errorHandler);
const owner = (r: request.Test) => r.set("Authorization", "Bearer owner");

const config = (extra: any = {}) => ({
  id: "cfg1", platformFeePercent: "5", minOrderAmount: "10", maxOrderAmount: "500", maintenanceMode: false, maintenanceMessage: null,
  driverMaxRadiusKm: 10, driverBikeMaxKm: 3, driverScooterMaxKm: 6, driverExceptionSeconds: 120, driverSoonFreeKm: 0.5,
  driverSoonFreeSeconds: 60, driverOfferSeconds: 45, driverMaxCourses: 3, driverGroupClientKm: 0.5, driverGroupDetourKm: 2,
  driverBaseFee: "2.5", driverPerKmFee: "0.8", serviceFee: "0.99", settings: {}, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) if (typeof m === "object") for (const f of Object.values(m as any)) (f as any).mockReset();
  db.$queryRaw.mockReset();
  db.user.findUnique.mockResolvedValue({ email: "owner@test.fr" });
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("accès", () => {
  it.each([["get", "/system-config"], ["put", "/system-config"], ["get", "/advanced-settings"], ["put", "/advanced-settings"]])(
    "%s %s : 401 sans session, 403 sans droit", async (method, path) => {
      expect((await (request(app) as any)[method](`/api/superowner${path}`).send({})).status).toBe(401);
      expect((await (request(app) as any)[method](`/api/superowner${path}`).set("Authorization", "Bearer client").send({})).status).toBe(403);
      expect(db.systemConfig.update).not.toHaveBeenCalled();
      expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    });
});

describe("GET /system-config", () => {
  it("état réel : base, webhooks, clés d'API et réglages en nombres", async () => {
    db.systemConfig.findFirst.mockResolvedValue(config());
    db.$queryRaw.mockReturnValue(Promise.resolve([{ version: "PostgreSQL 16.4 on x86_64" }]));
    db.webhook.count.mockImplementation(async (a: any) => (a?.where?.status === "ACTIVE" ? 2 : 3));
    const r = await owner(request(app).get("/api/superowner/system-config"));
    expect(r.status).toBe(200);
    expect(r.body.config).toMatchObject({
      database: { status: "CONNECTED", version: "16.4" }, webhooks: { enabled: true, count: 3, active: 2 }, apiKeys: [{ id: "k1", name: "Clé" }],
      platformFeePercent: 5, minOrderAmount: 10, maxOrderAmount: 500, maintenanceMode: false, maintenanceMessage: "",
      driverMaxRadiusKm: 10, driverBaseFee: 2.5, driverPerKmFee: 0.8, serviceFee: 0.99,
    });
    expect(typeof r.body.config.apiVersion).toBe("string");
    expect(r.body.config.webhookUrl).toMatch(/\/api\/webhooks$/);
    expect(db.systemConfig.create).not.toHaveBeenCalled();
  });
  it("sans configuration : en crée une ; base injoignable : UNREACHABLE", async () => {
    db.systemConfig.findFirst.mockResolvedValue(null);
    db.systemConfig.create.mockResolvedValue(config());
    db.$queryRaw.mockReturnValue(Promise.reject(new Error("down")));
    db.webhook.count.mockResolvedValue(0);
    const r = await owner(request(app).get("/api/superowner/system-config"));
    expect(db.systemConfig.create).toHaveBeenCalledWith({ data: {} });
    expect(r.body.config.database).toEqual({ status: "UNREACHABLE", version: "inconnue" });
    expect(r.body.config.webhooks).toEqual({ enabled: false, count: 0, active: 0 });
  });
});

describe("PUT /system-config", () => {
  const modifier = (corps: any) => owner(request(app).put("/api/superowner/system-config").send(corps));
  it("validation Zod, minimum > maximum, vélo > scooter → 400", async () => {
    expect((await modifier({ platformFeePercent: 101 })).status).toBe(400);
    let r = await modifier({ minOrderAmount: 100, maxOrderAmount: 50 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_RANGE");
    expect(db.systemConfig.findFirst).not.toHaveBeenCalled();
    db.systemConfig.findFirst.mockResolvedValue(config());
    r = await modifier({ driverBikeMaxKm: 10 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_RANGE");
    r = await modifier({ driverScooterMaxKm: 2 });
    expect(r.body.code).toBe("INVALID_RANGE");
    expect(db.systemConfig.update).not.toHaveBeenCalled();
    expect(invalidateMaintenanceCache).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("enregistre, invalide le cache de maintenance, journalise", async () => {
    db.systemConfig.findFirst.mockResolvedValue(config());
    db.systemConfig.update.mockResolvedValue(config({ platformFeePercent: "7", maintenanceMode: true, maintenanceMessage: "Retour 18h" }));
    const r = await modifier({ platformFeePercent: 7, maintenanceMode: true, maintenanceMessage: "Retour 18h" });
    expect(r.status).toBe(200);
    expect(r.body.message).toBe("Configuration enregistrée");
    expect(r.body.config).toMatchObject({ platformFeePercent: 7, maintenanceMode: true, maintenanceMessage: "Retour 18h", driverBaseFee: 2.5, serviceFee: 0.99 });
    expect(db.systemConfig.update).toHaveBeenCalledWith({ where: { id: "cfg1" }, data: { platformFeePercent: 7, maintenanceMode: true, maintenanceMessage: "Retour 18h" } });
    expect(invalidateMaintenanceCache).toHaveBeenCalledTimes(1);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "owner", action: "SYSTEM_CONFIG_UPDATED", target: "cfg1", changes: { platformFeePercent: 7, maintenanceMode: true, maintenanceMessage: "Retour 18h" } },
    });
  });
  it("sans configuration existante : la crée d'abord", async () => {
    db.systemConfig.findFirst.mockResolvedValue(null);
    db.systemConfig.create.mockResolvedValue(config());
    db.systemConfig.update.mockResolvedValue(config());
    await modifier({ serviceFee: 1 });
    expect(db.systemConfig.create).toHaveBeenCalledWith({ data: {} });
    expect(db.systemConfig.update).toHaveBeenCalledWith({ where: { id: "cfg1" }, data: { serviceFee: 1 } });
  });
});

describe("/advanced-settings", () => {
  it("GET : valeurs par défaut fusionnées avec les réglages enregistrés, colonnes dédiées en priorité", async () => {
    db.systemConfig.findFirst.mockResolvedValue(config({ maintenanceMode: true, maintenanceMessage: "Bientôt", settings: { debugMode: true, maintenanceMode: false, performanceOptimizations: { cacheDuration: 60 } } }));
    const r = await owner(request(app).get("/api/superowner/advanced-settings"));
    expect(r.body).toEqual({
      settings: {
        maintenanceMode: true, maintenanceMessage: "Bientôt", debugMode: true, enabledFeatures: [],
        performanceOptimizations: { cacheEnabled: true, cacheDuration: 60, compressionEnabled: true }, id: "cfg1",
      },
    });
  });
  it("GET sans configuration : en crée une", async () => {
    db.systemConfig.findFirst.mockResolvedValue(null);
    db.systemConfig.create.mockResolvedValue(config());
    const r = await owner(request(app).get("/api/superowner/advanced-settings"));
    expect(db.systemConfig.create).toHaveBeenCalledWith({ data: {} });
    expect(r.body.settings).toMatchObject({ maintenanceMode: false, maintenanceMessage: "", debugMode: false, id: "cfg1" });
  });
  it("PUT : fusionne, ignore l'id du corps, écrit les colonnes de maintenance, invalide le cache, journalise", async () => {
    db.systemConfig.findFirst.mockResolvedValue(config());
    db.systemConfig.update.mockImplementation(async ({ data }: any) => config({ settings: data.settings, maintenanceMode: data.maintenanceMode ?? false, maintenanceMessage: data.maintenanceMessage ?? null }));
    const r = await owner(request(app).put("/api/superowner/advanced-settings").send({
      id: "autre", maintenanceMode: true, maintenanceMessage: "Maintenance", enabledFeatures: ["a"], performanceOptimizations: { cacheEnabled: false },
    }));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.message).toBe("Paramètres mis à jour avec succès");
    expect(r.body.settings).toMatchObject({
      id: "cfg1", maintenanceMode: true, maintenanceMessage: "Maintenance", enabledFeatures: ["a"], debugMode: false,
      performanceOptimizations: { cacheEnabled: false, cacheDuration: 3600, compressionEnabled: true },
    });
    const ecrit = (db.systemConfig.update.mock.calls[0][0] as any);
    expect(ecrit.where).toEqual({ id: "cfg1" });
    expect(ecrit.data.maintenanceMode).toBe(true);
    expect(ecrit.data.maintenanceMessage).toBe("Maintenance");
    // L'id du corps est ignoré ; celui de la configuration est conservé tel quel dans le JSON (comportement actuel).
    expect(ecrit.data.settings.id).toBe("cfg1");
    expect(invalidateMaintenanceCache).toHaveBeenCalledTimes(1);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "owner", action: "UPDATE_ADVANCED_SETTINGS", target: "SYSTEM_CONFIG", changes: { maintenanceMode: true, maintenanceMessage: "Maintenance", enabledFeatures: ["a"], performanceOptimizations: { cacheEnabled: false } } },
    });
  });
  it("PUT : corps invalide → 400 sans écriture", async () => {
    const r = await owner(request(app).put("/api/superowner/advanced-settings").send({ performanceOptimizations: { cacheDuration: -1 } }));
    expect(r.status).toBe(400);
    expect(db.systemConfig.update).not.toHaveBeenCalled();
  });
});
