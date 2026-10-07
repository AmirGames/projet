import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const boutique = { id: "s1", orgId: "o1", name: "Chez Zup", products: [], categories: [], theme: null };
const db: any = {
  store: {
    findFirst: jest.fn(async () => boutique),
    findMany: jest.fn(async () => [boutique]),
    findUnique: jest.fn(async () => boutique),
  },
  membership: { findMany: jest.fn(async () => [{ orgId: "o1", role: "STORE_STAFF", storeIds: ["s1"] }]) },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.status(401).json({ code: "MISSING_AUTH" });
    req.userId = "u1";
    req.compte = { id: "u1", isSuperOwner: false };
    next();
  },
  checkOrgStatus: (_req: any, _res: any, next: any) => next(),
}));
import storeRouter from "../store.routes";

const app = express();
app.use(express.json());
app.use("/api/stores", storeRouter);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || err.statusCode || 500).json({ code: err.code }));

/** Routes de ce routeur qu'un visiteur sans compte peut appeler. */
const ROUTES_PUBLIQUES = new Set(["GET /slug/:slug", "GET /types", "GET /types/:code"]);

function routes(router: any) {
  return router.stack
    .filter((couche: any) => couche.route)
    .flatMap((couche: any) =>
      Object.keys(couche.route.methods).map((methode) => ({
        cle: `${methode.toUpperCase()} ${couche.route.path}`,
        gardee: couche.route.stack.some((c: any) => c.handle.name === "authMiddleware"),
      })),
    );
}

beforeEach(() => { jest.clearAllMocks(); });

describe("routes boutiques : rien de privé sans compte", () => {
  it("toute route sans authMiddleware est déclarée publique", () => {
    const nonGardees = routes(storeRouter).filter((r: any) => !r.gardee).map((r: any) => r.cle);
    expect(nonGardees.filter((cle: string) => !ROUTES_PUBLIQUES.has(cle))).toEqual([]);
  });

  it("GET /:id refuse un visiteur anonyme", async () => {
    const res = await request(app).get("/api/stores/s1");
    expect(res.status).toBe(401);
    expect(db.store.findFirst).not.toHaveBeenCalled();
  });

  it("GET /org/:orgId refuse un visiteur anonyme", async () => {
    const res = await request(app).get("/api/stores/org/o1");
    expect(res.status).toBe(401);
    expect(db.store.findMany).not.toHaveBeenCalled();
  });

  it("GET /:id ne charge jamais les commandes ni les boutiques supprimées", async () => {
    const res = await request(app).get("/api/stores/s1").set("Authorization", "Bearer x");
    expect(res.status).toBe(200);
    const requete = db.store.findFirst.mock.calls[0][0];
    expect(requete.include.orders).toBeUndefined();
    expect(requete.where).toMatchObject({ id: "s1", deletedAt: null });
    expect(JSON.stringify(res.body)).not.toMatch(/customerEmail|customerPhone|trackingTokenHash/);
  });

  it("GET /org/:orgId limite un STAFF aux boutiques qui lui sont attribuées", async () => {
    const res = await request(app).get("/api/stores/org/o1").set("Authorization", "Bearer x");
    expect(res.status).toBe(200);
    const { where } = db.store.findMany.mock.calls[0][0];
    expect(JSON.stringify(where)).toContain('"id":{"in":["s1"]}');
  });
});
