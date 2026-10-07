import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = { notificationLog: { findUnique: jest.fn(), updateMany: jest.fn() } };
let secret: string | undefined;
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET: secret }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
import { signatureValide, signerAccuse, webhookStatutNotification } from "../zupdrive-notifications-webhook";

const app = express();
app.post("/webhooks/status", express.raw({ type: "application/json" }), webhookStatutNotification);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const SECRET = "s".repeat(40);
const corps = JSON.stringify({ notificationLogId: "n1", status: "SENT" });
const maintenant = () => String(Math.floor(Date.now() / 1000));

function envoyer(brut: string, entetes: Record<string, string>) {
  return request(app).post("/webhooks/status").set("content-type", "application/json").set(entetes).send(brut);
}
function signe(brut: string, ts = maintenant()) {
  return { "x-zupdrive-timestamp": ts, "x-zupdrive-signature": signerAccuse(SECRET, ts, brut) };
}

beforeEach(() => {
  jest.clearAllMocks();
  secret = SECRET;
  db.notificationLog.findUnique.mockResolvedValue({ status: "PENDING" });
  db.notificationLog.updateMany.mockResolvedValue({ count: 1 });
});

describe("webhook d'accusés de notification ZupDrive", () => {
  it("sans secret configuré : 503, rien n'est lu", async () => {
    secret = undefined;
    const res = await envoyer(corps, signe(corps));
    expect(res.status).toBe(503);
    expect(db.notificationLog.findUnique).not.toHaveBeenCalled();
  });

  it("sans signature : 401", async () => {
    const res = await envoyer(corps, {});
    expect(res.status).toBe(401);
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });

  it("signature d'un autre corps : 401 (le corps n'est pas de confiance)", async () => {
    const res = await envoyer(corps, signe(JSON.stringify({ notificationLogId: "n1", status: "FAILED" })));
    expect(res.status).toBe(401);
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });

  it("mauvais secret : 401", async () => {
    const ts = maintenant();
    const res = await envoyer(corps, { "x-zupdrive-timestamp": ts, "x-zupdrive-signature": signerAccuse("x".repeat(40), ts, corps) });
    expect(res.status).toBe(401);
  });

  it("horodatage trop ancien (rejeu) : 401", async () => {
    const res = await envoyer(corps, signe(corps, String(Math.floor(Date.now() / 1000) - 3600)));
    expect(res.status).toBe(401);
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });

  it("signature de longueur anormale : 401 sans exception", () => {
    expect(signatureValide(SECRET, maintenant(), "abcd", corps)).toBe(false);
    expect(signatureValide(SECRET, maintenant(), "zz", corps)).toBe(false);
  });

  it("accusé signé : le statut avance", async () => {
    const res = await envoyer(corps, signe(corps));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, applied: true });
    expect(db.notificationLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "n1", status: "PENDING" }, data: expect.objectContaining({ status: "SENT" }) }));
  });

  it("le même accusé reçu deux fois n'a qu'un effet", async () => {
    await envoyer(corps, signe(corps));
    db.notificationLog.findUnique.mockResolvedValue({ status: "SENT" });
    const res = await envoyer(corps, signe(corps));
    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(false);
    expect(db.notificationLog.updateMany).toHaveBeenCalledTimes(1);
  });

  it("un SENT tardif ne remplace pas un BOUNCED", async () => {
    db.notificationLog.findUnique.mockResolvedValue({ status: "BOUNCED" });
    const res = await envoyer(corps, signe(corps));
    expect(res.body.applied).toBe(false);
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });

  it("notification inconnue : 404 ; corps invalide mais signé : 400", async () => {
    db.notificationLog.findUnique.mockResolvedValue(null);
    expect((await envoyer(corps, signe(corps))).status).toBe(404);
    const invalide = JSON.stringify({ status: "SENT" });
    expect((await envoyer(invalide, signe(invalide))).status).toBe(400);
  });
});
