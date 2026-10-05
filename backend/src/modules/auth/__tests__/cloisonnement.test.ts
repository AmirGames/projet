import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const orgA = "aaaaaaaaaaaaaaaaaaaaaaaaa";
const orgB = "bbbbbbbbbbbbbbbbbbbbbbbbb";
const storeA = "ccccccccccccccccccccccccc";
const storeB = "ddddddddddddddddddddddddd";
const productB = "eeeeeeeeeeeeeeeeeeeeeeeee";
let admin = false;
const record = jest.fn();
const db: any = {
  store: { findUnique: jest.fn(async ({ where }: any) => where.id === storeA ? { orgId: orgA } : where.id === storeB ? { orgId: orgB } : null) },
  organization: { findUnique: jest.fn(async ({ where }: any) => [orgA, orgB].includes(where.id) ? { id: where.id } : null) },
  membership: { findMany: jest.fn(async () => [{ orgId: orgA }]) },
  product: { findUnique: jest.fn(async () => ({ store: { orgId: orgB } })) },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock("../security-event.service", () => ({ SecurityEventService: { record: (...args: any[]) => record(...args) } }));
jest.mock("../auth.middleware", () => ({
  verifyToken: () => ({ userId: "alice" }),
  compteDuJeton: async () => ({ id: "alice", isSuperOwner: false, isSystemAdmin: admin, acces: { EAT: "SUPPORT" } }),
}));
import { cloisonnement, oublierIdentifiant } from "../cloisonnement.middleware";
const app = express();
app.use(express.json());
app.use(cloisonnement);
app.use((_req, res) => res.json({ ok: true }));
const api = (method: "get" | "post" | "put", path: string) => request(app)[method](path).set("Authorization", "Bearer alice");

beforeEach(() => {
  admin = false;
  [storeA, storeB, orgA, orgB].forEach(oublierIdentifiant);
  db.product.findUnique.mockImplementation(async () => ({ store: { orgId: orgB } }));
});
describe("cloisonnement commerçant, y compris comptes support/admin", () => {
  it("conserve l'accès aux factures de sa boutique", async () => {
    expect((await api("get", `/api/invoices/${storeA}`)).status).toBe(200);
  });
  it.each([false, true])("refuse les factures du voisin (admin=%s)", async (isAdmin) => {
    admin = isAdmin;
    const response = await api("get", `/api/invoices/${storeB}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CROSS_TENANT_DENIED");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "CROSS_TENANT_DENIED", actor: "alice" }));
  });
  it("refuse storeId en query et orgId dans le corps", async () => {
    expect((await api("get", `/api/reports?storeId=${storeB}`)).status).toBe(403);
    expect((await api("post", "/api/reports").send({ orgId: orgB })).status).toBe(403);
  });
  it("résout le propriétaire d'un produit avant une mutation", async () => {
    expect((await api("put", `/api/products/${productB}`).send({ name: "Intrusion" })).status).toBe(403);
  });
  it("n'ouvre jamais l'accès si la résolution du propriétaire échoue", async () => {
    db.product.findUnique.mockRejectedValue(new Error("Database unavailable"));
    expect((await api("put", `/api/products/${productB}`).send({ name: "Intrusion" })).status).toBe(403);
  });
});
