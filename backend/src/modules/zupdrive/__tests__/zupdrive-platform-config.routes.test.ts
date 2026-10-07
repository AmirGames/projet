import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const journaliser: any = jest.fn(async () => undefined);
const service: any = {
  upsertCommissionConfig: jest.fn(async () => ({ id: "cm1" })),
  upsertRegionalConfig: jest.fn(async () => ({ id: "rg1" })),
  upsertPricingRule: jest.fn(async () => ({ id: "pr1" })),
  setSetting: jest.fn(async () => ({ id: "st1" })),
};
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../zupdrive-platform-config.service", () => ({ ZupDrivePlatformConfigService: service }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    req.compte = { id: req.userId, isSuperOwner: req.header("x-superowner") === "1", isSystemAdmin: true, acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSuperOwner ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
import router from "../zupdrive-platform-config.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/admin/config", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const owner = { "x-user": "owner", "x-superowner": "1" };
const ecritures: Array<[string, any, string, string]> = [
  ["/commissions", { name: "Standard", type: "PERCENTAGE", value: 20, appliesTo: "PLATEFORME", description: "Commission standard", active: true }, "ZUPDRIVE_UPSERT_COMMISSION_CONFIG", "cm1"],
  ["/regions", { region: "BRUXELLES", minPrice: 500, baseSurgeMultiplier: 1, maxSurgeMultiplier: 2, peakHours: "09:00-12:00", peakSurgeMultiplier: 1.5, active: true }, "ZUPDRIVE_UPSERT_REGIONAL_CONFIG", "rg1"],
  ["/pricing-rules", { name: "Base", type: "DISTANCE", basePricePerKm: 100, basePricePerMin: 20, minPrice: 500, description: "Règle de base", active: true }, "ZUPDRIVE_UPSERT_PRICING_RULE", "pr1"],
  ["/settings", { key: "support.email", value: "secret-interne", type: "STRING", description: "Adresse du support" }, "ZUPDRIVE_SET_PLATFORM_SETTING", "st1"],
];

beforeEach(() => { jest.clearAllMocks(); });

describe("configuration de la plateforme ZupDrive : superowner, journalisée", () => {
  it.each(ecritures)("%s : refusé sans jeton et à un membre sans droit", async (url, corps) => {
    expect((await request(app).post(`/api/zupdrive/admin/config${url}`).send(corps)).status).toBe(401);
    expect((await request(app).post(`/api/zupdrive/admin/config${url}`).set({ "x-user": "membre" }).send(corps)).status).toBe(403);
    expect(journaliser).not.toHaveBeenCalled();
  });

  it.each(ecritures)("%s : écriture journalisée", async (url, corps, action, cible) => {
    const res = await request(app).post(`/api/zupdrive/admin/config${url}`).set(owner).send(corps);
    expect(res.status).toBe(201);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), action, cible, expect.anything());
  });

  it("la valeur d'un paramètre n'entre pas dans le journal", async () => {
    await request(app).post("/api/zupdrive/admin/config/settings").set(owner).send(ecritures[3][1]);
    expect(JSON.stringify(journaliser.mock.calls.map((c: any[]) => c.slice(1)))).not.toContain("secret-interne");
  });
});
