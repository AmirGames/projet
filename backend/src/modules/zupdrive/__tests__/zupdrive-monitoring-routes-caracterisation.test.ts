/**
 * Tests de caractérisation de la supervision ZupDrive (notifications, métriques
 * du chauffeur, tableau de bord et alertes de l'administration). Ils figent
 * accès par section, statuts, formes de réponse et requêtes Prisma avant
 * l'extraction de la logique vers un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  chauffeurDrive: model("findUnique", "findMany", "count"),
  courseDrive: model("count"),
  noteCourseDrive: model("groupBy", "aggregate"),
  complianceReportDrive: model("findMany"),
  documentChauffeurDrive: model("findMany"),
  driverPayoutDrive: model("findMany"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.headers["x-user"]) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.headers["x-user"];
    next();
  },
}));
jest.mock("../zupdrive-garde", () => {
  const garde = (exige: string) => (req: any, res: any, next: any) => {
    if (!req.headers["x-user"]) return res.status(401).json({ code: "UNAUTHORIZED" });
    const droits = String(req.headers["x-droits"] ?? "").split(",");
    if (!droits.includes("owner") && !droits.includes(exige)) return res.status(403).json({ code: "FORBIDDEN" });
    req.userId = req.headers["x-user"];
    next();
  };
  return { adminAuth: [garde("owner")], adminAuthSection: (section: string) => [garde(section)] };
});
jest.mock("../zupdrive-monitoring.service", () => ({
  ZupDriveMonitoringService: {
    getUnreadNotifications: jest.fn(async () => [{ id: "n1" }]),
    getNotificationStats: jest.fn(async () => ({ unread: 1 })),
    markAsRead: jest.fn(async () => undefined),
    markAllAsRead: jest.fn(async () => 4),
    getDriverMetrics: jest.fn(async () => ({ rating: 4.8 })),
    getGainsChauffeur: jest.fn(async (_id: string, depuis: Date) => ({ gainsCentimes: depuis.getHours() === 0 ? 1000 : 7000, nombreCourses: depuis.getHours() === 0 ? 2 : 9 })),
    getAdminDashboard: jest.fn(async () => ({ drivers: 12 })),
  },
}));

import router from "../zupdrive-monitoring.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { ZupDriveMonitoringService as Service } from "../zupdrive-monitoring.service";

const app = express();
app.use(express.json());
app.use("/api/zupdrive", router);
app.use(errorHandler);
const chauffeur = { "x-user": "user-alice" };
const courses = { "x-user": "equipe", "x-droits": "courses-drive" };
const chauffeurs = { "x-user": "equipe", "x-droits": "chauffeurs" };

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.chauffeurDrive.findUnique.mockResolvedValue({ id: "ch1" });
});

describe("espace chauffeur", () => {
  it("GET /notifications : 401 sans jeton, limite par défaut 20, bornée à 100", async () => {
    expect((await request(app).get("/api/zupdrive/notifications")).status).toBe(401);
    const r = await request(app).get("/api/zupdrive/notifications").set(chauffeur);
    expect(r.body).toEqual({ success: true, notifications: [{ id: "n1" }], stats: { unread: 1 } });
    expect(Service.getUnreadNotifications).toHaveBeenCalledWith("user-alice", 20);
    expect(Service.getNotificationStats).toHaveBeenCalledWith("user-alice");
    expect((await request(app).get("/api/zupdrive/notifications?limit=101").set(chauffeur)).status).toBe(400);
  });
  it("POST /notifications/:id/read et /mark-all-read", async () => {
    let r = await request(app).post("/api/zupdrive/notifications/n1/read").set(chauffeur);
    expect(r.body).toEqual({ success: true, message: "Notification marked as read" });
    expect(Service.markAsRead).toHaveBeenCalledWith("n1", "user-alice");
    r = await request(app).post("/api/zupdrive/notifications/mark-all-read").set(chauffeur);
    expect(r.body).toEqual({ success: true, message: "All notifications marked as read", count: 4 });
    expect(Service.markAllAsRead).toHaveBeenCalledWith("user-alice");
  });
  it("GET /metrics et /earnings-realtime : 404 sans profil chauffeur", async () => {
    db.chauffeurDrive.findUnique.mockResolvedValue(null);
    for (const chemin of ["/metrics", "/earnings-realtime"]) {
      const r = await request(app).get(`/api/zupdrive${chemin}`).set(chauffeur);
      expect(r.status).toBe(404);
      expect(r.body).toEqual({ error: "Driver profile not found" });
    }
    expect((await request(app).get("/api/zupdrive/metrics")).status).toBe(401);
    expect(db.chauffeurDrive.findUnique).toHaveBeenCalledWith({ where: { userId: "user-alice" }, select: { id: true } });
  });
  it("GET /metrics", async () => {
    const r = await request(app).get("/api/zupdrive/metrics").set(chauffeur);
    expect(r.body).toEqual({ success: true, metrics: { rating: 4.8 } });
    expect(Service.getDriverMetrics).toHaveBeenCalledWith("ch1");
  });
  it("GET /earnings-realtime : aujourd'hui et sept jours", async () => {
    const r = await request(app).get("/api/zupdrive/earnings-realtime").set(chauffeur);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.earnings.today).toEqual({ amount: 1000, courses: 2 });
    expect(r.body.earnings.week).toEqual({ amount: 7000, courses: 9 });
    expect(typeof r.body.earnings.timestamp).toBe("string");
    expect(Service.getGainsChauffeur).toHaveBeenCalledTimes(2);
  });
});

describe("administration : accès par section", () => {
  it.each([
    ["/admin/dashboard", "courses-drive"], ["/admin/driver/ch1/metrics", "courses-drive"], ["/admin/payout-failure-alerts", "courses-drive"],
    ["/admin/health", "courses-drive"], ["/admin/alerts", "chauffeurs"], ["/admin/compliance-alerts", "chauffeurs"],
    ["/admin/document-expiration-alerts", "chauffeurs"],
  ])("GET %s : 401 sans jeton, 403 pour un chauffeur ou l'autre section, ouvert à « %s »", async (chemin, section) => {
    const autre = section === "courses-drive" ? chauffeurs : courses;
    expect((await request(app).get(`/api/zupdrive${chemin}`)).status).toBe(401);
    expect((await request(app).get(`/api/zupdrive${chemin}`).set(chauffeur)).status).toBe(403);
    expect((await request(app).get(`/api/zupdrive${chemin}`).set(autre)).status).toBe(403);
  });
});

describe("administration : lectures", () => {
  it("GET /admin/dashboard et /admin/driver/:id/metrics", async () => {
    let r = await request(app).get("/api/zupdrive/admin/dashboard").set(courses);
    expect(r.body).toEqual({ success: true, dashboard: { drivers: 12 } });
    r = await request(app).get("/api/zupdrive/admin/driver/ch9/metrics").set(courses);
    expect(r.body).toEqual({ success: true, metrics: { rating: 4.8 } });
    expect(Service.getDriverMetrics).toHaveBeenCalledWith("ch9");
  });
  it("GET /admin/alerts?type=suspension", async () => {
    db.chauffeurDrive.findMany.mockResolvedValue([{ id: "a", nomComplet: "A", statut: "SUSPENDU" }, { id: "b", nomComplet: "B", statut: "SUSPENDU" }]);
    db.noteCourseDrive.groupBy.mockResolvedValue([{ chauffeurId: "b", _avg: { note: 2.5 } }]);
    const r = await request(app).get("/api/zupdrive/admin/alerts?type=suspension").set(chauffeurs);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, alertType: "suspension", count: 2 });
    expect(r.body.drivers.map((d: any) => [d.id, d.rating])).toEqual([["b", 2.5], ["a", null]]);
    expect(db.chauffeurDrive.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { statut: "SUSPENDU" }, take: 50 }));
    expect(db.noteCourseDrive.groupBy).toHaveBeenCalledWith({ by: ["chauffeurId"], where: { auteur: "PASSAGER", chauffeurId: { in: ["a", "b"] } }, _avg: { note: true } });
  });
  it("GET /admin/alerts : types compliance, rating, all et type invalide", async () => {
    db.chauffeurDrive.findMany.mockResolvedValue([]);
    db.noteCourseDrive.groupBy.mockImplementation(async (a: any) => (a.having ? [{ chauffeurId: "faible" }] : []));
    await request(app).get("/api/zupdrive/admin/alerts?type=compliance").set(chauffeurs);
    expect((db.chauffeurDrive.findMany.mock.calls[0][0] as any).where).toEqual({ complianceReports: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } } });
    await request(app).get("/api/zupdrive/admin/alerts?type=rating").set(chauffeurs);
    expect(db.noteCourseDrive.groupBy).toHaveBeenCalledWith({ by: ["chauffeurId"], where: { auteur: "PASSAGER" }, _avg: { note: true }, having: { note: { _avg: { lt: 3.0 } } } });
    expect((db.chauffeurDrive.findMany.mock.calls[1][0] as any).where).toEqual({ id: { in: ["faible"] } });
    const r = await request(app).get("/api/zupdrive/admin/alerts").set(chauffeurs);
    expect(r.body.alertType).toBe("all");
    expect((db.chauffeurDrive.findMany.mock.calls[2][0] as any).where).toEqual({});
    expect((await request(app).get("/api/zupdrive/admin/alerts?type=autre").set(chauffeurs)).status).toBe(400);
  });
  it("GET /admin/compliance-alerts", async () => {
    db.complianceReportDrive.findMany.mockResolvedValue([{ id: "r1" }]);
    const r = await request(app).get("/api/zupdrive/admin/compliance-alerts").set(chauffeurs);
    expect(r.body).toEqual({ success: true, criticalAlerts: [{ id: "r1" }], count: 1 });
    expect(db.complianceReportDrive.findMany).toHaveBeenCalledWith({
      where: { riskLevel: "CRITICAL" }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, chauffeurId: true, complianceScore: true, riskLevel: true, createdAt: true, chauffeur: { select: { nomComplet: true, user: { select: { email: true } } } } },
    });
  });
  it("GET /admin/document-expiration-alerts : pièces validées qui expirent sous 30 jours", async () => {
    db.documentChauffeurDrive.findMany.mockResolvedValue([{ id: "d1" }]);
    const r = await request(app).get("/api/zupdrive/admin/document-expiration-alerts").set(chauffeurs);
    expect(r.body).toEqual({ success: true, expiringDocuments: [{ id: "d1" }], count: 1 });
    const arg = db.documentChauffeurDrive.findMany.mock.calls[0][0] as any;
    expect(arg.where.statut).toBe("APPROVED");
    expect(arg.where.archiveeLe).toBeNull();
    const jours = (arg.where.dateExpiration.lte.getTime() - Date.now()) / 86_400_000;
    expect(jours).toBeGreaterThan(29.9);
    expect(jours).toBeLessThan(30.1);
    expect(arg.where.dateExpiration.gte).toBeInstanceOf(Date);
    expect(arg).toMatchObject({ orderBy: { dateExpiration: "asc" }, take: 50 });
  });
  it("GET /admin/payout-failure-alerts", async () => {
    db.driverPayoutDrive.findMany.mockResolvedValue([{ id: "p1" }]);
    const r = await request(app).get("/api/zupdrive/admin/payout-failure-alerts").set(courses);
    expect(r.body).toEqual({ success: true, failedPayouts: [{ id: "p1" }], count: 1 });
    expect(db.driverPayoutDrive.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20 }));
  });
  it("GET /admin/health", async () => {
    db.chauffeurDrive.count.mockImplementation(async (a: any) => (a.where.statut === "VALIDE" ? 10 : 2));
    db.courseDrive.count.mockResolvedValue(3);
    db.noteCourseDrive.aggregate.mockResolvedValue({ _avg: { note: 4.456 } });
    const r = await request(app).get("/api/zupdrive/admin/health").set(courses);
    expect(r.status).toBe(200);
    expect(r.body.health).toMatchObject({
      drivers: { active: 10, suspended: 2 }, courses: { active: 3 }, quality: { averageRating: 4.46 }, status: "OPERATIONAL",
    });
    expect(db.courseDrive.count).toHaveBeenCalledWith({ where: { statut: { in: ["ACCEPTEE", "ARRIVEE", "EN_COURS"] } } });
    db.noteCourseDrive.aggregate.mockResolvedValue({ _avg: { note: null } });
    expect((await request(app).get("/api/zupdrive/admin/health").set(courses)).body.health.quality.averageRating).toBe(0);
  });
});
