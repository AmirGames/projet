/**
 * Tests de caractérisation de /api/admin/config (configuration système vue par
 * l'administration). Ils figent accès, validation, requêtes Prisma,
 * invalidation du cache de maintenance et journal avant l'extraction de la
 * logique vers un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = { systemConfig: model("findFirst", "create", "update"), systemAuditLog: model("create") };
const invalidateMaintenanceCache = jest.fn();

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers.authorization?.replace("Bearer ", "");
    if (!["admin", "client"].includes(who)) return res.status(401).json({});
    req.userId = who;
    req.compte = { isSystemAdmin: who === "admin" };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
jest.mock("../../monitoring/maintenance.middleware", () => ({ invalidateMaintenanceCache: (...a: any[]) => invalidateMaintenanceCache(...a) }));

import router from "../config.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/admin", router);
app.use(errorHandler);
const admin = (r: request.Test) => r.set("Authorization", "Bearer admin");

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("GET /config", () => {
  it("401 sans session, 403 sans droit", async () => {
    expect((await request(app).get("/api/admin/config")).status).toBe(401);
    expect((await request(app).get("/api/admin/config").set("Authorization", "Bearer client")).status).toBe(403);
  });
  it("rend la configuration telle quelle ; en crée une si absente", async () => {
    db.systemConfig.findFirst.mockResolvedValue({ id: "cfg1", platformFeePercent: 5 });
    let r = await admin(request(app).get("/api/admin/config"));
    expect(r.body).toEqual({ id: "cfg1", platformFeePercent: 5 });
    expect(db.systemConfig.create).not.toHaveBeenCalled();
    db.systemConfig.findFirst.mockResolvedValue(null);
    db.systemConfig.create.mockResolvedValue({ id: "cfg2" });
    r = await admin(request(app).get("/api/admin/config"));
    expect(r.body).toEqual({ id: "cfg2" });
    expect(db.systemConfig.create).toHaveBeenCalledWith({ data: {} });
  });
});

describe("PUT /config", () => {
  const modifier = (corps: any) => admin(request(app).put("/api/admin/config").send(corps));
  it("401 sans session, 403 sans droit, 400 sur corps invalide", async () => {
    expect((await request(app).put("/api/admin/config").send({})).status).toBe(401);
    expect((await request(app).put("/api/admin/config").set("Authorization", "Bearer client").send({})).status).toBe(403);
    expect((await modifier({ platformFeePercent: 150 })).status).toBe(400);
    expect((await modifier({ driverOfferSeconds: 5 })).status).toBe(400);
    expect(db.systemConfig.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("met à jour, invalide le cache de maintenance, journalise et rend la configuration", async () => {
    db.systemConfig.findFirst.mockResolvedValue({ id: "cfg1" });
    db.systemConfig.update.mockResolvedValue({ id: "cfg1", platformFeePercent: 8, selectedTheme: "sombre" });
    const r = await modifier({ platformFeePercent: 8, selectedTheme: "sombre", inconnu: 1 });
    expect(r.body).toEqual({ id: "cfg1", platformFeePercent: 8, selectedTheme: "sombre" });
    expect(db.systemConfig.update).toHaveBeenCalledWith({ where: { id: "cfg1" }, data: { platformFeePercent: 8, selectedTheme: "sombre" } });
    expect(invalidateMaintenanceCache).toHaveBeenCalledTimes(1);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "admin", action: "UPDATE_SYSTEM_CONFIG", target: "SYSTEM_CONFIG", changes: { platformFeePercent: 8, selectedTheme: "sombre" } },
    });
  });
  it("sans configuration existante : la crée avant la mise à jour", async () => {
    db.systemConfig.findFirst.mockResolvedValue(null);
    db.systemConfig.create.mockResolvedValue({ id: "cfg9" });
    db.systemConfig.update.mockResolvedValue({ id: "cfg9" });
    await modifier({ maintenanceMode: true });
    expect(db.systemConfig.create).toHaveBeenCalledWith({ data: {} });
    expect(db.systemConfig.update).toHaveBeenCalledWith({ where: { id: "cfg9" }, data: { maintenanceMode: true } });
  });
});
