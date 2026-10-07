import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = { paymentIntentDrive: { findUnique: jest.fn() } };
const course: any = {
  maCourse: jest.fn(),
  chauffeurDuCompte: jest.fn(),
};
const paiement: any = {
  createPaymentIntent: jest.fn(async () => ({ paymentId: "pay-1", clientSecret: "secret", amount: 1500, currency: "eur" })),
  getDriverEarnings: jest.fn(async () => ({ total: 0 })),
};
const realtime: any = { getStats: jest.fn(() => ({ totalConnections: 3 })), joinCourse: jest.fn(), leaveCourse: jest.fn() };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../course-drive.service", () => ({ CourseDriveService: course }));
jest.mock("../zupdrive-payment.service", () => ({ ZupDrivePaymentService: paiement }));
jest.mock("../zupdrive-realtime.service", () => ({ ZupDriveRealtimeService: realtime }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user"); // comme le vrai : req.userId, pas req.user.id
    req.user = { userId: req.userId };
    req.compte = { id: req.userId, isSuperOwner: false, isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
import paymentRouter from "../zupdrive-payment.routes";
import realtimeRouter from "../zupdrive-realtime.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/payment", paymentRouter);
app.use("/api/zupdrive/realtime", realtimeRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const bob = { "x-user": "user-bob" };
const COURSE_ALICE = { id: "course-1", passagerId: "user-alice", statut: "RECHERCHE", prixCentimes: 1500 };

beforeEach(() => {
  jest.clearAllMocks();
  // maCourse refuse la course d'un autre passager, comme le vrai service.
  course.maCourse.mockImplementation(async (passagerId: string, courseId: string) => {
    if (courseId !== "course-1" || passagerId !== "user-alice") throw Object.assign(new Error("introuvable"), { statusCode: 404, code: "RIDE_NOT_FOUND" });
    return COURSE_ALICE;
  });
  course.chauffeurDuCompte.mockResolvedValue({ id: "chauffeur-1" });
  db.paymentIntentDrive.findUnique.mockResolvedValue({ id: "pay-1", status: "SUCCEEDED", amountCentimes: 1500, currency: "EUR", confirmedAt: new Date() });
});

describe("paiement d'une course : l'identité est celle du jeton", () => {
  it("POST /intent crée le paiement du passager du jeton, avec le prix de la course en base (pas celui du corps)", async () => {
    const res = await request(app).post("/api/zupdrive/payment/intent").set(alice).send({ courseId: "course-1", prixCentimes: 1 });
    expect(res.status).toBe(200);
    expect(course.maCourse).toHaveBeenCalledWith("user-alice", "course-1");
    expect(paiement.createPaymentIntent).toHaveBeenCalledWith("course-1", "user-alice", 1500);
  });

  it("POST /intent sur la course d'un autre passager : 404, aucune intention Stripe", async () => {
    expect((await request(app).post("/api/zupdrive/payment/intent").set(bob).send({ courseId: "course-1" })).status).toBe(404);
    expect(paiement.createPaymentIntent).not.toHaveBeenCalled();
  });

  it("POST /intent refuse une course qui n'est plus en recherche", async () => {
    course.maCourse.mockResolvedValue({ ...COURSE_ALICE, statut: "ACCEPTEE" });
    expect((await request(app).post("/api/zupdrive/payment/intent").set(alice).send({ courseId: "course-1" })).status).toBe(409);
    expect(paiement.createPaymentIntent).not.toHaveBeenCalled();
  });

  it("GET /:courseId rend l'état du paiement relu en base, pour le passager seulement", async () => {
    const res = await request(app).get("/api/zupdrive/payment/course-1").set(alice);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ courseId: "course-1", payment: { status: "SUCCEEDED", amountCentimes: 1500 } });
    expect(res.body.data.payment).not.toHaveProperty("stripeId");
    expect((await request(app).get("/api/zupdrive/payment/course-1").set(bob)).status).toBe(404);
  });

  it("GET /earnings n'est plus masquée par /:courseId : revenus du chauffeur du jeton", async () => {
    const res = await request(app).get("/api/zupdrive/payment/earnings").set(alice);
    expect(res.status).toBe(200);
    expect(course.chauffeurDuCompte).toHaveBeenCalledWith("user-alice");
    expect(paiement.getDriverEarnings).toHaveBeenCalledWith("chauffeur-1");
    expect(course.maCourse).not.toHaveBeenCalled();
  });

  it.each([["post", "/intent"], ["get", "/earnings"], ["get", "/course-1"]] as const)("%s %s : 401 sans jeton", async (m, url) => {
    expect((await (request(app) as any)[m](`/api/zupdrive/payment${url}`).send({})).status).toBe(401);
  });
});

describe("temps réel", () => {
  it("les compteurs de connexions sont réservés à l'équipe", async () => {
    expect((await request(app).get("/api/zupdrive/realtime/stats").set(alice)).status).toBe(403);
    const res = await request(app).get("/api/zupdrive/realtime/stats").set({ "x-user": "agent", "x-equipe": "1" });
    expect(res.status).toBe(200);
    expect(res.body.data.totalConnections).toBe(3);
  });
});
