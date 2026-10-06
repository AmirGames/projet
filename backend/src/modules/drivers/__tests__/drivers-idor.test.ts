import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  courier: { findUnique: jest.fn(), update: jest.fn() },
  orderDelivery: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  deliveryOffer: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ NODE_ENV: "test", JWT_SECRET: "a".repeat(40), API_URL: "https://api.test", FRONTEND_URL: "https://test", LOG_LEVEL: "error" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../realtime/socket", () => ({ emitDeliveryUpdate: jest.fn(), emitNotification: jest.fn(), emitDriverEvent: jest.fn(), emitSupportEvent: jest.fn() }));
jest.mock("../../notifications/email.service", () => ({ EmailService: {} }));
jest.mock("../../notifications/email.config", () => ({ emailTransporter: { sendMail: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({ authMiddleware: (req: any, res: any, next: any) => {
  const id = req.headers.authorization?.replace("Bearer ", "");
  if (!["alice", "bob"].includes(id)) return res.status(401).json({});
  req.userId = id;
  req.user = { userId: id };
  next();
} }));

import router from "../drivers.routes";
import { DispatchService } from "../dispatch.service";
import { DriverPayoutService } from "../../payouts/driver-payout.service";

const app = express();
app.use(express.json());
app.use("/api/drivers", router);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ code: error.code }));

const mutations: [string, string, any, number][] = [
  ["get", "/deliveries/course-alice", null, 403],
  ["patch", "/deliveries/course-alice/accept", {}, 403],
  ["patch", "/deliveries/course-alice", { status: "PICKED_UP" }, 403],
  ["patch", "/deliveries/course-alice/location", { latitude: 45.7, longitude: 4.8 }, 403],
  ["patch", "/deliveries/course-alice/cancel", { reason: "Test intrusif" }, 403],
  ["post", "/deliveries/course-alice/attente", {}, 403],
  ["post", "/deliveries/course-alice/photo", {}, 403],
  ["post", "/offers/offre-alice/accept", {}, 404],
  ["post", "/offers/offre-alice/decline", {}, 404],
  ["get", "/payouts/releve-alice", null, 404],
];

beforeEach(() => {
  db.courier.findUnique.mockImplementation(async ({ where }: any) => ({ id: `driver-${where.userId}`, userId: where.userId }));
  db.orderDelivery.findUnique.mockResolvedValue({ id: "course-alice", driverId: "driver-alice", status: "ACCEPTED", offers: [], order: { items: [], store: { name: "Audit" } }, deliveryCode: null, codeAttempts: 0, proofPhoto: null, proofType: null, proofAt: null });
  db.deliveryOffer.findUnique.mockResolvedValue({ id: "offre-alice", driverId: "driver-alice", status: "PENDING" });
  db.deliveryOffer.findFirst.mockResolvedValue(null);
  jest.spyOn(DriverPayoutService, "detail").mockResolvedValue({ driverId: "driver-alice" } as any);
  jest.spyOn(DispatchService, "etatTournee").mockResolvedValue({ retraitsRestants: 0, remiseCourante: "course-alice" } as any);
  jest.spyOn(DispatchService, "enregistrerPosition").mockResolvedValue({ suivie: true, enLigne: true });
});

describe("HTTP livreurs : isolation Alice/Bob", () => {
  it.each(mutations)("sans token %s %s", async (method, path, body) => {
    const r = await (request(app) as any)[method](`/api/drivers${path}`).send(body ?? undefined);
    expect(r.status).toBe(401);
    expect(db.orderDelivery.findUnique).not.toHaveBeenCalled();
  });
  it.each(mutations)("Bob ne manipule pas %s %s", async (method, path, body, denied) => {
    const r = await (request(app) as any)[method](`/api/drivers${path}`).set("Authorization", "Bearer bob").send(body ?? undefined);
    expect(r.status).toBe(denied);
    expect(db.orderDelivery.update).not.toHaveBeenCalled();
    expect(db.orderDelivery.updateMany).not.toHaveBeenCalled();
    expect(db.deliveryOffer.update).not.toHaveBeenCalled();
    expect(db.deliveryOffer.updateMany).not.toHaveBeenCalled();
    expect(db.courier.update).not.toHaveBeenCalled();
    expect(DispatchService.enregistrerPosition).not.toHaveBeenCalled();
  });
  it("Alice lit sa course attribuée", async () => {
    const r = await request(app).get("/api/drivers/deliveries/course-alice").set("Authorization", "Bearer alice");
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe("course-alice");
  });
  it("conserve l'attente client dans la liste des courses après relecture", async () => {
    db.orderDelivery.findMany.mockResolvedValue([{
      id: "course-alice", orderId: "commande-alice", status: "PICKED_UP", driverId: "driver-alice",
      customerWaitStartedAt: new Date("2026-10-04T12:00:00Z"),
      order: { items: [], store: { name: "Audit" } },
    }]);
    const r = await request(app).get("/api/drivers/deliveries?status=ACTIVE").set("Authorization", "Bearer alice");
    expect(r.status).toBe(200);
    expect(r.body.data[0].attenteFinLe).toBe("2026-10-04T12:06:00.000Z");
    expect(db.orderDelivery.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { driverId: "driver-alice", status: { in: ["ACCEPTED", "PICKED_UP"] } },
    }));
  });
  it("seule une proposition personnelle en cours ouvre une course non attribuée", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ id: "course-alice", driverId: null, status: "PENDING", offers: [], order: { items: [] }, deliveryCode: null, codeAttempts: 0, proofPhoto: null });
    db.deliveryOffer.findFirst.mockImplementation(async ({ where }: any) => {
      expect(where).toEqual(expect.objectContaining({ deliveryId: "course-alice", status: "PENDING", expiresAt: { gt: expect.any(Date) } }));
      return where.driverId === "driver-alice" ? { id: "offre-alice" } : null;
    });
    expect((await request(app).get("/api/drivers/deliveries/course-alice").set("Authorization", "Bearer alice")).status).toBe(200);
    expect((await request(app).get("/api/drivers/deliveries/course-alice").set("Authorization", "Bearer bob")).status).toBe(403);
    expect((await request(app).patch("/api/drivers/deliveries/course-alice/location").set("Authorization", "Bearer alice").send({ latitude: 45.7, longitude: 4.8 })).status).toBe(403);
  });
  it("une course sans proposition personnelle ne devient pas publique", async () => {
    db.orderDelivery.findUnique.mockResolvedValue({ id: "course-alice", driverId: null, status: "PENDING" });
    expect((await request(app).get("/api/drivers/deliveries/course-alice").set("Authorization", "Bearer alice")).status).toBe(403);
  });
  it("la position légitime ne prend pas le driverId fourni par le client", async () => {
    const r = await request(app).patch("/api/drivers/deliveries/course-alice/location").set("Authorization", "Bearer alice").send({ latitude: 45.7, longitude: 4.8, driverId: "driver-bob" });
    expect(r.status).toBe(200);
    expect(DispatchService.enregistrerPosition).toHaveBeenCalledWith("driver-alice", { latitude: 45.7, longitude: 4.8 });
  });
});
