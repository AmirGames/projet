import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn() },
  supportTicket: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  supportMessage: { create: jest.fn(), findMany: jest.fn() },
};
const journaliser: any = jest.fn(async () => undefined);
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    req.compte = { id: req.userId, isSuperOwner: false, isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
import router from "../zupdrive-support.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/support", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const bob = { "x-user": "user-bob" };
const equipe = { "x-user": "agent-1", "x-equipe": "1" };
const ligne = (extra: any = {}) => ({
  id: "t1", ticketNumber: "SUP-1", category: "AUTRE", priority: "MOYENNE", subject: "Sujet", description: "Description",
  status: "OUVERT", reporterId: "user-alice", reporterType: "PASSAGER", createdAt: new Date(), updatedAt: new Date(), ...extra,
});
const ticketValide = { category: "AUTRE", priority: "MOYENNE", subject: "Un sujet", description: "Une description assez longue" };

beforeEach(() => {
  jest.clearAllMocks();
  db.chauffeurDrive.findUnique.mockImplementation(async ({ where }: any) => (where.userId === "user-chauffeur" ? { id: "c1" } : null));
  // Le ticket t1 appartient à Alice : toute requête filtrée sur un autre déclarant ne le trouve pas.
  db.supportTicket.findFirst.mockImplementation(async ({ where }: any) => (where.id === "t1" && where.reporterId === "user-alice" ? ligne() : null));
  db.supportTicket.findUnique.mockResolvedValue(ligne());
  db.supportTicket.create.mockImplementation(async ({ data }: any) => ({ ...ligne(), ...data }));
  db.supportTicket.update.mockResolvedValue(ligne());
  db.supportTicket.findMany.mockResolvedValue([]);
  db.supportTicket.count.mockResolvedValue(0);
  db.supportMessage.findMany.mockResolvedValue([]);
  db.supportMessage.create.mockImplementation(async ({ data }: any) => ({ id: "m1", createdAt: new Date(), ...data }));
});

describe("tickets : authentification obligatoire", () => {
  it.each([
    ["post", "/api/zupdrive/support/tickets"],
    ["get", "/api/zupdrive/support/tickets"],
    ["get", "/api/zupdrive/support/tickets/t1"],
    ["post", "/api/zupdrive/support/tickets/t1/messages"],
  ] as const)("%s %s sans jeton : 401", async (m, url) => {
    const res = await (request(app) as any)[m](url).send({ ...ticketValide, message: "Bonjour" });
    expect(res.status).toBe(401);
    expect(db.supportTicket.create).not.toHaveBeenCalled();
    expect(db.supportMessage.create).not.toHaveBeenCalled();
  });
});

describe("tickets : l'identité vient du jeton, jamais du corps", () => {
  it("le déclarant est le compte du jeton, même si le corps en désigne un autre", async () => {
    const res = await request(app).post("/api/zupdrive/support/tickets").set(alice).send({ ...ticketValide, reporterId: "user-bob", reporterType: "ADMIN" });
    expect(res.status).toBe(201);
    expect(db.supportTicket.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reporterId: "user-alice", reporterType: "PASSAGER" }) });
  });

  it("un compte avec dossier chauffeur ouvre un ticket de type CHAUFFEUR", async () => {
    await request(app).post("/api/zupdrive/support/tickets").set({ "x-user": "user-chauffeur" }).send(ticketValide);
    expect(db.supportTicket.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reporterId: "user-chauffeur", reporterType: "CHAUFFEUR" }) });
  });

  it("Bob ne voit que ses tickets", async () => {
    await request(app).get("/api/zupdrive/support/tickets").set(bob);
    expect(db.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { reporterId: "user-bob" } }));
  });

  it("Alice lit son ticket ; Bob reçoit 404 pour le même identifiant", async () => {
    expect((await request(app).get("/api/zupdrive/support/tickets/t1").set(alice)).status).toBe(200);
    const res = await request(app).get("/api/zupdrive/support/tickets/t1").set(bob);
    expect(res.status).toBe(404);
    expect(db.supportMessage.findMany).toHaveBeenCalledTimes(1);
  });

  it("Alice écrit sous son nom, avec le type de son ticket (authorId du corps ignoré)", async () => {
    const res = await request(app).post("/api/zupdrive/support/tickets/t1/messages").set(alice).send({ message: "Bonjour", authorId: "agent-1", authorType: "AGENT" });
    expect(res.status).toBe(201);
    expect(db.supportMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ticketId: "t1", authorId: "user-alice", authorType: "PASSAGER" }) });
  });

  it("Bob ne peut pas écrire dans le ticket d'Alice : 404, rien d'écrit", async () => {
    const res = await request(app).post("/api/zupdrive/support/tickets/t1/messages").set(bob).send({ message: "Intrus" });
    expect(res.status).toBe(404);
    expect(db.supportMessage.create).not.toHaveBeenCalled();
  });

  it("une pièce jointe doit être en https", async () => {
    const res = await request(app).post("/api/zupdrive/support/tickets/t1/messages").set(alice).send({ message: "Voir", attachmentUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect((await request(app).post("/api/zupdrive/support/tickets/t1/messages").set(alice).send({ message: "Voir", attachmentUrl: "http://exemple.test/a.png" })).status).toBe(400);
    expect(db.supportMessage.create).not.toHaveBeenCalled();
  });
});

describe("administration du support : équipe uniquement, journalisée", () => {
  it("un compte ordinaire ne clôt pas de ticket", async () => {
    const res = await request(app).post("/api/zupdrive/support/admin/tickets/t1/close").set(alice).send({ resolution: "Résolu par moi-même" });
    expect(res.status).toBe(403);
    expect(db.supportTicket.update).not.toHaveBeenCalled();
    expect(journaliser).not.toHaveBeenCalled();
  });

  it("la réponse de l'équipe porte l'identité du jeton et le type AGENT", async () => {
    const res = await request(app).post("/api/zupdrive/support/admin/tickets/t1/messages").set(equipe).send({ message: "Nous revenons vers vous" });
    expect(res.status).toBe(201);
    expect(db.supportMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({ authorId: "agent-1", authorType: "AGENT" }) });
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_SUPPORT_REPLY", "t1", { messageId: "m1" });
  });

  it.each([
    ["post", "/admin/tickets/t1/assign", { agentId: "agent-2" }, "ZUPDRIVE_SUPPORT_ASSIGN", { agentId: "agent-2" }],
    ["patch", "/admin/tickets/t1/status", { status: "EN_COURS" }, "ZUPDRIVE_SUPPORT_SET_STATUS", { apres: "EN_COURS", resolution: undefined }],
    ["post", "/admin/tickets/t1/escalate", { newPriority: "HAUTE" }, "ZUPDRIVE_SUPPORT_ESCALATE", { apres: "HAUTE" }],
    ["post", "/admin/tickets/t1/close", { resolution: "Problème corrigé" }, "ZUPDRIVE_SUPPORT_CLOSE", { apres: "FERME", resolution: "Problème corrigé" }],
  ] as const)("%s %s est journalisé", async (m, url, corps, action, details) => {
    const res = await (request(app) as any)[m](`/api/zupdrive/support${url}`).set(equipe).send(corps);
    expect(res.status).toBe(200);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), action, "t1", details);
  });
});
