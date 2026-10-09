/**
 * Tests de caractérisation de /api/admin/merchants et /api/admin/stores
 * (administration système). Ils figent accès, statuts, formes de réponse,
 * requêtes Prisma et entrées du journal avant l'extraction de la logique vers
 * un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  organization: model("findMany", "findUnique", "count", "update"),
  order: model("findMany"),
  systemConfig: model("findFirst"),
  store: model("findMany", "count"),
  systemAuditLog: model("create"),
};

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
jest.mock("../../merchants/merchant-closure.service", () => ({
  MerchantClosureService: {
    suspend: jest.fn(async (id: string) => ({ id, status: "SUSPENDED" })),
    unsuspend: jest.fn(async (id: string) => ({ id, status: "ACTIVE" })),
    close: jest.fn(async (id: string) => ({ organization: { id }, archive: { id: "archive-1" } })),
    restoreFromBackup: jest.fn(async (id: string) => ({ id, status: "ACTIVE" })),
  },
}));

import router from "../merchants.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { MerchantClosureService } from "../../merchants/merchant-closure.service";

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

describe("accès", () => {
  it.each([
    ["get", "/merchants"], ["get", "/merchants/o1"], ["patch", "/merchants/o1"], ["post", "/merchants/o1/suspend"],
    ["post", "/merchants/o1/unsuspend"], ["post", "/merchants/o1/close"], ["post", "/merchants/o1/restore-from-backup"], ["get", "/stores"],
  ])("%s %s : 401 sans session, 403 sans droit d'administration", async (method, path) => {
    expect((await (request(app) as any)[method](`/api/admin${path}`).send({})).status).toBe(401);
    expect((await (request(app) as any)[method](`/api/admin${path}`).set("Authorization", "Bearer client").send({})).status).toBe(403);
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("lecture", () => {
  it("GET /merchants : liste paginée, filtre de statut", async () => {
    db.organization.findMany.mockResolvedValue([{ id: "o1" }]);
    db.organization.count.mockResolvedValue(1);
    const r = await admin(request(app).get("/api/admin/merchants?status=ACTIVE&limit=5&offset=3"));
    expect(r.body).toEqual({ merchants: [{ id: "o1" }], pagination: { total: 1, limit: 5, offset: 3 } });
    expect(db.organization.findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE" }, skip: 3, take: 5,
      include: { stores: { select: { id: true, name: true } }, memberships: { select: { id: true, role: true, user: { select: { email: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    await admin(request(app).get("/api/admin/merchants"));
    expect((db.organization.findMany.mock.calls[1][0] as any).where).toEqual({});
  });
  it("GET /merchants/:orgId : introuvable → 404, sinon statistiques et commission", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    let r = await admin(request(app).get("/api/admin/merchants/o1"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NOT_FOUND");
    db.organization.findUnique.mockResolvedValue({ id: "o1", stores: [{ id: "s1" }, { id: "s2" }] });
    db.order.findMany.mockResolvedValue([{ totalAmount: "100" }, { totalAmount: "50.5" }]);
    db.systemConfig.findFirst.mockResolvedValue({ platformFeePercent: 10 });
    r = await admin(request(app).get("/api/admin/merchants/o1"));
    expect(r.body).toEqual({
      id: "o1", stores: [{ id: "s1" }, { id: "s2" }],
      stats: { totalRevenue: 150.5, commission: 15.05, ordersCount: 2 },
    });
    expect(db.order.findMany).toHaveBeenCalledWith({ where: { storeId: { in: ["s1", "s2"] } }, select: { totalAmount: true, createdAt: true } });
    db.systemConfig.findFirst.mockResolvedValue(null);
    r = await admin(request(app).get("/api/admin/merchants/o1"));
    expect(r.body.stats.commission).toBeCloseTo(7.525, 5);
  });
  it("GET /stores : recherche, pagination, forme", async () => {
    db.store.findMany.mockResolvedValue([{
      id: "s1", name: "Chez Test", slug: "chez", city: "Lyon", isOpen: true, rating: "4.5", createdAt: new Date("2026-10-01T00:00:00Z"),
      org: { id: "o1", name: "Org", status: "ACTIVE" }, _count: { products: 3, orders: 7 },
    }]);
    db.store.count.mockResolvedValue(1);
    const r = await admin(request(app).get("/api/admin/stores?search=lyon&limit=500&offset=2"));
    expect(r.body).toEqual({
      stores: [{ id: "s1", name: "Chez Test", slug: "chez", city: "Lyon", isOpen: true, rating: 4.5, createdAt: "2026-10-01T00:00:00.000Z", organization: { id: "o1", name: "Org", status: "ACTIVE" }, productCount: 3, orderCount: 7 }],
      pagination: { total: 1, limit: 200, offset: 2 },
    });
    expect(db.store.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, OR: [{ name: { contains: "lyon", mode: "insensitive" } }, { city: { contains: "lyon", mode: "insensitive" } }, { slug: { contains: "lyon", mode: "insensitive" } }] },
      take: 200, skip: 2, orderBy: { createdAt: "desc" },
      include: { org: { select: { id: true, name: true, status: true } }, _count: { select: { products: true, orders: true } } },
    });
  });
});

describe("modifications journalisées", () => {
  it("PATCH /merchants/:orgId : le statut passe par les routes dédiées, formule valide, journal", async () => {
    let r = await admin(request(app).patch("/api/admin/merchants/o1").send({ status: "CLOSED" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("USE_STATUS_ENDPOINTS");
    expect((await admin(request(app).patch("/api/admin/merchants/o1").send({ tier: "GOLD" }))).status).toBe(400);
    expect(db.organization.update).not.toHaveBeenCalled();
    db.organization.update.mockResolvedValue({ id: "o1", tier: "PRO" });
    r = await admin(request(app).patch("/api/admin/merchants/o1").send({ tier: "PRO" }));
    expect(r.body).toEqual({ id: "o1", tier: "PRO" });
    expect(db.organization.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { tier: "PRO" } });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "admin", action: "UPDATE_MERCHANT", target: "o1", changes: { tier: "PRO" } } });
  });
  it("POST …/suspend : raison requise, service puis journal", async () => {
    expect((await admin(request(app).post("/api/admin/merchants/o1/suspend").send({}))).status).toBe(400);
    expect(MerchantClosureService.suspend).not.toHaveBeenCalled();
    const r = await admin(request(app).post("/api/admin/merchants/o1/suspend").send({ reason: "Fraude" }));
    expect(r.body).toEqual({ id: "o1", status: "SUSPENDED" });
    expect(MerchantClosureService.suspend).toHaveBeenCalledWith("o1", "Fraude");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "admin", action: "SUSPEND_MERCHANT", target: "o1", changes: { reason: "Fraude" } } });
  });
  it("POST …/unsuspend", async () => {
    const r = await admin(request(app).post("/api/admin/merchants/o1/unsuspend"));
    expect(r.body).toEqual({ id: "o1", status: "ACTIVE" });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "admin", action: "UNSUSPEND_MERCHANT", target: "o1", changes: {} } });
  });
  it("POST …/close : raison requise, journal avec l'archive", async () => {
    expect((await admin(request(app).post("/api/admin/merchants/o1/close").send({}))).status).toBe(400);
    const r = await admin(request(app).post("/api/admin/merchants/o1/close").send({ reason: "Faillite" }));
    expect(r.body).toEqual({ organization: { id: "o1" }, archive: { id: "archive-1" } });
    expect(MerchantClosureService.close).toHaveBeenCalledWith("o1", "Faillite");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "admin", action: "CLOSE_MERCHANT", target: "o1", changes: { reason: "Faillite", archiveId: "archive-1" } } });
  });
  it("POST …/restore-from-backup", async () => {
    const r = await admin(request(app).post("/api/admin/merchants/o1/restore-from-backup"));
    expect(r.body).toEqual({ id: "o1", status: "ACTIVE" });
    expect(MerchantClosureService.restoreFromBackup).toHaveBeenCalledWith("o1", "admin");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "admin", action: "RESTORE_MERCHANT", target: "o1", changes: {} } });
  });
  it("un échec du service n'écrit pas au journal", async () => {
    (MerchantClosureService.suspend as any).mockRejectedValueOnce(new Error("boom"));
    const r = await admin(request(app).post("/api/admin/merchants/o1/suspend").send({ reason: "x" }));
    expect(r.status).toBe(500);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});
