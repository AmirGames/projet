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
  courierVehicleChangeRequest: model("findMany"),
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
    examinerBce: jest.fn(async (id: string, _admin: string, decision: any) => ({ id, bceStatus: decision.status, bceReviewedAt: new Date("2026-10-22T12:00:00Z") })),
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
jest.mock("../driver-account.service", () => ({
  DriverAccountService: {
    modifierNumeroBce: jest.fn(async (_driver: any, bceNumber: string) => ({
      bceNumber: bceNumber.replace(/\D/g, ""),
      bceStatus: "PENDING",
    })),
  },
}));
jest.mock("../driver-vehicle-change.service", () => ({ DriverVehicleChangeService: {
  historiqueAdmin: jest.fn(async () => []),
  examiner: jest.fn(async (_driverId: string, _requestId: string, _adminId: string, decision: any) => ({ status: decision.status, vehicleType: "scooter" })),
} }));
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
import incidentsRouter from "../drivers.incidents.admin.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { DriverApprovalService } from "../driver-approval.service";
import { DriverSupportService } from "../driver-support.service";
import { DriverAccountService } from "../driver-account.service";
import { SurveillanceCoursesService } from "../surveillance-courses.service";
import { DriverVehicleChangeService } from "../driver-vehicle-change.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", router);
app.use("/api/superowner", incidentsRouter);
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
    ["get", "/drivers"], ["get", "/drivers/dr1"], ["patch", "/drivers/dr1/bce"], ["patch", "/drivers/dr1/documents/d1/expiry"], ["patch", "/drivers/dr1/documents/d1"],
    ["post", "/drivers/dr1/approve"], ["post", "/drivers/dr1/reject"], ["post", "/drivers/dr1/reactivate"], ["get", "/driver-support"],
    ["get", "/driver-support/dr1"], ["patch", "/driver-support/dr1/bce"], ["post", "/driver-support/dr1"], ["get", "/delivery-incidents"],
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
      createdAt: new Date("2026-10-01T00:00:00Z"), documents: [{ type: "identity", status: "APPROVED" }, { type: "license", status: "PENDING" }], vehicleChangeRequests: [], _count: { deliveries: 4 },
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
      include: { documents: { select: { type: true, status: true, expiryDate: true } }, vehicleChangeRequests: { where: { status: "PENDING" }, select: { id: true } }, _count: { select: { deliveries: true } } },
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
  it("filtre les livreurs ayant une demande de véhicule en attente", async () => {
    db.courier.findMany.mockResolvedValue([]);
    db.courier.count.mockResolvedValue(0);
    db.courier.groupBy.mockResolvedValue([]);
    const r = await owner(request(app).get("/api/superowner/drivers?status=VEHICLE_CHANGE_PENDING"));
    expect(r.status).toBe(200);
    expect(db.courier.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { vehicleChangeRequests: { some: { status: "PENDING" } } },
    }));
  });
});

describe("décisions journalisées", () => {
  it("PATCH …/bce : demande une décision et journalise l'examen humain", async () => {
    expect((await owner(request(app).patch("/api/superowner/drivers/dr1/bce").send({}))).status).toBe(400);
    const r = await owner(request(app).patch("/api/superowner/drivers/dr1/bce").send({ status: "VERIFIED" }));
    expect(r.body).toMatchObject({ success: true, bceStatus: "VERIFIED" });
    expect(DriverApprovalService.examinerBce).toHaveBeenCalledWith("dr1", "owner", { status: "VERIFIED" });
    audit("VERIFY_DRIVER_BCE", "dr1", { status: "VERIFIED", reason: undefined });
  });

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
  it("PATCH …/vehicle-change-requests/:id : décision support journalisée", async () => {
    const route = "/api/superowner/drivers/dr1/vehicle-change-requests/change1";
    expect((await owner(request(app).patch(route).send({ status: "APPROVED" }))).body).toMatchObject({ success: true, data: { status: "APPROVED", vehicleType: "scooter" } });
    expect(DriverVehicleChangeService.examiner).toHaveBeenCalledWith("dr1", "change1", "owner", { status: "APPROVED" });
    audit("APPROVE_DRIVER_VEHICLE_CHANGE", "dr1", { requestId: "change1", status: "APPROVED", reason: undefined, vehicleType: "scooter" });
    expect((await owner(request(app).patch(route).send({ status: "REJECTED", reason: "Pièce illisible" }))).status).toBe(200);
    audit("REJECT_DRIVER_VEHICLE_CHANGE", "dr1", { requestId: "change1", status: "REJECTED", reason: "Pièce illisible", vehicleType: "scooter" });
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
      select: {
        id: true, name: true, phone: true, email: true, isOnline: true, currentOrderId: true,
        lastLocationUpdate: true, gpsLostAt: true, bceNumber: true, bceStatus: true, bceReviewReason: true,
      },
    });
  });
  it("PATCH /driver-support/:id/bce : enregistre le numéro et relance sa vérification", async () => {
    expect((await owner(request(app).patch("/api/superowner/driver-support/dr1/bce").send({ bceNumber: "invalide" }))).status).toBe(400);
    db.courier.findUnique.mockResolvedValue({ id: "dr1", currentOrderId: null });
    const r = await owner(request(app).patch("/api/superowner/driver-support/dr1/bce").send({ bceNumber: "0123.456.749" }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { bceNumber: "0123456749", bceStatus: "PENDING" } });
    expect(DriverAccountService.modifierNumeroBce).toHaveBeenCalledWith({ id: "dr1", currentOrderId: null }, "0123.456.749");
    audit("UPDATE_DRIVER_BCE_FROM_SUPPORT", "dr1", { bceStatus: "PENDING" });
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
  it("POST …/echec : rembourse par défaut, sans suspendre automatiquement", async () => {
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/echec").send({ motif: "Jamais livré" }));
    expect(SurveillanceCoursesService.declarerEchec).toHaveBeenCalledWith("c1", { par: { userId: "owner" }, motif: "Jamais livré", rembourser: true, suspendre: false });
    audit("FAIL_DELIVERY", "c1", {
      driverId: "dr1", orderId: "o1", avant: { status: "PICKED_UP" }, apres: { status: "FAILED" }, motif: "Jamais livré",
      remboursement: "REMBOURSEE", livreurSuspendu: true, coursesRetirees: 1,
    });
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/echec").send({ motif: "Risque immédiat", suspendre: true }));
    expect(SurveillanceCoursesService.declarerEchec).toHaveBeenLastCalledWith("c1", { par: { userId: "owner" }, motif: "Risque immédiat", rembourser: true, suspendre: true });
  });
  it("POST …/depot : VALIDER ou REFUSER", async () => {
    expect((await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/depot").send({ motif: "Photo ok" }))).status).toBe(400);
    await owner(request(app).post("/api/superowner/delivery-incidents/courses/c1/depot").send({ decision: "VALIDER", motif: "Photo ok" }));
    expect(SurveillanceCoursesService.deciderDepot).toHaveBeenCalledWith("c1", { par: { userId: "owner" }, decision: "VALIDER", motif: "Photo ok", rembourser: true, suspendre: false });
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
