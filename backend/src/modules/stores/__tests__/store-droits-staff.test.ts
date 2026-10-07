import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

let role = "STORE_STAFF";
const db: any = {
  store: { findFirst: jest.fn(async ({ where }: any) => (JSON.stringify(where).includes('"in":[]') ? null : { id: "s1", orgId: "o1" })) },
  membership: { findMany: jest.fn(async () => [{ orgId: "o1", role, storeIds: ["s1"] }]) },
};
const settings = { updateSettings: jest.fn(async () => ({})), getSettings: jest.fn(async () => ({})) };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../store-settings.service", () => ({ StoreSettingsService: settings }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = "u1";
    req.compte = { id: "u1", isSuperOwner: false };
    next();
  },
  checkOrgStatus: (_req: any, _res: any, next: any) => next(),
}));
import router from "../store-settings.routes";

const app = express();
app.use(express.json());
app.use("/api/store-settings", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || err.status || 500).json({ code: err.code }));

beforeEach(() => { jest.clearAllMocks(); role = "STORE_STAFF"; });

describe("réglages de boutique : STAFF en lecture seule", () => {
  it("refuse à un STAFF de changer identité légale, TVA ou devise", async () => {
    const res = await request(app).put("/api/store-settings/s1").send({ vatNumber: "BE0123456789", currency: "USD" });
    expect(res.status).toBe(403);
    expect(settings.updateSettings).not.toHaveBeenCalled();
  });

  it("laisse un STAFF lire les réglages", async () => {
    expect((await request(app).get("/api/store-settings/s1")).status).toBe(200);
  });

  it("accepte le même changement d'un gérant", async () => {
    role = "STORE_MANAGER";
    const res = await request(app).put("/api/store-settings/s1").send({ vatNumber: "BE0123456789" });
    expect(res.status).toBe(200);
    expect(settings.updateSettings).toHaveBeenCalledTimes(1);
  });
});
