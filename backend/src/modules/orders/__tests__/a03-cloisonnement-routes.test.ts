import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  order: { findUnique: jest.fn() },
  store: { findFirst: jest.fn() },
  membership: { findFirst: jest.fn(), findMany: jest.fn() },
};
const getByStoreId = jest.fn(async (_storeId: string, _limit: number, _offset: number) => []);
const countByStoreId = jest.fn(async () => 0);
const getByStatus = jest.fn(async () => []);
const getByOrgId = jest.fn(async () => []);
const chiffreAffairesOrg = jest.fn(async () => ({ commandes: 0, chiffreAffaires: 0 }));
const updateStatus = jest.fn(async () => ({ id: "order-b", status: "ACCEPTED" }));
const getById = jest.fn(async () => ({ id: "order-b" }));
const supprimer = jest.fn(async () => ({}));
const creerCourse = jest.fn(async () => ({ id: "delivery-b", driverId: "driver-b" }));

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ code: "MISSING_AUTH" });
    req.userId = "user-a";
    req.compte = { id: "user-a", isSuperOwner: false };
    next();
  },
  authFacultative: (_req: any, _res: any, next: any) => next(),
}));
jest.mock("../order.service", () => ({
  OrderService: {
    getByStoreId, countByStoreId, getByStatus, getByOrgId,
    chiffreAffairesOrg, updateStatus, getById, delete: supprimer,
  },
}));
jest.mock("../../drivers/dispatch.service", () => ({
  DispatchService: { creerCourse },
}));
jest.mock("../../realtime/socket", () => ({
  emitOrderUpdate: jest.fn(), emitMerchantEvent: jest.fn(), emitNotification: jest.fn(),
}));

import router from "../order.routes";

const app = express();
app.use(express.json());
app.use("/api/orders", router);
app.use((err: any, _req: any, res: any, _next: any) =>
  res.status(err.statusCode || err.status || 500).json({ code: err.code })
);

beforeEach(() => {
  jest.clearAllMocks();
  db.order.findUnique.mockResolvedValue({ storeId: "store-b" });
  // L'utilisateur appartient uniquement à l'organisation A.
  db.membership.findMany.mockResolvedValue([
    { orgId: "org-a", role: "ADMIN", storeIds: ["store-a"] },
  ]);
  db.membership.findFirst.mockResolvedValue(null);
  // Prisma retourne null si la boutique B ne correspond pas au périmètre A.
  db.store.findFirst.mockResolvedValue(null);
});

describe("A03 : cloisonnement des commandes entre organisations", () => {
  it.each([
    "/api/orders?storeId=store-b",
    "/api/orders/store/store-b",
    "/api/orders/status/store-b?status=PENDING",
  ])("refuse la lecture de la boutique B : %s", async (url) => {
    const res = await request(app).get(url).set("Authorization", "Bearer user-a");
    expect(res.status).toBe(403);
    expect(getByStoreId).not.toHaveBeenCalled();
    expect(getByStatus).not.toHaveBeenCalled();
    expect(countByStoreId).not.toHaveBeenCalled();
  });

  it("refuse les commandes et chiffres d'affaires de l'organisation B", async () => {
    const res = await request(app)
      .get("/api/orders?orgId=org-b")
      .set("Authorization", "Bearer user-a");
    expect(res.status).toBe(403);
    expect(getByOrgId).not.toHaveBeenCalled();
    expect(chiffreAffairesOrg).not.toHaveBeenCalled();
  });

  it.each([
    ["PATCH", "/api/orders/order-b/status"],
    ["DELETE", "/api/orders/order-b"],
    ["POST", "/api/orders/order-b/dispatch"],
  ])("refuse %s sur une commande de B avant tout effet", async (method, url) => {
    const agent = request(app);
    const res = method === "PATCH"
      ? await agent.patch(url).set("Authorization", "Bearer user-a").send({ status: "ACCEPTED" })
      : method === "DELETE"
        ? await agent.delete(url).set("Authorization", "Bearer user-a")
        : await agent.post(url).set("Authorization", "Bearer user-a").send({});
    expect(res.status).toBe(403);
    expect(updateStatus).not.toHaveBeenCalled();
    expect(getById).not.toHaveBeenCalled();
    expect(supprimer).not.toHaveBeenCalled();
    expect(creerCourse).not.toHaveBeenCalled();
  });

  it("refuse les opérations sensibles au personnel STAFF, même sur sa boutique", async () => {
    db.membership.findMany.mockResolvedValue([
      { orgId: "org-b", role: "STORE_STAFF", storeIds: ["store-b"] },
    ]);
    const res = await request(app)
      .patch("/api/orders/order-b/status")
      .set("Authorization", "Bearer user-a")
      .send({ status: "ACCEPTED" });
    expect(res.status).toBe(403);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("permet la lecture à un membre STAFF affecté à la boutique B", async () => {
    db.membership.findMany.mockResolvedValue([
      { orgId: "org-b", role: "STORE_STAFF", storeIds: ["store-b"] },
    ]);
    db.store.findFirst.mockResolvedValue({ id: "store-b", orgId: "org-b" });
    const res = await request(app)
      .get("/api/orders/store/store-b")
      .set("Authorization", "Bearer user-a");
    expect(res.status).toBe(200);
    expect(getByStoreId).toHaveBeenCalledWith("store-b", expect.any(Number), expect.any(Number));
  });
});
