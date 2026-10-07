import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  webhookEndpoint: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  webhookEvent: { create: jest.fn() },
  webhookDeliveryDrive: { create: jest.fn() },
  providerIntegration: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
};
const journaliser: any = jest.fn(async () => undefined);
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    req.compte = { id: req.userId, isSuperOwner: req.header("x-superowner") === "1", isSystemAdmin: true, acces: {} };
    next();
  },
}));
// Le vrai garde : sans section, seul le superowner passe (chemin hors de ROUTES.zupdrive).
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSuperOwner ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
import router from "../zupdrive-webhooks.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/webhooks", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const owner = { "x-user": "owner", "x-superowner": "1" };
const membre = { "x-user": "membre" };
/** Ce qui est écrit dans le journal (sans la requête Express, qui ne se sérialise pas). */
const detailsJournal = () => journaliser.mock.calls.map((c: any[]) => c.slice(1));
const HTTPS_PUBLIC = "https://93.184.216.34/hook";

const ligneEndpoint = (extra: any = {}) => ({
  id: "w1", url: HTTPS_PUBLIC, events: "[\"*\"]", active: true, secret: "zupenc:v1:chiffre", retryPolicy: "{}", createdAt: new Date(), updatedAt: new Date(), ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.webhookEndpoint.create.mockImplementation(async ({ data }: any) => ligneEndpoint({ ...data }));
  db.webhookEndpoint.findUnique.mockResolvedValue({ id: "w1" });
  db.webhookEndpoint.findMany.mockResolvedValue([ligneEndpoint()]);
  db.webhookEndpoint.update.mockResolvedValue({});
  db.webhookEndpoint.delete.mockResolvedValue({});
  db.providerIntegration.create.mockImplementation(async ({ data }: any) => ({ id: "p1", createdAt: new Date(), updatedAt: new Date(), ...data }));
  db.providerIntegration.findUnique.mockResolvedValue({ id: "p1" });
  db.providerIntegration.findMany.mockResolvedValue([]);
  db.providerIntegration.update.mockResolvedValue({});
});

describe("webhooks ZupDrive : superowner uniquement", () => {
  it.each([
    ["get", "/admin/endpoints"], ["post", "/admin/endpoints"], ["delete", "/admin/endpoints/w1"], ["post", "/admin/providers"], ["post", "/admin/events"],
  ] as const)("sans jeton, %s %s : 401", async (m, url) => {
    expect((await (request(app) as any)[m](`/api/zupdrive/webhooks${url}`).send({})).status).toBe(401);
  });

  it("un membre de l'équipe sans droit ne crée ni ne supprime d'endpoint", async () => {
    expect((await request(app).post("/api/zupdrive/webhooks/admin/endpoints").set(membre).send({ url: HTTPS_PUBLIC, events: ["*"] })).status).toBe(403);
    expect((await request(app).delete("/api/zupdrive/webhooks/admin/endpoints/w1").set(membre)).status).toBe(403);
    expect(db.webhookEndpoint.create).not.toHaveBeenCalled();
    expect(db.webhookEndpoint.delete).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });
});

describe("endpoints : destination publique, secret chiffré", () => {
  it.each(["http://93.184.216.34/hook", "https://10.0.0.5/hook", "https://169.254.169.254/latest/meta-data", "https://user:pw@93.184.216.34/hook"])(
    "refuse la destination %s",
    async (url) => {
      const res = await request(app).post("/api/zupdrive/webhooks/admin/endpoints").set(owner).send({ url, events: ["*"] });
      expect(res.status).toBe(400);
      expect(db.webhookEndpoint.create).not.toHaveBeenCalled();
    }
  );

  it("crée l'endpoint : secret aléatoire de 64 caractères hex rendu une fois, stocké chiffré", async () => {
    const res = await request(app).post("/api/zupdrive/webhooks/admin/endpoints").set(owner).send({ url: HTTPS_PUBLIC, events: ["*"] });
    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^[0-9a-f]{64}$/);
    const stocke = db.webhookEndpoint.create.mock.calls[0][0].data.secret;
    expect(stocke).toMatch(/^zupenc:v1:/);
    expect(stocke).not.toContain(res.body.secret);
  });

  it("le journal garde l'url et les événements, jamais le secret", async () => {
    const res = await request(app).post("/api/zupdrive/webhooks/admin/endpoints").set(owner).send({ url: HTTPS_PUBLIC, events: ["DRIVER_SUSPENDED"] });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_CREATE_WEBHOOK_ENDPOINT", "w1", { url: HTTPS_PUBLIC, events: ["DRIVER_SUSPENDED"] });
    expect(JSON.stringify(detailsJournal())).not.toContain(res.body.secret);
  });

  it("la liste ne rend jamais le secret", async () => {
    const res = await request(app).get("/api/zupdrive/webhooks/admin/endpoints").set(owner);
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("secret");
  });

  it("modifier vers une destination privée est refusé ; endpoint inconnu : 404", async () => {
    expect((await request(app).patch("/api/zupdrive/webhooks/admin/endpoints/w1").set(owner).send({ url: "https://192.168.1.10/x" })).status).toBe(400);
    db.webhookEndpoint.findUnique.mockResolvedValue(null);
    expect((await request(app).patch("/api/zupdrive/webhooks/admin/endpoints/zz").set(owner).send({ active: false })).status).toBe(404);
    expect((await request(app).delete("/api/zupdrive/webhooks/admin/endpoints/zz").set(owner)).status).toBe(404);
    expect(db.webhookEndpoint.update).not.toHaveBeenCalled();
    expect(db.webhookEndpoint.delete).not.toHaveBeenCalled();
  });

  it("modification, suppression et déclenchement sont journalisés", async () => {
    await request(app).patch("/api/zupdrive/webhooks/admin/endpoints/w1").set(owner).send({ active: false });
    await request(app).delete("/api/zupdrive/webhooks/admin/endpoints/w1").set(owner);
    db.webhookEvent.create.mockResolvedValue({ id: "e1", eventType: "X", resourceType: "DRIVER", resourceId: "c1", data: "{}", timestamp: new Date(), delivered: false, retryCount: 0, createdAt: new Date() });
    db.webhookEndpoint.findMany.mockResolvedValue([]);
    await request(app).post("/api/zupdrive/webhooks/admin/events").set(owner).send({ eventType: "X", resourceType: "DRIVER", resourceId: "c1", data: {} });
    const actions = journaliser.mock.calls.map((c: any[]) => c[1]);
    expect(actions).toEqual(["ZUPDRIVE_UPDATE_WEBHOOK_ENDPOINT", "ZUPDRIVE_DELETE_WEBHOOK_ENDPOINT", "ZUPDRIVE_TRIGGER_WEBHOOK_EVENT"]);
  });
});

describe("fournisseurs : clés chiffrées, jamais relues", () => {
  it("stocke les clés chiffrées, ne les renvoie ni ne les journalise", async () => {
    const res = await request(app)
      .post("/api/zupdrive/webhooks/admin/providers")
      .set(owner)
      .send({ provider: "SENDGRID", type: "EMAIL", apiKey: "SG.cle-secrete-123", webhookSigningKey: "signature-secrete" });
    expect(res.status).toBe(201);
    const data = db.providerIntegration.create.mock.calls[0][0].data;
    expect(data.apiKey).toMatch(/^zupenc:v1:/);
    expect(data.webhookSigningKey).toMatch(/^zupenc:v1:/);
    const sortie = JSON.stringify([res.body, detailsJournal()]);
    expect(sortie).not.toContain("SG.cle-secrete-123");
    expect(sortie).not.toContain("signature-secrete");
    expect(res.body).toMatchObject({ apiKeyConfigured: true, webhookSigningKeyConfigured: true });
  });

  it("la mise à jour chiffre la nouvelle clé et ne journalise que le fait qu'elle a changé", async () => {
    await request(app).patch("/api/zupdrive/webhooks/admin/providers/p1").set(owner).send({ apiKey: "nouvelle-cle-secrete" });
    expect(db.providerIntegration.update.mock.calls[0][0].data.apiKey).toMatch(/^zupenc:v1:/);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_UPDATE_PROVIDER_INTEGRATION", "p1", expect.objectContaining({ apiKeyChangee: true }));
    expect(JSON.stringify(detailsJournal())).not.toContain("nouvelle-cle-secrete");
  });
});
