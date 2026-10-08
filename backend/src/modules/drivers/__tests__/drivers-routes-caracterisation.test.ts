/**
 * Tests de caractérisation de /api/drivers (espace livreur).
 *
 * Ils figent le contrat actuel — statut HTTP, forme de la réponse, code
 * d'erreur — pour que l'extraction de la logique Prisma vers des services
 * (CLAUDE.md §5, « route mince ») reste sans effet pour le frontend, les
 * applications mobiles et les scripts. Ils ne dépendent ni du fichier de
 * routes ni du service qui porte la logique : seuls la base (`db`) et les
 * services externes au découpage sont simulés.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  user: model("findUnique", "create"),
  courier: model("findUnique", "findMany", "create", "update"),
  courierTip: model("findMany"),
  courierRating: model("findMany"),
  orderDelivery: model("findUnique", "findUniqueOrThrow", "findMany", "count", "update", "updateMany"),
  deliveryOffer: model("findFirst", "findMany"),
  order: model("findUnique", "update"),
  notification: model("create"),
  membership: model("count", "findFirst"),
  pushDevice: model("deleteMany"),
  store: model("findUnique"),
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ NODE_ENV: "test", JWT_SECRET: "a".repeat(40), API_URL: "https://api.test", FRONTEND_URL: "https://test", LOG_LEVEL: "error" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitNotification: jest.fn(), emitOrderUpdate: jest.fn(), emitDriverEvent: jest.fn(), emitSupportEvent: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: {} }));
jest.mock("../../notifications/email.config", () => ({ emailTransporter: { sendMail: jest.fn() } }));
jest.mock("../../legal/acceptation-conditions.service", () => ({ champAcceptation: {}, enregistrerAcceptation: jest.fn() }));
jest.mock("../../../middleware/throttle", () => ({ limiterInscriptions: (_q: any, _r: any, next: any) => next() }));
jest.mock("../../auth/auth.middleware", () => ({ authMiddleware: (req: any, res: any, next: any) => {
  const id = req.headers.authorization?.replace("Bearer ", "");
  if (!["alice", "bob", "admin"].includes(id)) return res.status(401).json({});
  req.userId = id;
  req.user = { userId: id };
  req.compte = id === "admin" ? { isSuperOwner: true } : {};
  next();
} }));

import driversRouter from "../drivers.routes";
import driversDossierRouter from "../drivers.dossier.routes";
import driversCoursesRouter from "../drivers.courses.routes";
import driversOffresRouter from "../drivers.offres.routes";
import { DispatchService } from "../dispatch.service";
import { DriverPayoutService } from "../../payouts/driver-payout.service";
import { DriverApprovalService } from "../driver-approval.service";
import { DriverActivityService } from "../driver-activity.service";
import { DriverAvailabilityService } from "../driver-availability.service";
import { DriverSupportService } from "../driver-support.service";
import { DeliveryProofService } from "../delivery-proof.service";
import { SurveillanceCoursesService } from "../surveillance-courses.service";
import { Notifier } from "../../notifications/notifier.service";
import { FileUploadService } from "../../files/file-upload.service";
import { SsoService } from "../../auth/sso.service";
import { AuthService } from "../../auth/auth.service";
import { emitDeliveryUpdate, emitNotification } from "../../realtime/socket";

const app = express();
app.use(express.json());
app.use("/api/drivers", driversRouter);
app.use("/api/drivers", driversDossierRouter);
app.use("/api/drivers", driversCoursesRouter);
app.use("/api/drivers", driversOffresRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ code: error.code }));
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const PDF = Buffer.from("%PDF-1.4\n");
const alice = (r: request.Test) => r.set("Authorization", "Bearer alice");

const livreur = {
  id: "driver-alice", userId: "alice", email: "alice@test.fr", name: "Alice", status: "ACTIVE", statusReason: null,
  isOnline: false, isAvailable: false, currentOrderId: null, pausedUntil: null, pauseReason: null,
  latitude: 45.7, longitude: 4.8, lastLocationUpdate: new Date(), gpsLostAt: null,
  rating: 4.5, totalRatings: 2, totalEarnings: 12, totalDeliveries: 3, iban: null, accountHolder: null,
  vehicleType: "bike", licensePlate: null, approvedAt: null, suppressionDemandeeLe: null,
};
const course = (extra: any = {}) => ({
  id: "course-1", orderId: "commande-1", status: "ACCEPTED", driverId: "driver-alice", assignedAt: new Date("2026-10-04T10:00:00Z"),
  customerWaitStartedAt: null, driverPayout: 5, ...extra,
});
const order = { id: "commande-1", status: "READY", items: [], store: { name: "Chez Test", address: "1 rue A", city: "Lyon", latitude: 45.7, longitude: 4.8 }, tipAmount: 0, feesAmount: 3, customerName: "Client", customerPhone: "0600", deliveryAddress: "2 rue B", deliveryPostal: "69000", deliveryCity: "Lyon" };

beforeEach(() => {
  db.courier.findUnique.mockImplementation(async ({ where }: any) =>
    where.userId === "alice" || where.id === "driver-alice" ? { ...livreur, user: { id: "alice", email: "alice@test.fr", name: "Alice" } } : null);
  db.orderDelivery.findUnique.mockResolvedValue({ ...course(), order, offers: [] });
  db.deliveryOffer.findFirst.mockResolvedValue(null);
  jest.spyOn(DispatchService, "reglages").mockResolvedValue({ tournee: { maxCourses: 3 }, maxRadiusKm: 10 } as any);
  jest.spyOn(DispatchService, "etatTournee").mockResolvedValue({ retraitsRestants: 0, remiseCourante: "course-1" } as any);
  jest.spyOn(DispatchService, "masquage").mockReturnValue(null as any);
  jest.spyOn(DispatchService, "exigerTourAtteint").mockResolvedValue(undefined as any);
  jest.spyOn(DispatchService, "liberer").mockResolvedValue(undefined as any);
  jest.spyOn(DispatchService, "enregistrerPosition").mockResolvedValue({ suivie: true, enLigne: true });
  jest.spyOn(DispatchService, "accepter").mockResolvedValue({ id: "course-1", lot: [{}] } as any);
  jest.spyOn(DispatchService, "refuser").mockResolvedValue(null as any);
  jest.spyOn(DriverPayoutService, "situation").mockResolvedValue({ du: 0 } as any);
  jest.spyOn(DriverPayoutService, "soldeFinal").mockResolvedValue({ montantDu: 0, ibanValide: false, versementLe: null, ibanFin: null } as any);
  jest.spyOn(DriverSupportService, "envoyer").mockResolvedValue({ id: "m1" } as any);
  jest.spyOn(DriverSupportService, "fil").mockResolvedValue([{ id: "m1" }] as any);
  jest.spyOn(DriverSupportService, "marquerLu").mockResolvedValue(undefined as any);
  jest.spyOn(DriverSupportService, "nonLusPourLivreur").mockResolvedValue(2 as any);
  jest.spyOn(DriverAvailabilityService, "mettreEnPause").mockResolvedValue({ isAvailable: false, isOnline: true, pausedUntil: new Date("2026-10-04T12:00:00Z"), pauseReason: "café" } as any);
  jest.spyOn(DriverAvailabilityService, "reprendre").mockResolvedValue({ isAvailable: true, isOnline: true } as any);
  jest.spyOn(DriverActivityService, "historique").mockResolvedValue({ data: [], total: 0 } as any);
  jest.spyOn(DriverActivityService, "analytics").mockResolvedValue({ jours: 7 } as any);
  jest.spyOn(DriverApprovalService, "dossier").mockResolvedValue({ status: "PENDING", statusReason: null, dossierComplet: false, piecesAttendues: ["license"], piecesManquantes: ["license"], documents: [] } as any);
  jest.spyOn(DriverApprovalService, "deposerPiece").mockResolvedValue({ id: "p1", type: "license" } as any);
  jest.spyOn(DriverApprovalService, "deposerFichier").mockResolvedValue({ id: "p2", type: "license" } as any);
  jest.spyOn(DeliveryProofService, "verifier").mockResolvedValue("CODE" as any);
  jest.spyOn(SurveillanceCoursesService, "apresDepotPhoto").mockResolvedValue(undefined as any);
  jest.spyOn(Notifier, "pushLivreur").mockResolvedValue(true as any);
  jest.spyOn(Notifier, "etapeLivraisonClient").mockResolvedValue(undefined as any);
  jest.spyOn(Notifier, "attenteClient").mockResolvedValue(undefined as any);
  jest.spyOn(FileUploadService, "uploadDocument").mockResolvedValue({ url: "https://files.test/deliveries/depot.jpg" } as any);
  jest.spyOn(SsoService, "connecter").mockResolvedValue({ accessToken: "at", refreshToken: "rt" } as any);
  jest.spyOn(AuthService, "hashPassword").mockResolvedValue("hash" as any);
});

describe("/api/drivers — authentification", () => {
  const protegees: [string, string][] = [
    ["get", "/earnings"], ["patch", "/availability"], ["post", "/pause"], ["delete", "/pause"], ["get", "/push/config"],
    ["post", "/push/subscribe"], ["delete", "/push/subscribe"], ["post", "/push/test"], ["get", "/support/messages"],
    ["post", "/support/messages"], ["post", "/support/read"], ["get", "/support/unread"], ["get", "/me/suppression"],
    ["post", "/me/suppression"], ["put", "/me/bank-account"], ["get", "/me"], ["get", "/documents"], ["post", "/documents"],
    ["post", "/documents/upload"], ["get", "/payouts"], ["get", "/payouts/x"], ["get", "/deliveries"], ["get", "/history"],
    ["get", "/analytics"], ["get", "/deliveries/x"], ["patch", "/deliveries/x/accept"], ["patch", "/deliveries/x"],
    ["post", "/deliveries/x/photo"], ["post", "/deliveries/x/attente"], ["get", "/ratings"], ["patch", "/deliveries/x/location"],
    ["patch", "/location"], ["get", "/offers"], ["get", "/tournee"], ["post", "/offers/x/accept"], ["post", "/offers/x/decline"],
    ["patch", "/deliveries/x/cancel"], ["get", "/available"],
  ];
  it.each(protegees)("%s %s sans jeton → 401", async (method, path) => {
    const r = await (request(app) as any)[method](`/api/drivers${path}`).send({});
    expect(r.status).toBe(401);
  });
  it("sans profil livreur → 404 DRIVER_NOT_FOUND", async () => {
    const r = await request(app).get("/api/drivers/earnings").set("Authorization", "Bearer bob");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("DRIVER_NOT_FOUND");
  });
  it("GET /me sans profil → 404 DRIVER_NOT_FOUND", async () => {
    const r = await request(app).get("/api/drivers/me").set("Authorization", "Bearer bob");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("DRIVER_NOT_FOUND");
  });
});

describe("POST /register", () => {
  const corps = { name: "Alice", email: "a@test.fr", password: "Motdepasse!123", phone: "0612345678", vehicleType: "bike", acceptation: true };
  it("e-mail déjà pris → 409 EMAIL_EXISTS", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u" });
    db.courier.findUnique.mockResolvedValue(null);
    const r = await request(app).post("/api/drivers/register").send(corps);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EMAIL_EXISTS");
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("corps invalide → refus sans création", async () => {
    const r = await request(app).post("/api/drivers/register").send({ name: "A" });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("inscription → 201 avec jetons et livreur", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.courier.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u1", email: "a@test.fr" });
    db.courier.create.mockResolvedValue({ id: "d1", name: "Alice", email: "a@test.fr" });
    const r = await request(app).post("/api/drivers/register").send(corps);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ message: "Inscription réussie", accessToken: "at", refreshToken: "rt", driver: { id: "d1", name: "Alice", email: "a@test.fr" } });
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: "a@test.fr", name: "Alice", passwordHash: "hash" } });
    expect(db.courier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "u1", vehicleType: "bike", phone: "0612345678" }) });
  });
});

describe("profil, revenus, disponibilité", () => {
  it("GET /me", async () => {
    const r = await alice(request(app).get("/api/drivers/me"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data).sort()).toEqual([
      "approvedAt", "avis", "completedDeliveries", "compte", "email", "gpsLostAt", "id", "isAvailable", "isOnline", "lastLocationUpdate",
      "latitude", "licensePlate", "longitude", "maxCourses", "name", "pauseReason", "pausedUntil", "piecesAttendues", "rating",
      "status", "statusReason", "totalEarnings", "vehicleType",
    ]);
    expect(r.body.data).toMatchObject({ id: "driver-alice", rating: 4.5, avis: 2, maxCourses: 3, compte: null });
  });
  it("GET /earnings", async () => {
    db.orderDelivery.findMany.mockResolvedValue([{ id: "course-1", orderId: "commande-1", driverPayout: 5, deliveryTime: new Date(), updatedAt: new Date(), order: { feesAmount: 3, tipAmount: 1 } }]);
    db.courierTip.findMany.mockResolvedValue([{ orderId: "commande-1", amount: 2, paidAt: new Date() }]);
    const r = await alice(request(app).get("/api/drivers/earnings"));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 7, today: 7, week: 7, month: 7, deliveryCount: 1, rating: 4.5, avis: 2 });
    expect(r.body.pourboires).toEqual({ today: 3, week: 3, month: 3, total: 3 });
    expect(r.body.deliveries[0]).toMatchObject({ id: "course-1", orderId: "commande-1", earning: 5, pourboire: 1, pourboireApres: 2 });
  });
  it("PATCH /availability : booléen requis", async () => {
    const r = await alice(request(app).patch("/api/drivers/availability").send({ isOnline: "oui" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_INPUT");
  });
  it("PATCH /availability : dossier non validé ne passe pas en ligne", async () => {
    db.courier.findUnique.mockResolvedValue({ ...livreur, status: "PENDING" });
    const r = await alice(request(app).patch("/api/drivers/availability").send({ isOnline: true }));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("DRIVER_NOT_APPROVED");
    expect(db.courier.update).not.toHaveBeenCalled();
  });
  it("PATCH /availability : se mettre en ligne", async () => {
    db.courier.update.mockResolvedValue({ isAvailable: true, isOnline: true, pausedUntil: null });
    const r = await alice(request(app).patch("/api/drivers/availability").send({ isOnline: true }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ isAvailable: true, isOnline: true, pausedUntil: null });
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { isOnline: true, isAvailable: true } });
  });
  it("PATCH /availability : se déconnecter met fin à la pause", async () => {
    db.courier.update.mockResolvedValue({ isAvailable: false, isOnline: false, pausedUntil: null });
    await alice(request(app).patch("/api/drivers/availability").send({ isAvailable: false }));
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { isOnline: false, isAvailable: false, pausedUntil: null, pauseReason: null } });
  });
  it("POST /pause", async () => {
    const r = await alice(request(app).post("/api/drivers/pause").send({ minutes: 15, reason: "café" }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, isAvailable: false, isOnline: true, pauseReason: "café" });
    expect(DriverAvailabilityService.mettreEnPause).toHaveBeenCalledWith("driver-alice", 15, "café");
  });
  it("POST /pause : corps invalide → 4xx", async () => {
    const r = await alice(request(app).post("/api/drivers/pause").send({ minutes: "x" }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(DriverAvailabilityService.mettreEnPause).not.toHaveBeenCalled();
  });
  it("DELETE /pause", async () => {
    const r = await alice(request(app).delete("/api/drivers/pause"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, isAvailable: true, isOnline: true, pausedUntil: null });
  });
  it("PUT /me/bank-account : IBAN invalide → 400", async () => {
    const r = await alice(request(app).put("/api/drivers/me/bank-account").send({ iban: "FR00 0000 0000 0000", accountHolder: "Alice" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_IBAN");
    expect(db.courier.update).not.toHaveBeenCalled();
  });
  it("PUT /me/bank-account : IBAN valide enregistré normalisé", async () => {
    const r = await alice(request(app).put("/api/drivers/me/bank-account").send({ iban: "FR14 2004 1010 0505 0001 3M02 606", bic: " abcdfrpp ", accountHolder: " Alice " }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, message: "Compte enregistré" });
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { iban: "FR1420041010050500013M02606", bic: "ABCDFRPP", accountHolder: "Alice" } });
  });
});

describe("notifications push et support", () => {
  it("GET /push/config", async () => {
    const r = await alice(request(app).get("/api/drivers/push/config"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data).sort()).toEqual(["enabled", "publicKey"].sort());
  });
  it("POST /push/subscribe : abonnement invalide → 4xx, valide → écrit", async () => {
    expect((await alice(request(app).post("/api/drivers/push/subscribe").send({ endpoint: "pas-une-url" }))).status).toBeGreaterThanOrEqual(400);
    expect(db.courier.update).not.toHaveBeenCalled();
    const abonnement = { endpoint: "https://push.test/x", keys: { p256dh: "a", auth: "b" } };
    const r = await alice(request(app).post("/api/drivers/push/subscribe").send(abonnement));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { pushSubscription: abonnement } });
  });
  it("DELETE /push/subscribe", async () => {
    const r = await alice(request(app).delete("/api/drivers/push/subscribe"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { pushSubscription: expect.anything() } });
  });
  it("POST /push/test", async () => {
    const r = await alice(request(app).post("/api/drivers/push/test"));
    expect(r.body).toEqual({ success: true, envoye: true });
    expect(Notifier.pushLivreur).toHaveBeenCalledWith("driver-alice", expect.objectContaining({ url: "/driver" }));
  });
  it("support : fil, envoi, lecture, non-lus", async () => {
    let r = await alice(request(app).get("/api/drivers/support/messages"));
    expect(r.body).toEqual({ success: true, data: [{ id: "m1" }] });
    expect(DriverSupportService.marquerLu).toHaveBeenCalledWith("driver-alice", "DRIVER");
    r = await alice(request(app).post("/api/drivers/support/messages").send({ body: "Bonjour" }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true, data: { id: "m1" } });
    expect(DriverSupportService.envoyer).toHaveBeenCalledWith("driver-alice", "DRIVER", "Bonjour");
    expect((await alice(request(app).post("/api/drivers/support/messages").send({ body: "" }))).status).toBeGreaterThanOrEqual(400);
    r = await alice(request(app).post("/api/drivers/support/read"));
    expect(r.body).toEqual({ success: true });
    r = await alice(request(app).get("/api/drivers/support/unread"));
    expect(r.body).toEqual({ success: true, data: { unread: 2 } });
  });
});

describe("suppression du compte", () => {
  beforeEach(() => {
    db.orderDelivery.count.mockResolvedValue(0);
    db.membership.count.mockResolvedValue(0);
  });
  it("GET /me/suppression", async () => {
    const r = await alice(request(app).get("/api/drivers/me/suppression"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { coursesEnCours: 0, montantDu: 0, ibanValide: false, versementLe: null, ibanFin: null, restent: { client: true, commercant: false }, demandeeLe: null },
    });
  });
  it("courses en cours → 409 DELIVERIES_IN_PROGRESS", async () => {
    db.orderDelivery.count.mockResolvedValue(1);
    const r = await alice(request(app).post("/api/drivers/me/suppression").send({}));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("DELIVERIES_IN_PROGRESS");
    expect(db.courier.update).not.toHaveBeenCalled();
  });
  it("montant dû sans IBAN → 409 IBAN_REQUIRED", async () => {
    (DriverPayoutService.soldeFinal as any).mockResolvedValue({ montantDu: 10, ibanValide: false, versementLe: null, ibanFin: null });
    const r = await alice(request(app).post("/api/drivers/me/suppression").send({}));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("IBAN_REQUIRED");
    expect(db.courier.update).not.toHaveBeenCalled();
  });
  it("demande acceptée : compte désactivé, appareils push retirés, support prévenu", async () => {
    const r = await alice(request(app).post("/api/drivers/me/suppression").send({ motif: "Je pars" }));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data).toMatchObject({ coursesEnCours: 0, restent: { client: true, commercant: false } });
    expect(r.body.message).toContain("Votre compte livreur est supprimé");
    expect(db.courier.update).toHaveBeenCalledWith({
      where: { id: "driver-alice" },
      data: expect.objectContaining({ status: "INACTIVE", isOnline: false, isAvailable: false, pausedUntil: null, pauseReason: null }),
    });
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "alice", app: "delivery" } });
    expect(DriverSupportService.envoyer).toHaveBeenCalledWith("driver-alice", "DRIVER", expect.stringContaining("Motif : Je pars"), { deliveryId: null });
  });
});

describe("dossier, relevés, historique", () => {
  it("GET /documents", async () => {
    const r = await alice(request(app).get("/api/drivers/documents"));
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data).sort()).toEqual(["documents", "dossierComplet", "piecesAttendues", "piecesManquantes", "status", "statusReason"]);
    expect(r.body.data.piecesAttendues[0]).toHaveProperty("libelle");
  });
  it("POST /documents", async () => {
    const r = await alice(request(app).post("/api/drivers/documents").send({ type: "license", documentUrl: "https://x.test/p.pdf" }));
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: "p1", type: "license" });
    expect(r.body.message).toContain("déposée, en attente de validation");
    expect((await alice(request(app).post("/api/drivers/documents").send({ type: "license", documentUrl: "pas-une-url" }))).status).toBeGreaterThanOrEqual(400);
  });
  it("POST /documents/upload : sans fichier → 400 NO_FILE, avec fichier → 201", async () => {
    let r = await alice(request(app).post("/api/drivers/documents/upload").field("type", "license"));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("NO_FILE");
    r = await alice(request(app).post("/api/drivers/documents/upload").field("type", "license").attach("file", PDF, { filename: "p.pdf", contentType: "application/pdf" }));
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ id: "p2", type: "license" });
    expect(DriverApprovalService.deposerFichier).toHaveBeenCalledWith("driver-alice", expect.objectContaining({ type: "license", filename: "p.pdf", mimeType: "application/pdf" }));
  });
  it("GET /payouts", async () => {
    const r = await alice(request(app).get("/api/drivers/payouts"));
    expect(r.body).toEqual({ success: true, data: { du: 0 } });
  });
  it("GET /payouts/:id : relevé d'un autre livreur → 404 PAYOUT_NOT_FOUND", async () => {
    jest.spyOn(DriverPayoutService, "detail").mockResolvedValue({ driverId: "driver-bob" } as any);
    const r = await alice(request(app).get("/api/drivers/payouts/r1"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("PAYOUT_NOT_FOUND");
  });
  it("GET /payouts/:id : son relevé", async () => {
    jest.spyOn(DriverPayoutService, "detail").mockResolvedValue({ driverId: "driver-alice" } as any);
    const r = await alice(request(app).get("/api/drivers/payouts/r1"));
    expect(r.body).toEqual({ success: true, data: { driverId: "driver-alice" } });
  });
  it("GET /history et /analytics", async () => {
    let r = await alice(request(app).get("/api/drivers/history?filtre=DELIVERED&page=2"));
    expect(r.body).toEqual({ success: true, data: [], total: 0 });
    expect(DriverActivityService.historique).toHaveBeenCalledWith("driver-alice", { filtre: "DELIVERED", page: 2 });
    expect((await alice(request(app).get("/api/drivers/history?filtre=NOPE"))).status).toBeGreaterThanOrEqual(400);
    r = await alice(request(app).get("/api/drivers/analytics?jours=30"));
    expect(r.body).toEqual({ success: true, data: { jours: 7 } });
    expect(DriverActivityService.analytics).toHaveBeenCalledWith("driver-alice", 30);
    expect((await alice(request(app).get("/api/drivers/analytics?jours=5"))).status).toBeGreaterThanOrEqual(400);
  });
  it("GET /ratings", async () => {
    db.courierRating.findMany.mockResolvedValue([{ id: "n1", note: 5, commentaire: "Top", createdAt: new Date("2026-10-04T10:00:00Z") }]);
    const r = await alice(request(app).get("/api/drivers/ratings"));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ moyenne: 4.5, avis: 2 });
    expect(r.body.data.notes[0]).toMatchObject({ id: "n1", note: 5, commentaire: "Top" });
    expect(db.courierRating.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { driverId: "driver-alice" } }));
  });
});

describe("courses", () => {
  it("GET /deliveries : liste (PENDING = propositions personnelles)", async () => {
    db.orderDelivery.findMany.mockResolvedValue([{ ...course({ driverId: null, status: "PENDING" }), order: { ...order, pourboireApres: null }, offers: [{ payout: 6 }], distanceKm: 2, estimatedTime: 10 }]);
    const r = await alice(request(app).get("/api/drivers/deliveries"));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ id: "course-1", orderId: "commande-1", status: "PENDING", pickupAddress: "1 rue A, Lyon", pickupStore: "Chez Test", deliveryAddress: "2 rue B, 69000 Lyon", payout: 5, masque: null });
    expect(r.body.data[0]).not.toHaveProperty("attenteFinLe");
    expect(db.orderDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PENDING", driverId: null, offers: { some: { driverId: "driver-alice", status: "PENDING", expiresAt: { gt: expect.any(Date) } } } },
      take: 50,
    }));
  });
  it("GET /deliveries : courses du livreur masquées selon la tournée", async () => {
    db.orderDelivery.findMany.mockResolvedValue([{ ...course({ status: "PICKED_UP" }), order: { ...order, pourboireApres: null }, offers: [] }]);
    (DispatchService.masquage as any).mockReturnValue("ORDRE");
    const r = await alice(request(app).get("/api/drivers/deliveries?status=ACTIVE"));
    expect(r.body.data[0]).toMatchObject({ masque: "ORDRE", customerName: null, customerPhone: null, deliveryAddress: null, latitude: null, longitude: null });
  });
  it("GET /deliveries/:id : course introuvable → 404, d'un autre → 403", async () => {
    db.orderDelivery.findUnique.mockResolvedValue(null);
    let r = await alice(request(app).get("/api/drivers/deliveries/x"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("DELIVERY_NOT_FOUND");
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ driverId: "driver-bob" }) });
    r = await alice(request(app).get("/api/drivers/deliveries/x"));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
  });
  it("GET /deliveries/:id : forme du détail", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ ...course(), deliveryLat: 1, deliveryLng: 2, deliveryLatObfusquee: 3, deliveryLngObfusquee: 4, order: { ...order, pourboireApres: null }, offers: [{ payout: 6 }], deliveryCode: null, codeAttempts: 0, proofPhoto: null });
    const r = await alice(request(app).get("/api/drivers/deliveries/course-1"));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ id: "course-1", orderStatus: "READY", pickupStore: "Chez Test", latitude: 1, longitude: 2, payout: 5, bilan: null, masque: null });
  });
  it("PATCH /deliveries/:id/accept", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ driverId: null, status: "PENDING" }) });
    db.deliveryOffer.findFirst.mockResolvedValue({ id: "offre-1" });
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1/accept"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, message: "Course acceptée", data: { id: "course-1", lot: [{}] } });
    expect(DispatchService.accepter).toHaveBeenCalledWith("offre-1", "driver-alice");
  });
  it("PATCH /deliveries/:id/accept : déjà acceptée → 409, sans proposition → 403 NOT_OFFERED", async () => {
    let r = await alice(request(app).patch("/api/drivers/deliveries/course-1/accept"));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ALREADY_ACCEPTED");
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ driverId: null, status: "PENDING" }) });
    db.deliveryOffer.findFirst.mockResolvedValueOnce({ id: "o" }).mockResolvedValueOnce(null);
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1/accept"));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("NOT_OFFERED");
  });
  it("PATCH /deliveries/:id : statut invalide → 400, non attribuée → 403, terminée → 409", async () => {
    let r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "NOPE" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_INPUT");
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ driverId: null, status: "PENDING" }) });
    db.deliveryOffer.findFirst.mockResolvedValue({ id: "o" });
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "ACCEPTED" }));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN"); // sans autoriserProposition, une simple proposition n'ouvre pas la course
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "PICKED_UP" }));
    expect(r.status).toBe(403);
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "DELIVERED" }) });
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "PICKED_UP" }));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("DELIVERY_FINISHED");
  });
  it("PATCH /deliveries/:id PICKED_UP : commande pas prête → 409 ORDER_NOT_READY", async () => {
    db.order.findUnique.mockResolvedValue({ status: "PREPARING" });
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "PICKED_UP" }));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ORDER_NOT_READY");
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
  });
  it("PATCH /deliveries/:id PICKED_UP : prise en charge", async () => {
    db.order.findUnique.mockResolvedValue({ status: "READY" });
    db.orderDelivery.update.mockResolvedValue({ ...course({ status: "PICKED_UP" }), order: { feesAmount: 3, tipAmount: 0 } });
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "PICKED_UP" }));
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, message: "Delivery updated", data: { id: "course-1", status: "PICKED_UP" } });
    expect(db.orderDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "course-1" }, data: { status: "PICKED_UP", pickupTime: expect.any(Date) } }));
    expect(db.orderDelivery.updateMany).toHaveBeenCalledWith({ where: { driverId: "driver-alice", status: { in: expect.any(Array) } }, data: { ordreRemise: null } });
    expect(emitDeliveryUpdate).toHaveBeenCalledWith("commande-1", { status: "PICKED_UP" });
    expect(Notifier.etapeLivraisonClient).toHaveBeenCalledWith("commande-1", "PICKED_UP");
  });
  it("PATCH /deliveries/:id DELIVERED : compteurs, commande terminée, notifications", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "PICKED_UP" }) });
    db.orderDelivery.update.mockResolvedValue({ ...course({ status: "DELIVERED" }), order: { feesAmount: 3, tipAmount: 2 } });
    db.notification.create.mockResolvedValue({ id: "n1" });
    db.order.findUnique.mockResolvedValue({ customerEmail: "c@test.fr" });
    db.order.update.mockResolvedValue({});
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "DELIVERED", code: "1234" }));
    expect(r.status).toBe(200);
    expect(DispatchService.exigerTourAtteint).toHaveBeenCalledWith("driver-alice", "course-1");
    expect(DeliveryProofService.verifier).toHaveBeenCalledWith("course-1", expect.objectContaining({ code: "1234" }));
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: "commande-1" }, data: { status: "COMPLETED" } });
    expect(db.courier.update).toHaveBeenCalledWith({ where: { id: "driver-alice" }, data: { totalDeliveries: { increment: 1 }, totalEarnings: { increment: 5 } } });
    expect(DispatchService.liberer).toHaveBeenCalledWith("driver-alice");
    expect(db.notification.create).toHaveBeenCalledTimes(2);
    expect(emitNotification).toHaveBeenCalledTimes(2);
    expect(Notifier.etapeLivraisonClient).toHaveBeenCalledWith("commande-1", "DELIVERED");
  });
  it("PATCH /deliveries/:id FAILED libère le livreur", async () => {
    db.orderDelivery.update.mockResolvedValue({ ...course({ status: "FAILED" }), order: null });
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1").send({ status: "FAILED" }));
    expect(r.status).toBe(200);
    expect(DispatchService.liberer).toHaveBeenCalledWith("driver-alice");
  });
  it("POST /deliveries/:id/photo : état, fichier, type", async () => {
    let r = await alice(request(app).post("/api/drivers/deliveries/course-1/photo"));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("NOT_PICKED_UP");
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "PICKED_UP", customerWaitStartedAt: new Date(Date.now() - 3_600_000) }) });
    r = await alice(request(app).post("/api/drivers/deliveries/course-1/photo"));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("NO_FILE");
    r = await alice(request(app).post("/api/drivers/deliveries/course-1/photo").attach("photo", PDF, { filename: "d.pdf", contentType: "application/pdf" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_FILE_TYPE");
    expect(FileUploadService.uploadDocument).not.toHaveBeenCalled();
  });
  it("POST /deliveries/:id/photo : photo acceptée → 201", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "PICKED_UP", customerWaitStartedAt: new Date(Date.now() - 3_600_000) }) });
    const r = await alice(request(app).post("/api/drivers/deliveries/course-1/photo").attach("photo", JPEG, { filename: "d.jpg", contentType: "image/jpeg" }));
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data).sort()).toEqual(["apercuUrl", "photoUrl"]);
    expect(FileUploadService.uploadDocument).toHaveBeenCalledWith(expect.any(Buffer), "d.jpg", "deliveries", "image/jpeg");
  });
  it("POST /deliveries/:id/attente : course non récupérée → 409 NOT_PICKED_UP", async () => {
    const r = await alice(request(app).post("/api/drivers/deliveries/course-1/attente"));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("NOT_PICKED_UP");
  });
  it("POST /deliveries/:id/attente : attente déjà lancée, relance idempotente", async () => {
    const debut = new Date(Date.now() - 60_000);
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "PICKED_UP", customerWaitStartedAt: debut }) });
    db.orderDelivery.updateMany.mockResolvedValue({ count: 0 });
    db.orderDelivery.findUniqueOrThrow.mockResolvedValue({ orderId: "commande-1", customerWaitStartedAt: debut });
    const r = await alice(request(app).post("/api/drivers/deliveries/course-1/attente"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data).sort()).toEqual(["attenteDebutLe", "attenteFinLe", "maintenant"]);
    expect(db.orderDelivery.updateMany).toHaveBeenCalledWith({ where: { id: "course-1", customerWaitStartedAt: null }, data: { customerWaitStartedAt: expect.any(Date) } });
    expect(emitDeliveryUpdate).not.toHaveBeenCalled();
  });
  it("PATCH /deliveries/:id/location : coordonnées requises, position enregistrée", async () => {
    let r = await alice(request(app).patch("/api/drivers/deliveries/course-1/location").send({ latitude: "x" }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_INPUT");
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1/location").send({ latitude: 45.7, longitude: 4.8 }));
    expect(r.body).toEqual({ success: true, message: "Position enregistrée", data: { latitude: 45.7, longitude: 4.8 } });
  });
  it("PATCH /location", async () => {
    expect((await alice(request(app).patch("/api/drivers/location").send({ latitude: 200, longitude: 4 }))).status).toBeGreaterThanOrEqual(400);
    const r = await alice(request(app).patch("/api/drivers/location").send({ latitude: 45.7, longitude: 4.8 }));
    expect(r.body).toEqual({ success: true, suivie: true, enLigne: true });
    expect(DispatchService.enregistrerPosition).toHaveBeenCalledWith("driver-alice", { latitude: 45.7, longitude: 4.8 });
  });
  it("GET /offers", async () => {
    db.deliveryOffer.findMany.mockResolvedValue([{
      id: "offre-1", deliveryId: "course-1", distanceKm: 3, payout: 6, expiresAt: new Date("2026-10-04T12:00:00Z"), batchId: null, ajout: false,
      horsLimite: false, bientotLibre: false, libreDansSecondes: null,
      delivery: { deliveryLatObfusquee: 1, deliveryLngObfusquee: 2, order: { id: "commande-1", deliveryAddress: "2 rue B", deliveryCity: "Lyon", deliveryPostal: "69000", store: order.store } },
    }]);
    const r = await alice(request(app).get("/api/drivers/offers"));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(1);
    expect(r.body.data[0]).toMatchObject({ id: "offre-1", deliveryId: "course-1", distanceKm: 3, approcheKm: 0, payout: 6, pickupStore: "Chez Test", deliveryLat: 1, boutique: order.store, codePostal: "69000" });
    expect(db.deliveryOffer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { driverId: "driver-alice", status: "PENDING", expiresAt: { gt: expect.any(Date) } }, orderBy: { offeredAt: "asc" } }));
  });
  it("GET /tournee", async () => {
    db.orderDelivery.findMany.mockResolvedValue([{ ...course({ status: "PICKED_UP" }), order: { status: "READY", customerName: "Client", deliveryAddress: "2 rue B", deliveryPostal: "69000", deliveryCity: "Lyon", store: order.store }, pickupLat: 45.7, pickupLng: 4.8, deliveryLat: 45.8, deliveryLng: 4.9 }]);
    const r = await alice(request(app).get("/api/drivers/tournee"));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(Object.keys(r.body.data).sort()).toEqual(["arrets", "km", "remisesMasquees"]);
    expect(r.body.data.remisesMasquees).toBe(0);
  });
  it("POST /offers/:id/accept et /decline", async () => {
    let r = await alice(request(app).post("/api/drivers/offers/o1/accept"));
    expect(r.body).toEqual({ success: true, message: "Course acceptée", data: { id: "course-1", lot: [{}] } });
    expect(DispatchService.accepter).toHaveBeenCalledWith("o1", "driver-alice");
    (DispatchService.refuser as any).mockResolvedValue({ id: "autre" });
    r = await alice(request(app).post("/api/drivers/offers/o1/decline"));
    expect(r.body).toEqual({ success: true, message: "Course refusée", reproposee: true });
    expect(DispatchService.refuser).toHaveBeenCalledWith("o1", "driver-alice");
  });
  it("PATCH /deliveries/:id/cancel : raison requise → 400, statut → 409", async () => {
    let r = await alice(request(app).patch("/api/drivers/deliveries/course-1/cancel").send({ reason: "  " }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("MISSING_REASON");
    db.orderDelivery.findUnique.mockResolvedValue({ ...course({ status: "PICKED_UP" }) });
    r = await alice(request(app).patch("/api/drivers/deliveries/course-1/cancel").send({ reason: "Panne" }));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("INVALID_STATUS");
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
  });
  it("PATCH /deliveries/:id/cancel : annulation", async () => {
    db.order.update.mockResolvedValue({ customerEmail: "c@test.fr" });
    const r = await alice(request(app).patch("/api/drivers/deliveries/course-1/cancel").send({ reason: " Panne " }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, message: "Course annulée. Un autre livreur sera proposé au restaurant.", data: { deliveryId: "course-1", orderId: "commande-1" } });
    expect(db.orderDelivery.update).toHaveBeenCalledWith({ where: { id: "course-1" }, data: { status: "FAILED", driverId: null, assignedAt: null, cancelledBy: "DRIVER", cancellationReason: "Panne" } });
    expect(DispatchService.liberer).toHaveBeenCalledWith("driver-alice");
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: "commande-1" }, data: { status: "READY" }, select: { customerEmail: true } });
    expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "DELIVERY_CANCELLED", recipientEmail: "c@test.fr" }) });
    expect(emitNotification).toHaveBeenCalledWith("c@test.fr", expect.objectContaining({ type: "delivery_cancelled", reason: " Panne " }));
  });
});

describe("GET /available (commerçant)", () => {
  const boutique = { id: "s1", orgId: "org1", latitude: 45.7, longitude: 4.8 };
  const coursier = (id: string, extra: any = {}) => ({ id, name: id, phone: "06", status: "ACTIVE", isOnline: true, isAvailable: true, currentOrderId: null, latitude: 45.71, longitude: 4.81, gpsLostAt: null, ...extra });
  it("storeId requis → 400, boutique inconnue → 404", async () => {
    let r = await alice(request(app).get("/api/drivers/available"));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("STORE_ID_REQUIRED");
    db.store.findUnique.mockResolvedValue(null);
    r = await alice(request(app).get("/api/drivers/available?storeId=s1"));
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("STORE_NOT_FOUND");
  });
  it("boutique d'une autre organisation → 403", async () => {
    db.store.findUnique.mockResolvedValue(boutique);
    db.membership.findFirst.mockResolvedValue(null);
    const r = await alice(request(app).get("/api/drivers/available?storeId=s1"));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
    expect(db.courier.findMany).not.toHaveBeenCalled();
    expect(db.membership.findFirst).toHaveBeenCalledWith({ where: { userId: "alice", orgId: "org1" }, select: { id: true } });
  });
  it("boutique sans GPS → 400", async () => {
    db.store.findUnique.mockResolvedValue({ ...boutique, latitude: null });
    db.membership.findFirst.mockResolvedValue({ id: "m" });
    const r = await alice(request(app).get("/api/drivers/available?storeId=s1"));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("STORE_WITHOUT_LOCATION");
  });
  it("liste triée, diagnostic et en-têtes anti-cache", async () => {
    db.store.findUnique.mockResolvedValue(boutique);
    db.membership.findFirst.mockResolvedValue({ id: "m" });
    db.courier.findMany.mockResolvedValue([
      coursier("loin", { latitude: 46.7 }), coursier("proche"), coursier("hors-ligne", { isOnline: false }),
      coursier("occupe", { currentOrderId: "x" }), coursier("gps-perdu", { gpsLostAt: new Date() }), coursier("suspendu", { status: "SUSPENDED" }),
    ]);
    const r = await alice(request(app).get("/api/drivers/available?storeId=s1"));
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(r.body.success).toBe(true);
    expect(r.body.deliveryMen.map((d: any) => d.id)).toEqual(["proche"]);
    expect(r.body).toMatchObject({ total: 1, radiusKm: 10 });
    expect(r.body.diagnostic).toMatchObject({ total: 6, actifs: 5, enLigne: 4, libres: 3, localises: 2, dansLeRayon: 1 });
  });
  it("un super-administrateur n'a pas besoin d'appartenir à l'organisation", async () => {
    db.store.findUnique.mockResolvedValue(boutique);
    db.courier.findMany.mockResolvedValue([]);
    const r = await request(app).get("/api/drivers/available?storeId=s1").set("Authorization", "Bearer admin");
    expect(r.status).toBe(200);
    expect(db.membership.findFirst).not.toHaveBeenCalled();
  });
});
