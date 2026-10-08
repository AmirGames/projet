/**
 * Tests de caractérisation de l'administration des livreurs
 * (/api/superowner/drivers, /driver-support, /delivery-incidents). Ils figent
 * accès, formes de réponse, requêtes Prisma et entrées du journal avant
 * l'extraction de la logique vers un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  courier: model("findMany", "count", "groupBy", "findUnique"),
  user: model("findUnique"),
  systemAuditLog: model("create"),
};

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
jest.mock("../driver-approval.service", () => ({
  piecesAttendues: () => ["identity", "license"],
  libelleDuDocument: (t: string) => `Libellé ${t}`,
  DriverApprovalService: {
    dossier: jest.fn(),
    changerEcheance: jest.fn(async () => ({ avant: "2026-01-01", piece: { id: "d1", type: "license", expiryDate: "2027-01-01" } })),
    examinerPiece: jest.fn(async () => ({ id: "d1", type: "license" })),
    valider: jest.fn(async () => ({ id: "dr1", status: "ACTIVE" })),
    ecarter: jest.fn(async (id: string, etat: string) => ({ id, status: etat })),
    reactiver: jest.fn(async () => ({ id: "dr1", status: "ACTIVE" })),
  },
}));
jest.mock("../../payouts/driver-payout.service", () => ({ DriverPayoutService: { soldeFinal: jest.fn(async () => ({ montantDu: 12 })) } }));
jest.mock("../driver-support.service", () => ({
  LONGUEUR_MAX: 2000,
  DriverSupportService: {
    conversations: jest.fn(async () => [{ driverId: "dr1" }]),
    fil: jest.fn(async () => [{ id: "m1" }]),
    marquerLu: jest.fn(async () => undefined),
    envoyer: jest.fn(async () => ({ id: "m2" })),
  },
}));
jest.mock("../surveillance-courses.service", () => ({
  SurveillanceCoursesService: {
    liste: jest.fn(async () => [{ id: "i1" }]),
    retirerCourse: jest.fn(async () => ({ driverId: "dr1", orderId: "o1" })),
    declarerEchec: jest.fn(async () => ({ driverId: "dr1", orderId: "o1", remboursement: "REMBOURSEE", suspendu: true, coursesRetirees: 1 })),
    deciderDepot: jest.fn(async () => ({ driverId: "dr1", orderId: "o1", dejaSurUnReleve: false })),
    clore: jest.fn(async () => ({ avant: { closedAt: null }, apres: { id: "i1", deliveryId: "c1", driverId: "dr1", closedAt: "2026-10-01", resolution: "Traité" } })),
  },
}));
jest.mock("../dossier-incident.service", () => ({
  DossierIncidentService: {
    construire: jest.fn(async () => ({ incident: { id: "i1" }, course: { id: "c1" }, commande: { id: "o1" }, livreurs: [{ id: "dr1" }, { id: "dr2" }] })),
  },
}));

import router from "../drivers.admin.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { DriverApprovalService } from "../driver-approval.service";
import { DriverSupportService } from "../driver-support.service";
import { SurveillanceCoursesService } from "../surveillance-courses.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", router);
app.use(errorHandler);
const owner = (r: request.Test) => r.set("Authorization", "Bearer owner");

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.user.findUnique.mockResolvedValue({ email: "owner@test.fr" });
  db.systemAuditLog.create.mockResolvedValue({});
});

const audit = (action: string, target: string, changes: any) =>
  expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action, target, changes } });

describe("accès", () => {
  it.each([
    ["get", "/drivers"], ["get", "/drivers/dr1"], ["patch", "/drivers/dr1/documents/d1/expiry"], ["patch", "/drivers/dr1/documents/d1"],
    ["post", "/drivers/dr1/approve"], ["post", "/drivers/dr1/reject"], ["post", "/drivers/dr1/reactivate"], ["get", "/driver-support"],
    ["get", "/driver-support/dr1"], ["post", "/driver-support/dr1"], ["get", "/delivery-incidents"],
    ["post", "/delivery-incidents/courses/c1/retirer"], ["post", "/delivery-incidents/courses/c1/echec"],
    ["post", "/delivery-incidents/courses/c1/depot"], ["get", "/delivery-incidents/i1/dossier"], ["post", "/delivery-incidents/i1/clore"],
  ])("%s %s : 401 sans session, 403 sans droit", async (method, path) => {
    expect((await (request(app) as any)[method](`/api/superowner${path}`).send({})).status).toBe(401);
    expect((await (request(app) as any)[method](`/api/superowner${path}`).set("Authorization", "Bearer client").send({})).status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("dossiers des livreurs", () => {
  it("GET /drivers : liste, état des pièces et comptes par statut", async () => {
    db.courier.findMany.mockResolvedValue([{
      id: "dr1", name: "Léo", email: "l@test.fr", phone: "06", vehicleType: "bike", vehiclePlate: null, status: "PENDING", statusReason: null,
      approvedAt: null, isOnline: false, rating: 4.5, totalRatings: 2, totalDeliveries: 3, totalEarnings: "30.5", suppressionDemandeeLe: null,
      createdAt: new Date("2026-10-01T00:00:00Z"), documents: [{ type: "identity", status: "APPROVED" }, { type: "license", status: "PENDING" }], _count: { deliveries: 4 },
    }]);
    db.courier.count.mockResolvedValue(1);
    db.courier.groupBy.mockResolvedValue([{ status: "PENDING", _count: 1 }]);
    const r = await owner(request(app).get("/api/superowner/drivers?status=PENDING&limit=5&offset=1"));
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ PENDING: 1 });
    expect(r.body.pagination).toEqual({ total: 1, limit: 5, offset: 1 });
    expect(r.body.drivers[0]).toMatchObject({
      id: "dr1", rating: 4.5, avis: 2, totalEarnings: 30.5, courses: 4, piecesDeposees: 2, piecesValidees: 1, piecesAttendues: 2, dossierComplet: false,
    });
    expect(db.courier.findMany).toHaveBeenCalledWith({
      where: { status: "PENDING" }, skip: 1, take: 5,
      include: { documents: { select: { type: true, status: true, expiryDate: true } }, _count: { select: { deliveries: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    expect(db.courier.groupBy).toHaveBeenCalledWith({ by: ["status"], _count: true });
    await owner(request(app).get("/api/superowner/drivers?status=ALL"));
    expect((db.courier.findMany.mock.calls[1][0] as any).where).toEqual({});
  });
  it("GET /drivers/:driverId : dossier, avec le solde final si suppression demandée", async () => {
    (DriverApprovalService.dossier as any).mockResolvedValue({
      id: "dr1", name: "Léo", email: "l@test.fr", phone: "06", vehicleType: "bike", vehiclePlate: null, status: "ACTIVE", statusReason: null,
      approvedAt: null, isOnline: true, rating: 4, totalRatings: 0, totalDeliveries: 1, totalEarnings: "5", createdAt: new Date("2026-10-01T00:00:00Z"),
      suppressionDemandeeLe: new Date("2026-10-02T00:00:00Z"), piecesAttendues: ["identity"], piecesManquantes: [], dossierComplet: true,
      documents: [{ id: "d1", type: "identity", documentUrl: "u", expiryDate: null, status: "APPROVED", reviewNote: null, reviewedAt: null, createdAt: new Date("2026-10-01T00:00:00Z") }],
    });
    const r = await owner(request(app).get("/api/superowner/drivers/dr1"));
    expect(r.body.driver).toMatchObject({ id: "dr1", rating: null, avis: 0, totalEarnings: 5 });
    expect(r.body.suppression).toEqual({ demandeeLe: "2026-10-02T00:00:00.000Z", montantDu: 12 });
    expect(r.body.documents[0]).toMatchObject({ id: "d1", libelle: "Libellé identity" });
    expect(r.body.piecesAttendues).toEqual([{ type: "identity", libelle: "Libellé identity" }]);
    expect(r.body.dossierComplet).toBe(true);
  });
});

describe("décisions journalisées", () => {
  it("PATCH …/documents/:id/expiry", async () => {
    expect((await owner(request(app).patch("/api/superowner/drivers/dr1/documents/d1/expiry").send({}))).status).toBe(400);
    const r = await owner(request(app).patch("/api/superowner/drivers/dr1/documents/d1/expiry").send({ expiryDate: "2027-01-01" }));
    expect(r.body).toEqual({ success: true, document: { id: "d1", type: "license", expiryDate: "2027-01-01" } });
    expect(DriverApprovalService.changerEcheance).toHaveBeenCalledWith("dr1", "d1", "2027-01-01");
    audit("UPDATE_DRIVER_DOCUMENT_EXPIRY", "dr1", { type: "license", avant: "2026-01-01", apres: "2027-01-01" });
  });
  it("PATCH …/documents/:id : approuver ou rejeter", async () => {
    expect((await owner(request(app).patch("/api/superowner/drivers/dr1/documents/d1").send({}))).status).toBe(400);
    let r = await owner(request(app).patch("/api/superowner/drivers/dr1/documents/d1").send({ approuve: true }));
    expect(r.body).toEqual({ success: true, document: { id: "d1", type: "license" } });
    expect(DriverApprovalService.examinerPiece).toHaveBeenCalledWith("dr1", "d1", { approuve: true });
    audit("APPROVE_DRIVER_DOCUMENT", "dr1", { type: "license" });
    await owner(request(app).patch("/api/superowner/drivers/dr1/documents/d1").send({ approuve: false, note: "Flou" }));
    audit("REJECT_DRIVER_DOCUMENT", "dr1", { type: "license", note: "Flou" });
  });
  it("POST …/approve, /reject, /reactivate", async () => {
    let r = await owner(request(app).post("/api/superowner/drivers/dr1/approve"));
    expect(r.body).toEqual({ success: true, driver: { id: "dr1", status: "ACTIVE" } });
    expect(DriverApprovalService.valider).toHaveBeenCalledWith("dr1", "owner");
    audit("APPROVE_DRIVER", "dr1", { status: "ACTIVE" });
    expect((await owner(request(app).post("/api/superowner/drivers/dr1/reject").send({ raison: "x" }))).status).toBe(400);
    r = await owner(request(app).post("/api/superowner/drivers/dr1/reject").send({ raison: "Dossier incomplet" }));
    expect(r.body).toEqual({ success: true, driver: { id: "dr1", status: "REJECTED" } });
    expect(DriverApprovalService.ecarter).toHaveBeenCalledWith("dr1", "REJECTED", "Dossier incomplet", "owner");
    audit("SET_ASIDE_DRIVER", "dr1", { status: "REJECTED", raison: "Dossier incomplet" });
    await owner(request(app).post("/api/superowner/drivers/dr1/reject").send({ etat: "SUSPENDED", raison: "Plaintes" }));
    expect(DriverApprovalService.ecarter).toHaveBeenLastCalledWith("dr1", "SUSPENDED", "Plaintes", "owner");
    r = await owner(request(app).post("/api/superowner/drivers/dr1/reactivate"));
    expect(DriverApprovalService.reactiver).toHaveBeenCalledWith("dr1", "owner");
    audit("REACTIVATE_DRIVER", "dr1", { status: "ACTIVE" });
  });
  it("un échec du service n'écrit pas au journal", async () => {
    (DriverApprovalService.valider as any).mockRejectedValueOnce(new Error("boom"));
    expect((await owner(request(app).post("/api/superowner/drivers/dr1/approve"))).status).toBe(500);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("support livreurs", () => {
  it("GET /driver-support et /driver-support/:id", async () => {
    let r = await owner(request(app).get("/api/superowner/driver-support"));
    expect(r.body).toEqual({ success: true, data: [{ driverId: "dr1" }] });
    db.courier.findUnique.mockResolvedValue(null);
    r = await owner(request(app).get("/api/superowner/driver-support/dr1"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("DRIVER_NOT_FOUND");
    expect(DriverSupportService.marquerLu).not.toHaveBeenCalled();
    db.courier.findUnique.mockResolvedValue({ id: "dr1", name: "Léo" });
    r = await owner(request(app).get("/api/superowner/driver-support/dr1"));
    expect(r.body).toEqual({ success: true, data: { driver: { id: "dr1", name: "Léo" }, messages: [{ id: "m1" }] } });
    expect(DriverSupportService.marquerLu).toHaveBeenCalledWith("dr1", "SUPPORT");
    expect(db.courier.findUnique).toHaveBeenCalledWith({
      where: { id: "dr1" },
      select: { id: true, name: true, phone: true, email: true, isOnline: true, currentOrderId: true, latitude: true, longitude: true, lastLocationUpdate: true, gpsLostAt: true },
    });
  });
  it("POST /driver-support/:id : message d'équipe", async () => {
    expect((await owner(request(app).post("/api/superowner/driver-support/dr1").send({ body: "" }))).status).toBe(400);
    const r = await owner(request(app).post("/api/superowner/driver-support/dr1").send({ body: "Bonjour" }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true, data: { id: "m2" } });
    expect(DriverSupportService.envoyer).toHaveBeenCalledWith("dr1", "SUPPORT", "Bonjour", { authorId: "owner" });
  });
});

describe("incidents de livraison", () => {
  it("GET /delivery-incidents : ouverts par défaut", async () => {
    let r = await owner(request(app).get("/api/superowner/delivery-incidents"));
    expect(r.body).toEqual({ success: true, data: [{ id: "i1" }] });
    expect(SurveillanceCoursesService.liste).toHaveBeenCalledWith({ ouverts: true });
    await owner(request(app).get("/api/superowner/delivery-incidents?etat=tous"));
    expect(SurveillanceCoursesService.liste).toHaveBeenLastCalledWith({ ouverts: false });
    expect((await owner(request(app).get("/api/superowner/delivery-incidents?etat=x"))).status).toBe(400);
  });
  it("POST …/retirer : motif requis, journal", async () => {
    expect((await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/retirer").send({ motif: "x" }))).status).toBe(400);
    const r = await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/retirer").send({ motif: "Ne vient pas" }));
    expect(r.body).toEqual({ success: true, data: { driverId: "dr1", orderId: "o1" } });
    expect(SurveillanceCoursesService.retirerCourse).toHaveBeenCalledWith("c1", { par: { userId: "owner" }, motif: "Ne vient pas" });
    audit("WITHDRAW_DELIVERY_FROM_DRIVER", "c1", { driverId: "dr1", orderId: "o1", avant: { status: "ACCEPTED", driverId: "dr1" }, apres: { status: "PENDING", driverId: null }, motif: "Ne vient pas" });
  });
  it("POST …/echec : remboursement et suspension par défaut", async () => {
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/echec").send({ motif: "Jamais livré" }));
    expect(SurveillanceCoursesService.declarerEchec).toHaveBeenCalledWith("c1", { par: { userId: "owner" }, motif: "Jamais livré", rembourser: true, suspendre: true });
    audit("FAIL_DELIVERY", "c1", {
      driverId: "dr1", orderId: "o1", avant: { status: "PICKED_UP" }, apres: { status: "FAILED" }, motif: "Jamais livré",
      remboursement: "REMBOURSEE", livreurSuspendu: true, coursesRetirees: 1,
    });
  });
  it("POST …/depot : VALIDER ou REFUSER", async () => {
    expect((await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/depot").send({ motif: "Photo ok" }))).status).toBe(400);
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/depot").send({ decision: "VALIDER", motif: "Photo ok" }));
    expect(SurveillanceCoursesService.deciderDepot).toHaveBeenCalledWith("c1", { par: { userId: "owner" }, decision: "VALIDER", motif: "Photo ok", rembourser: true, suspendre: true });
    audit("VALIDATE_DELIVERY_DEPOSIT", "c1", { driverId: "dr1", orderId: "o1", avant: { payoutHold: "REVIEW" }, apres: { payoutHold: null }, motif: "Photo ok", dejaSurUnReleve: false });
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/depot").send({ decision: "REFUSER", motif: "Faux" }));
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: "REFUSE_DELIVERY_DEPOSIT", changes: expect.objectContaining({ apres: { payoutHold: "REFUSED" } }) }) });
  });
  it("GET …/:id/dossier : export journalisé, jamais mis en cache", async () => {
    const r = await owner(request(app).get("/api/superowner/delivery-incidents/i1/dossier"));
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body.success).toBe(true);
    audit("EXPORT_INCIDENT_FILE", "i1", { deliveryId: "c1", orderId: "o1", livreurs: ["dr1", "dr2"] });
  });
  it("POST …/:id/clore", async () => {
    expect((await owner(request(app).post("/api/superowner/delivery-incidents/i1/clore").send({ resolution: "x" }))).status).toBe(400);
    const r = await owner(request(app).post("/api/superowner/delivery-incidents/i1/clore").send({ resolution: "Traité" }));
    expect(r.body.success).toBe(true);
    expect(SurveillanceCoursesService.clore).toHaveBeenCalledWith("i1", { userId: "owner" }, "Traité");
    audit("CLOSE_DELIVERY_INCIDENT", "i1", { deliveryId: "c1", driverId: "dr1", avant: { closedAt: null }, apres: { closedAt: "2026-10-01", resolution: "Traité" } });
  });
});
