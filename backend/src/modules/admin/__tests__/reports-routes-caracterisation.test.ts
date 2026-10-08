/**
 * Tests de caractérisation de /api/admin (rapports : commissions, journal des
 * accès, statistiques, journal d'audit). Ils figent statuts, formes de réponse
 * et requêtes Prisma avant l'extraction de la logique vers un service
 * (CLAUDE.md §5). Seule la base et les gardes d'accès sont simulées.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  commissionHistory: model("findMany", "count", "aggregate"),
  securityEvent: model("findMany", "count"),
  user: model("findMany", "count"),
  organization: model("count"),
  store: model("count"),
  order: model("count", "aggregate"),
  customer: model("count"),
  product: model("count"),
  merchantTicket: model("count"),
  systemConfig: model("findFirst"),
  systemAuditLog: model("findMany", "count"),
};
const voitLesFinances = jest.fn(async (..._a: any[]) => true);

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({});
    req.compte = { isSystemAdmin: req.headers.authorization === "Bearer admin" };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" })),
  voitLesFinances: (...a: any[]) => voitLesFinances(...a),
}));

import reportsRouter from "../reports.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/admin", reportsRouter);
app.use(errorHandler);
const admin = (r: request.Test) => r.set("Authorization", "Bearer admin");

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  voitLesFinances.mockResolvedValue(true);
});

describe("accès", () => {
  it.each(["/commissions", "/access-logs", "/stats", "/audit-logs"])("GET %s : 401 sans session, 403 sans droit d'administration", async (chemin) => {
    expect((await request(app).get(`/api/admin${chemin}`)).status).toBe(401);
    expect((await request(app).get(`/api/admin${chemin}`).set("Authorization", "Bearer client")).status).toBe(403);
  });
});

describe("GET /commissions", () => {
  it("historique, total et pagination (période filtrée)", async () => {
    db.commissionHistory.findMany.mockResolvedValue([{ id: "c1", period: "2026-09" }]);
    db.commissionHistory.count.mockResolvedValue(1);
    db.commissionHistory.aggregate.mockResolvedValue({ _sum: { amount: 12.5 } });
    const r = await admin(request(app).get("/api/admin/commissions?period=2026-09&limit=5&offset=10"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      commissions: [{ id: "c1", period: "2026-09" }],
      summary: { totalAmount: 12.5, count: 1 },
      pagination: { total: 1, limit: 5, offset: 10 },
    });
    expect(db.commissionHistory.findMany).toHaveBeenCalledWith({
      where: { period: "2026-09" }, skip: 10, take: 5, include: { org: { select: { id: true, name: true } } }, orderBy: { period: "desc" },
    });
    expect(db.commissionHistory.aggregate).toHaveBeenCalledWith({ _sum: { amount: true }, where: { period: "2026-09" } });
  });
  it("sans période ni montant : totalAmount 0, limite par défaut", async () => {
    db.commissionHistory.findMany.mockResolvedValue([]);
    db.commissionHistory.count.mockResolvedValue(0);
    db.commissionHistory.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const r = await admin(request(app).get("/api/admin/commissions"));
    expect(r.body).toEqual({ commissions: [], summary: { totalAmount: 0, count: 0 }, pagination: { total: 0, limit: 20, offset: 0 } });
    expect((db.commissionHistory.findMany.mock.calls[0][0] as any).where).toEqual({});
  });
});

describe("GET /access-logs", () => {
  it("événements de sécurité avec le nom de l'utilisateur et les valeurs par défaut", async () => {
    db.securityEvent.findMany.mockResolvedValue([
      { id: "e1", actor: "a@test.fr", target: null, action: "LOGIN_SUCCESS", ipAddress: null, userAgent: null, status: "SUCCESS", severity: "LOW", details: "ok", createdAt: new Date("2026-10-01T10:00:00Z"), durationMs: 12 },
      { id: "e2", actor: "inconnu@test.fr", target: "api", action: "LOGIN_FAILED", ipAddress: "1.2.3.4", userAgent: "UA", status: "BLOCKED", severity: "HIGH", details: "x", createdAt: new Date("2026-10-01T11:00:00Z"), durationMs: null },
    ]);
    db.securityEvent.count.mockResolvedValue(2);
    db.user.findMany.mockResolvedValue([{ email: "a@test.fr", name: "Alice" }]);
    const r = await admin(request(app).get("/api/admin/access-logs?status=FAILED"));
    expect(r.status).toBe(200);
    expect(r.body.pagination).toEqual({ total: 2, limit: 100, offset: 0 });
    expect(r.body.logs[0]).toEqual({
      id: "e1", user: { email: "a@test.fr", name: "Alice" }, resource: "plateforme", action: "LOGIN_SUCCESS", ipAddress: "—", userAgent: "—",
      status: "SUCCESS", severity: "LOW", details: "ok", timestamp: "2026-10-01T10:00:00.000Z", duration: 12,
    });
    expect(r.body.logs[1]).toMatchObject({ user: { email: "inconnu@test.fr", name: "—" }, resource: "api", ipAddress: "1.2.3.4", status: "DENIED", duration: null });
    expect(db.securityEvent.findMany).toHaveBeenCalledWith({ where: { status: "FAILED" }, take: 100, skip: 0, orderBy: { createdAt: "desc" } });
    expect(db.user.findMany).toHaveBeenCalledWith({ where: { email: { in: ["a@test.fr", "inconnu@test.fr"] } }, select: { email: true, name: true } });
  });
});

describe("GET /stats", () => {
  beforeEach(() => {
    db.organization.count.mockImplementation(async (a: any) => (a?.where?.status === "ACTIVE" ? 8 : a?.where?.status === "SUSPENDED" ? 2 : 10));
    db.store.count.mockImplementation(async (a: any) => (a?.where?.isOpen ? 5 : 7));
    db.order.count.mockImplementation(async (a: any) => (a.where.status === "PENDING" ? 3 : a.where.status === "COMPLETED" ? 20 : a.where.paymentStatus === "PENDING" ? 4 : a.where.paymentStatus === "SUCCEEDED" ? 30 : 40));
    db.order.aggregate.mockImplementation(async (a: any) => ({ _sum: { totalAmount: a.where.status === "COMPLETED" ? "500.5" : "900" } }));
    db.user.count.mockResolvedValue(50);
    db.customer.count.mockResolvedValue(45);
    db.product.count.mockImplementation(async (a: any) => (a.where.status === "DRAFT" ? 6 : 60));
    db.merchantTicket.count.mockImplementation(async (a: any) => (a.where.priority ? 1 : 2));
    db.systemConfig.findFirst.mockResolvedValue({ platformFeePercent: 7, maintenanceMode: true });
  });
  it("blocs détaillés, finances comprises pour qui les voit", async () => {
    const r = await admin(request(app).get("/api/admin/stats"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      merchants: { total: 10, active: 8, suspended: 2 },
      stores: { total: 7, active: 5 },
      orders: { total: 40, pending: 3, completed: 20 },
      revenue: { total: 900, completed: 500.5 },
      users: { total: 50 },
      customers: { total: 45 },
      payments: { pending: 4, successful: 30 },
      products: { total: 60, draft: 6 },
      tickets: { open: 2, critical: 1 },
      config: { platformFeePercent: 7, maintenanceMode: true },
    });
  });
  it("sans droit « Facturation » : revenue null ; sans configuration : valeurs par défaut", async () => {
    voitLesFinances.mockResolvedValue(false);
    db.systemConfig.findFirst.mockResolvedValue(null);
    const r = await admin(request(app).get("/api/admin/stats"));
    expect(r.body.revenue).toBeNull();
    expect(r.body.config).toEqual({ platformFeePercent: 5, maintenanceMode: false });
  });
});

describe("GET /audit-logs", () => {
  it("journal d'audit paginé avec l'administrateur", async () => {
    db.systemAuditLog.findMany.mockResolvedValue([{ id: "l1", admin: { email: "a@test.fr", name: "A" } }]);
    db.systemAuditLog.count.mockResolvedValue(1);
    const r = await admin(request(app).get("/api/admin/audit-logs?limit=10&offset=5"));
    expect(r.body).toEqual({ logs: [{ id: "l1", admin: { email: "a@test.fr", name: "A" } }], pagination: { total: 1, limit: 10, offset: 5 } });
    expect(db.systemAuditLog.findMany).toHaveBeenCalledWith({
      skip: 5, take: 10, include: { admin: { select: { email: true, name: true } } }, orderBy: { createdAt: "desc" },
    });
  });
});
