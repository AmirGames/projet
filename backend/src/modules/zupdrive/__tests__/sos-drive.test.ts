import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const alerte = (o: any = {}) => ({ id: "a1", courseId: "c1", equipePrevenueLe: null, contactPrevenuLe: null, createdAt: new Date(), ...o });
const db: any = {
  alerteSosDrive: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  contactConfianceDrive: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  user: { findUnique: jest.fn() },
};
const course: any = { maCourse: jest.fn() };
const support: any = { createTicket: jest.fn() };
const email: any = { sendEmail: jest.fn() };
const plateforme: any = jest.fn();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../middleware/throttle", () => ({ limiterCadence: () => (_req: any, _res: any, next: any) => next() }));
jest.mock("../course-drive.service", () => ({ CourseDriveService: course }));
jest.mock("../zupdrive-support.service", () => ({ ZupDriveSupportService: support }));
jest.mock("../../notifications/email.service", () => ({ EmailService: email }));
jest.mock("../../notifications/notification.service", () => ({ notifierPlateforme: plateforme }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    next();
  },
}));
import router from "../sos-drive.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/sos", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const COURSE = { id: "c1", statut: "EN_COURS", departAdresse: "1 rue A", arriveeAdresse: "2 rue B", chauffeur: { prenom: "Karim", vehicule: "Tesla", plaque: "AB-123-CD" } };

beforeEach(() => {
  jest.clearAllMocks();
  course.maCourse.mockImplementation(async (userId: string, id: string) => {
    if (userId !== "user-alice" || id !== "c1") throw Object.assign(new Error("introuvable"), { statusCode: 404, code: "RIDE_NOT_FOUND" });
    return COURSE;
  });
  db.alerteSosDrive.findUnique.mockResolvedValue(null);
  db.alerteSosDrive.create.mockResolvedValue(alerte());
  db.alerteSosDrive.findUniqueOrThrow.mockResolvedValue(alerte({ equipePrevenueLe: new Date(), contactPrevenuLe: new Date() }));
  db.alerteSosDrive.updateMany.mockResolvedValue({ count: 1 });
  db.alerteSosDrive.update.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ name: "Alice <b>", email: "alice@x.fr" });
  db.contactConfianceDrive.findUnique.mockResolvedValue({ nom: "Bob", email: "bob@x.fr" });
  support.createTicket.mockResolvedValue({ ticketNumber: "SUP-1" });
  email.sendEmail.mockResolvedValue({ success: true });
});

describe("alerte SOS", () => {
  it("refuse sans jeton", async () => {
    expect((await request(app).post("/api/zupdrive/sos").send({ courseId: "c1" })).status).toBe(401);
    expect((await request(app).get("/api/zupdrive/sos/contact")).status).toBe(401);
  });

  it("enregistre l'alerte puis prévient l'équipe (ticket CRITIQUE) et la personne de confiance", async () => {
    const res = await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1", latitude: 48.86, longitude: 2.34 });
    expect(res.status).toBe(201);
    expect(db.alerteSosDrive.create.mock.calls[0][0].data).toMatchObject({ courseId: "c1", passagerId: "user-alice", latitude: 48.86, longitude: 2.34 });
    expect(support.createTicket.mock.calls[0][0]).toMatchObject({ priority: "CRITIQUE", reporterId: "user-alice", reporterType: "PASSAGER" });
    expect(plateforme).toHaveBeenCalled();
    const mail = email.sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("bob@x.fr");
    expect(mail.html).not.toContain("<b>"); // le nom du passager est échappé
    expect(mail.text).toContain("17");
  });

  it("une course d'un autre compte répond 404 et n'envoie rien", async () => {
    const res = await request(app).post("/api/zupdrive/sos").set({ "x-user": "user-bob" }).send({ courseId: "c1" });
    expect(res.status).toBe(404);
    expect(db.alerteSosDrive.create).not.toHaveBeenCalled();
    expect(support.createTicket).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse hors d'un trajet avec chauffeur (en recherche, terminé, annulé)", async () => {
    for (const statut of ["RECHERCHE", "TERMINEE", "ANNULEE", "SANS_CHAUFFEUR"]) {
      course.maCourse.mockResolvedValueOnce({ ...COURSE, statut });
      const res = await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1" });
      expect(res.status).toBe(409);
    }
    expect(db.alerteSosDrive.create).not.toHaveBeenCalled();
  });

  it("rejouée : même alerte, rien n'est renvoyé deux fois", async () => {
    db.alerteSosDrive.findUnique.mockResolvedValue(alerte({ equipePrevenueLe: new Date(), contactPrevenuLe: new Date() }));
    db.alerteSosDrive.updateMany.mockResolvedValue({ count: 0 }); // réservation déjà prise
    const res = await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1" });
    expect(res.status).toBe(201);
    expect(db.alerteSosDrive.create).not.toHaveBeenCalled();
    expect(support.createTicket).not.toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("un e-mail en échec n'annule pas l'alerte : la réservation est libérée pour une nouvelle tentative", async () => {
    email.sendEmail.mockRejectedValue(new Error("smtp"));
    const res = await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1" });
    expect(res.status).toBe(201);
    expect(db.alerteSosDrive.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { contactPrevenuLe: null } });
  });

  it("un ticket en échec n'annule pas l'alerte non plus", async () => {
    support.createTicket.mockRejectedValue(new Error("db"));
    const res = await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1" });
    expect(res.status).toBe(201);
    expect(db.alerteSosDrive.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { equipePrevenueLe: null } });
  });

  it("sans personne de confiance, seule l'équipe est prévenue", async () => {
    db.contactConfianceDrive.findUnique.mockResolvedValue(null);
    expect((await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1" })).status).toBe(201);
    expect(support.createTicket).toHaveBeenCalled();
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it("refuse une position incomplète, un champ inconnu et un corps sans courseId", async () => {
    expect((await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1", latitude: 48 })).status).toBe(400);
    expect((await request(app).post("/api/zupdrive/sos").set(alice).send({ courseId: "c1", passagerId: "x" })).status).toBe(400);
    expect((await request(app).post("/api/zupdrive/sos").set(alice).send({})).status).toBe(400);
  });
});

describe("personne de confiance", () => {
  it("n'enregistre qu'avec le consentement du passager, pour le compte du jeton", async () => {
    db.contactConfianceDrive.upsert.mockResolvedValue({ nom: "Bob", email: "bob@x.fr", consentementLe: new Date() });
    expect((await request(app).put("/api/zupdrive/sos/contact").set(alice).send({ nom: "Bob", email: "bob@x.fr" })).status).toBe(400);
    expect((await request(app).put("/api/zupdrive/sos/contact").set(alice).send({ nom: "Bob", email: "bob@x.fr", consentement: false })).status).toBe(400);
    expect((await request(app).put("/api/zupdrive/sos/contact").set(alice).send({ nom: "Bob", email: "pas-un-email", consentement: true })).status).toBe(400);
    expect(db.contactConfianceDrive.upsert).not.toHaveBeenCalled();
    const ok = await request(app).put("/api/zupdrive/sos/contact").set(alice).send({ nom: "Bob", email: "BOB@x.fr", consentement: true });
    expect(ok.status).toBe(200);
    expect(db.contactConfianceDrive.upsert.mock.calls[0][0].where).toEqual({ userId: "user-alice" });
    expect(db.contactConfianceDrive.upsert.mock.calls[0][0].create.email).toBe("bob@x.fr");
  });

  it("GET et DELETE ne touchent que le compte du jeton", async () => {
    db.contactConfianceDrive.findUnique.mockResolvedValue(null);
    await request(app).get("/api/zupdrive/sos/contact").set(alice);
    expect(db.contactConfianceDrive.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-alice" } }));
    await request(app).delete("/api/zupdrive/sos/contact").set(alice);
    expect(db.contactConfianceDrive.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-alice" } });
  });
});
