import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

/**
 * « Chacun chez soi » : un membre de l'organisation A ne lit, n'écrit ni ne
 * supprime aucun ticket de l'organisation B, en changeant seulement un identifiant.
 */

const TICKETS: Record<string, { id: string; orgId: string; title: string; status: string }> = {
  "t-a": { id: "t-a", orgId: "org-a", title: "Chez A", status: "OPEN" },
  "t-b": { id: "t-b", orgId: "org-b", title: "Chez B", status: "OPEN" },
};
const db: any = {
  membership: {
    // alice est membre de l'organisation A seulement.
    findFirst: jest.fn(async ({ where }: any) => (where.userId === "alice" && where.orgId === "org-a" ? { id: "m-1" } : null)),
  },
  merchantTicket: {
    findUnique: jest.fn(async ({ where }: any) => TICKETS[where.id] ?? null),
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: any) => ({ id: "t-new", ...data })),
    delete: jest.fn(async () => ({})),
  },
};
const service = {
  list: jest.fn(async (_id: string) => []),
  add: jest.fn(async (_donnees: any) => ({ id: "m-new" })),
  changerEtat: jest.fn(async (_id: string, _etat: string) => ({ ticket: { id: "t-a", status: "CLOSED", orgId: "org-a" } })),
  notifierOuvertureDeTicket: jest.fn(async () => undefined),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../ticket-message.service", () => ({ TicketMessageService: service }));
jest.mock("../../realtime/socket", () => ({ emitOrgEvent: jest.fn() }));
jest.mock("../../webhooks/webhook.service", () => ({ emitWebhook: jest.fn() }));
jest.mock("../../merchants/merchant-approval.service", () => ({ MerchantApprovalService: { etat: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const entete: string | undefined = req.headers.authorization;
    if (!entete?.startsWith("Bearer ")) return res.status(401).json({ code: "MISSING_AUTH" });
    req.userId = entete.slice(7);
    next();
  },
}));

import supportRouter from "../support.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/support", supportRouter);
app.use(errorHandler);

const alice = (r: request.Test) => r.set("Authorization", "Bearer alice");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("support : un ticket n'est accessible qu'aux membres de son organisation", () => {
  it("lit et répond au ticket de sa propre organisation", async () => {
    expect((await alice(request(app).get("/api/support/tickets/t-a/messages"))).status).toBe(200);
    expect((await alice(request(app).post("/api/support/tickets/t-a/messages")).send({ body: "Bonjour" })).status).toBeLessThan(300);
  });

  it.each([
    ["lire le ticket", (r: any) => r.get("/api/support/tickets/t-b")],
    ["lire ses messages", (r: any) => r.get("/api/support/tickets/t-b/messages")],
    ["y répondre", (r: any) => r.post("/api/support/tickets/t-b/messages").send({ body: "Bonjour" })],
    ["changer son état", (r: any) => r.patch("/api/support/tickets/t-b/status").send({ status: "CLOSED" })],
    ["le supprimer", (r: any) => r.delete("/api/support/tickets/t-b")],
  ])("refuse de %s d'une autre organisation (403)", async (_nom, appel) => {
    const res = await alice(appel(request(app)));
    expect(res.status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
    expect(service.add).not.toHaveBeenCalled();
    expect(service.changerEtat).not.toHaveBeenCalled();
    expect(db.merchantTicket.delete).not.toHaveBeenCalled();
  });

  it("refuse d'ouvrir un ticket au nom d'une autre organisation", async () => {
    const res = await alice(request(app).post("/api/support/tickets")).send({
      orgId: "org-b",
      subject: "Sujet",
      description: "Description du problème",
    });
    expect(res.status).toBe(403);
    expect(db.merchantTicket.create).not.toHaveBeenCalled();
  });

  it("un ticket inconnu répond 404, sans rien dire du reste", async () => {
    expect((await alice(request(app).get("/api/support/tickets/inconnu"))).status).toBe(404);
  });

  it("sans session : 401, avant toute lecture", async () => {
    const res = await request(app).get("/api/support/tickets/t-a");
    expect(res.status).toBe(401);
    expect(db.merchantTicket.findUnique).not.toHaveBeenCalled();
  });
});
