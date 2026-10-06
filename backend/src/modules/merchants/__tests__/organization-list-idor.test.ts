import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  user: { findUnique: jest.fn() },
  organization: { findMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
// Seule la cryptographie est simulée ; le routeur et son authMiddleware sont réels.
jest.mock("../../auth/auth.service", () => ({ AuthService: {
  verifyAccessToken: (token: string) => {
    if (!["alice", "bob"].includes(token)) throw new Error("Jeton invalide");
    return { userId: token, sid: `session-${token}` };
  },
} }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));

import router from "../organization.routes";
import { oublierCompte } from "../../auth/auth.middleware";

const app = express();
app.use(express.json());
app.use("/api/organizations", router);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ code: error.code }));

describe("liste personnelle des organisations : IDOR", () => {
  beforeEach(() => {
    oublierCompte("alice");
    oublierCompte("bob");
    db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, isSuperOwner: false, isSystemAdmin: false, accesEquipe: [], passwordChangedAt: null }));
    db.organization.findMany.mockImplementation(async ({ where }: any) => [{ id: `org-${where.memberships.some.userId}` }]);
  });

  it("refuse l'absence de jeton même avec un userId dans un corps GET", async () => {
    const r = await request(app).get("/api/organizations").send({ userId: "alice" });
    expect(r.status).toBe(401);
    expect(db.organization.findMany).not.toHaveBeenCalled();
  });

  it.each([["alice", "bob"], ["bob", "alice"]])("%s ignore l'identité injectée de %s", async (owner, other) => {
    const r = await request(app).get(`/api/organizations?userId=${other}`).set("Authorization", `Bearer ${owner}`).send({ userId: other });
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ id: `org-${owner}` }]);
    expect(db.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { memberships: { some: { userId: owner } } } }));
  });

  it("liste les organisations d'Alice sans corps GET", async () => {
    const r = await request(app).get("/api/organizations").set("Authorization", "Bearer alice");
    expect(r.status).toBe(200);
    expect(r.body).toEqual([{ id: "org-alice" }]);
  });
});
