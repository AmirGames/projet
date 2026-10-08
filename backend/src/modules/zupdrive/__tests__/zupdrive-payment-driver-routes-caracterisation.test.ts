/**
 * Tests de caractérisation de /api/zupdrive/finance (versements des chauffeurs
 * et administration financière). Ils figent accès, statuts, formes de réponse,
 * requêtes Prisma et entrées du journal avant l'extraction de la logique vers
 * des services (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  chauffeurDrive: model("findUnique"),
  driverPayoutDrive: model("findMany", "count", "aggregate"),
  courseDrive: model("groupBy"),
  platformSettingsDrive: model("findUnique", "upsert"),
  systemAuditLog: model("create"),
  user: model("findUnique"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../middleware/throttle", () => ({ limiterCadence: () => (_q: any, _r: any, next: any) => next() }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers["x-user"];
    if (!who) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = who;
    next();
  },
}));
// Garde simulée : « x-droits » liste ce que le compte a le droit de faire (« owner », « courses-drive »…).
jest.mock("../zupdrive-garde", () => {
  const garde = (exige: string) => (req: any, res: any, next: any) => {
    if (!req.headers["x-user"]) return res.status(401).json({ code: "UNAUTHORIZED" });
    const droits = String(req.headers["x-droits"] ?? "").split(",");
    if (!droits.includes("owner") && !droits.includes(exige)) return res.status(403).json({ code: "FORBIDDEN" });
    req.userId = req.headers["x-user"];
    next();
  };
  return {
    adminAuth: [garde("owner")],
    adminAuthSection: (section: string) => [garde(section)],
  };
});
jest.mock("../zupdrive-payment-driver.service", () => ({
  ZupDrivePaymentDriverService: {
    getDriverEarnings: jest.fn(async () => ({ total: 100 })),
    getFinancialDashboard: jest.fn(async () => ({ solde: 5 })),
    getPayoutHistory: jest.fn(async () => [{ id: "p1" }]),
    preparePayout: jest.fn(async () => ({ id: "p2" })),
    getPayoutStatus: jest.fn(async () => ({ id: "p1", status: "PENDING" })),
    calculateCourseEarnings: jest.fn(async () => ({ net: 8 })),
    processPayout: jest.fn(async () => ({ id: "p1", chauffeurId: "ch1", amount: 1200, batchId: "b1" })),
  },
}));
jest.mock("../zupdrive-payment.service", () => ({ ZupDrivePaymentService: { rembourserCourse: jest.fn() } }));
jest.mock("../commission-drive", () => ({ lireCommissionPourcentage: jest.fn(async () => 20) }));

import router from "../zupdrive-payment-driver.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { ZupDrivePaymentDriverService as Service } from "../zupdrive-payment-driver.service";
import { ZupDrivePaymentService } from "../zupdrive-payment.service";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/finance", router);
app.use(errorHandler);
const chauffeur = { "x-user": "user-alice" };
const owner = { "x-user": "root", "x-droits": "owner" };
const lecture = { "x-user": "equipe", "x-droits": "courses-drive" };

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.chauffeurDrive.findUnique.mockResolvedValue({ id: "ch1" });
  db.user.findUnique.mockResolvedValue({ email: "root@test.fr" });
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("espace chauffeur", () => {
  const routes: [string, string, any][] = [
    ["get", "/earnings", null], ["get", "/financial-dashboard", null], ["get", "/payouts/history", null],
    ["post", "/payouts/request", {}], ["get", "/payouts/p1", null], ["post", "/earnings/calculate", { courseId: "c1" }],
  ];
  it.each(routes)("%s %s : 401 sans jeton, 404 sans profil chauffeur", async (method, path, body) => {
    expect((await (request(app) as any)[method](`/api/zupdrive/finance${path}`).send(body ?? undefined)).status).toBe(401);
    db.chauffeurDrive.findUnique.mockResolvedValue(null);
    const r = await (request(app) as any)[method](`/api/zupdrive/finance${path}`).set(chauffeur).send(body ?? undefined);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: "Driver profile not found" });
    expect(db.chauffeurDrive.findUnique).toHaveBeenLastCalledWith({ where: { userId: "user-alice" }, select: { id: true } });
  });
  it("GET /earnings : période par défaut « week », valeur invalide → 400", async () => {
    let r = await request(app).get("/api/zupdrive/finance/earnings").set(chauffeur);
    expect(r.body).toEqual({ success: true, earnings: { total: 100 } });
    expect(Service.getDriverEarnings).toHaveBeenCalledWith("ch1", "week");
    await request(app).get("/api/zupdrive/finance/earnings?period=month").set(chauffeur);
    expect(Service.getDriverEarnings).toHaveBeenLastCalledWith("ch1", "month");
    r = await request(app).get("/api/zupdrive/finance/earnings?period=annee").set(chauffeur);
    expect(r.status).toBe(400);
  });
  it("GET /financial-dashboard", async () => {
    const r = await request(app).get("/api/zupdrive/finance/financial-dashboard").set(chauffeur);
    expect(r.body).toEqual({ success: true, dashboard: { solde: 5 } });
    expect(Service.getFinancialDashboard).toHaveBeenCalledWith("ch1");
  });
  it("GET /payouts/history : limite bornée à 50", async () => {
    let r = await request(app).get("/api/zupdrive/finance/payouts/history").set(chauffeur);
    expect(r.body).toEqual({ success: true, payouts: [{ id: "p1" }] });
    expect(Service.getPayoutHistory).toHaveBeenCalledWith("ch1", 10);
    await request(app).get("/api/zupdrive/finance/payouts/history?limit=999").set(chauffeur);
    expect(Service.getPayoutHistory).toHaveBeenLastCalledWith("ch1", 50);
    r = await request(app).get("/api/zupdrive/finance/payouts/history?limit=0").set(chauffeur);
    expect(r.status).toBe(400);
  });
  it("POST /payouts/request", async () => {
    const r = await request(app).post("/api/zupdrive/finance/payouts/request").set(chauffeur).send({});
    expect(r.body).toEqual({ success: true, message: "Payout requested successfully", payout: { id: "p2" } });
    expect(Service.preparePayout).toHaveBeenCalledWith("ch1");
  });
  it("GET /payouts/:payoutId : borné au chauffeur du jeton", async () => {
    const r = await request(app).get("/api/zupdrive/finance/payouts/p1").set(chauffeur);
    expect(r.body).toEqual({ success: true, payout: { id: "p1", status: "PENDING" } });
    expect(Service.getPayoutStatus).toHaveBeenCalledWith("p1", "ch1");
  });
  it("POST /earnings/calculate : chauffeur du jeton, jamais celui du corps", async () => {
    const r = await request(app).post("/api/zupdrive/finance/earnings/calculate").set(chauffeur).send({ courseId: "c1", chauffeurId: "ch-bob" });
    expect(r.body).toEqual({ success: true, earnings: { net: 8 } });
    expect(Service.calculateCourseEarnings).toHaveBeenCalledWith({ courseId: "c1", chauffeurId: "ch1" });
    expect((await request(app).post("/api/zupdrive/finance/earnings/calculate").set(chauffeur).send({})).status).toBe(400);
  });
});

describe("administration financière", () => {
  it("accès : lectures pour la section « courses-drive », écritures au superowner seul", async () => {
    const lectures = ["/admin/payouts/pending", "/admin/driver/ch1/payouts", "/admin/financial-dashboard"];
    for (const chemin of lectures) {
      expect((await request(app).get(`/api/zupdrive/finance${chemin}`)).status).toBe(401);
      expect((await request(app).get(`/api/zupdrive/finance${chemin}`).set(chauffeur)).status).toBe(403);
      expect((await request(app).get(`/api/zupdrive/finance${chemin}`).set({ "x-user": "e", "x-droits": "chauffeurs" })).status).toBe(403);
    }
    const ecritures: [string, string, any][] = [
      ["post", "/admin/payouts/p1/process", {}], ["post", "/admin/courses/c1/refund", { motif: "Course annulée" }],
      ["get", "/admin/settings/commission", null], ["post", "/admin/settings/commission", { commissionPercentage: 15 }],
    ];
    for (const [method, chemin, corps] of ecritures) {
      expect((await (request(app) as any)[method](`/api/zupdrive/finance${chemin}`).set(lecture).send(corps ?? undefined)).status).toBe(403);
    }
    expect(Service.processPayout).not.toHaveBeenCalled();
    expect(db.platformSettingsDrive.upsert).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("POST /admin/payouts/:id/process : traite et journalise", async () => {
    const r = await request(app).post("/api/zupdrive/finance/admin/payouts/p1/process").set(owner).send({});
    expect(r.body).toEqual({ success: true, message: "Payout processing initiated", payout: { id: "p1", chauffeurId: "ch1", amount: 1200, batchId: "b1" } });
    expect(Service.processPayout).toHaveBeenCalledWith("p1");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "root", action: "ZUPDRIVE_PROCESS_PAYOUT", target: "p1", changes: { chauffeurId: "ch1", amountCentimes: 1200, batchId: "b1" } },
    });
  });
  it("GET /admin/payouts/pending", async () => {
    db.driverPayoutDrive.findMany.mockResolvedValue([{ id: "p1" }]);
    const r = await request(app).get("/api/zupdrive/finance/admin/payouts/pending?limit=9999").set(lecture);
    expect(r.body).toEqual({ success: true, payouts: [{ id: "p1" }], count: 1 });
    expect(db.driverPayoutDrive.findMany).toHaveBeenCalledWith({
      where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 500,
      select: {
        id: true, chauffeurId: true, amountCentimes: true, status: true, periodStart: true, periodEnd: true,
        chauffeur: { select: { nomComplet: true, user: { select: { email: true } } } },
      },
    });
  });
  it("GET /admin/driver/:chauffeurId/payouts : limite bornée à 100", async () => {
    const r = await request(app).get("/api/zupdrive/finance/admin/driver/ch9/payouts?limit=500").set(lecture);
    expect(r.body).toEqual({ success: true, payouts: [{ id: "p1" }] });
    expect(Service.getPayoutHistory).toHaveBeenCalledWith("ch9", 100);
  });
  it("GET /admin/financial-dashboard", async () => {
    db.driverPayoutDrive.count.mockImplementation(async (a: any) => (a?.where?.status === "PENDING" ? 2 : a?.where?.status === "PROCESSED" ? 3 : 7));
    db.driverPayoutDrive.aggregate.mockResolvedValue({ _sum: { amountCentimes: null } });
    db.courseDrive.groupBy.mockResolvedValue([{ statut: "TERMINEE", _count: 4, _sum: { prixCentimes: 5000 } }]);
    const r = await request(app).get("/api/zupdrive/finance/admin/financial-dashboard").set(lecture);
    expect(r.body).toEqual({
      success: true,
      dashboard: { payouts: { total: 7, pending: 2, completed: 3, totalAmount: 0 }, courses: [{ statut: "TERMINEE", _count: 4, _sum: { prixCentimes: 5000 } }] },
    });
    expect(db.courseDrive.groupBy).toHaveBeenCalledWith({ by: ["statut"], _count: true, _sum: { prixCentimes: true } });
  });
  it("POST /admin/courses/:id/refund : motif requis, 404 sans paiement, sinon journal", async () => {
    const rembourser = ZupDrivePaymentService.rembourserCourse as any;
    expect((await request(app).post("/api/zupdrive/finance/admin/courses/c1/refund").set(owner).send({ motif: "ok" })).status).toBe(400);
    rembourser.mockResolvedValue(null);
    let r = await request(app).post("/api/zupdrive/finance/admin/courses/c1/refund").set(owner).send({ motif: "Course annulée" });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NOTHING_TO_REFUND");
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    rembourser.mockResolvedValue("REFUNDED");
    r = await request(app).post("/api/zupdrive/finance/admin/courses/c1/refund").set(owner).send({ motif: "Course annulée" });
    expect(r.body).toEqual({ success: true, status: "REFUNDED" });
    expect(rembourser).toHaveBeenLastCalledWith("c1", "Course annulée");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "root", action: "ZUPDRIVE_REFUND_COURSE", target: "c1", changes: { motif: "Course annulée", etat: "REFUNDED" } } });
  });
  it("GET /admin/settings/commission", async () => {
    const r = await request(app).get("/api/zupdrive/finance/admin/settings/commission").set(owner);
    expect(r.body).toEqual({ success: true, commissionPercentage: 20 });
  });
  it("POST /admin/settings/commission : entier 0-100, upsert et journal avant/après", async () => {
    for (const mauvais of [{ commissionPercentage: 101 }, { commissionPercentage: 12.5 }, { commissionPercentage: -1 }, {}]) {
      expect((await request(app).post("/api/zupdrive/finance/admin/settings/commission").set(owner).send(mauvais)).status).toBe(400);
    }
    expect(db.platformSettingsDrive.upsert).not.toHaveBeenCalled();
    db.platformSettingsDrive.findUnique.mockResolvedValue({ commissionPercentage: 20 });
    db.platformSettingsDrive.upsert.mockResolvedValue({ id: "default", commissionPercentage: 15 });
    const r = await request(app).post("/api/zupdrive/finance/admin/settings/commission").set(owner).send({ commissionPercentage: 15 });
    expect(r.body).toEqual({ success: true, message: "Commission rate updated", settings: { id: "default", commissionPercentage: 15 } });
    expect(db.platformSettingsDrive.findUnique).toHaveBeenCalledWith({ where: { id: "default" }, select: { commissionPercentage: true } });
    expect(db.platformSettingsDrive.upsert).toHaveBeenCalledWith({
      where: { id: "default" }, create: { id: "default", commissionPercentage: 15 }, update: { commissionPercentage: 15 },
    });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "root", action: "ZUPDRIVE_UPDATE_COMMISSION", target: "default", changes: { avant: 20, apres: 15 } } });
  });
});
