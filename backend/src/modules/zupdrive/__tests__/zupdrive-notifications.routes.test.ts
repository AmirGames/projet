import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn() },
  notificationAlert: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  notificationLog: { findUnique: jest.fn(), updateMany: jest.fn() },
  notificationTemplate: { upsert: jest.fn() },
};
const journaliser: any = jest.fn(async () => undefined);
const sections: Array<string | undefined> = [];
const upsertTemplate: any = jest.fn();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../../auth/auth.middleware", () => ({
  // « x-user » donne l'identité, « x-equipe » en fait un membre de l'équipe ZupDrive.
  authMiddleware: (req: any, res: any, next: any) => {
    const user = req.header("x-user");
    if (!user) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = user;
    req.compte = { id: user, isSuperOwner: false, isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: (_routeur: string, _plateforme: string, section?: string) => {
    sections.push(section);
    return (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" }));
  },
}));
jest.mock("../zupdrive-notifications.service", () => {
  const reel: any = jest.requireActual("../zupdrive-notifications.service");
  reel.ZupDriveNotificationsService.upsertTemplate = upsertTemplate;
  return reel;
});
import router from "../zupdrive-notifications.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/notifications", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const equipe = { "x-user": "user-equipe", "x-equipe": "1" };

beforeEach(() => {
  jest.clearAllMocks();
  db.chauffeurDrive.findUnique.mockImplementation(async ({ where }: any) => (where.userId === "user-alice" ? { id: "chauffeur-alice" } : null));
  db.notificationAlert.findMany.mockResolvedValue([]);
  db.notificationAlert.updateMany.mockResolvedValue({ count: 1 });
});

describe("alertes d'un chauffeur : jeton obligatoire, chacun chez soi", () => {
  it.each([
    ["get", "/api/zupdrive/notifications/alerts/unread"],
    ["patch", "/api/zupdrive/notifications/alerts/read-all"],
    ["patch", "/api/zupdrive/notifications/alerts/a1/read"],
  ] as const)("%s %s sans jeton : 401, rien n'est lu ni écrit", async (methode, url) => {
    const res = await (request(app) as any)[methode](url);
    expect(res.status).toBe(401);
    expect(db.notificationAlert.findMany).not.toHaveBeenCalled();
    expect(db.notificationAlert.updateMany).not.toHaveBeenCalled();
  });

  it("les alertes non lues sont celles du chauffeur du jeton, pas du ?driverId= de la requête", async () => {
    const res = await request(app).get("/api/zupdrive/notifications/alerts/unread?driverId=chauffeur-bob").set(alice);
    expect(res.status).toBe(200);
    expect(db.notificationAlert.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { chauffeurId: "chauffeur-alice", read: false } }));
  });

  it("« tout marquer lu » ne touche que les alertes du chauffeur du jeton, même avec un driverId dans le corps", async () => {
    const res = await request(app).patch("/api/zupdrive/notifications/alerts/read-all").set(alice).send({ driverId: "chauffeur-bob" });
    expect(res.status).toBe(200);
    expect(db.notificationAlert.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { chauffeurId: "chauffeur-alice", read: false } }));
  });

  it("marquer lue l'alerte d'un autre chauffeur : 404, rien n'est modifié", async () => {
    db.notificationAlert.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).patch("/api/zupdrive/notifications/alerts/alerte-de-bob/read").set(alice);
    expect(res.status).toBe(404);
    expect(db.notificationAlert.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "alerte-de-bob", chauffeurId: "chauffeur-alice" } }));
  });

  it("un compte sans dossier chauffeur est refusé", async () => {
    const res = await request(app).get("/api/zupdrive/notifications/alerts/unread").set({ "x-user": "user-passager" });
    expect(res.status).toBe(403);
    expect(db.notificationAlert.findMany).not.toHaveBeenCalled();
  });
});

describe("routes d'administration : équipe uniquement, journalisées", () => {
  it("la section demandée est « courses-drive »", () => {
    expect(sections).toContain("courses-drive");
  });

  it("un chauffeur ne crée pas de template", async () => {
    const res = await request(app).post("/api/zupdrive/notifications/admin/templates").set(alice).send({});
    expect(res.status).toBe(403);
    expect(upsertTemplate).not.toHaveBeenCalled();
  });

  it("l'équipe crée un template : l'action est journalisée", async () => {
    upsertTemplate.mockResolvedValue({ key: "DOC_EXPIRY", type: "EMAIL", active: true });
    const res = await request(app)
      .post("/api/zupdrive/notifications/admin/templates")
      .set(equipe)
      .send({ key: "DOC_EXPIRY", name: "Expiration", type: "EMAIL", body: "Bonjour {{nom}}, votre pièce expire", variables: ["nom"], active: true });
    expect(res.status).toBe(201);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_UPSERT_NOTIFICATION_TEMPLATE", "DOC_EXPIRY", { type: "EMAIL", active: true });
  });

  it("la création d'une alerte est journalisée", async () => {
    db.notificationAlert.create.mockResolvedValue({ id: "al1", chauffeurId: "c1", type: "CUSTOM", severity: "INFO", title: "Titre", message: "Un message", read: false, createdAt: new Date() });
    const res = await request(app)
      .post("/api/zupdrive/notifications/admin/alerts")
      .set(equipe)
      .send({ driverId: "c1", type: "CUSTOM", severity: "INFO", title: "Titre long", message: "Un message assez long" });
    expect(res.status).toBe(201);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_CREATE_ALERT", "al1", { chauffeurId: "c1", type: "CUSTOM", severity: "INFO" });
  });

  it("le webhook n'est plus une route du routeur JSON", async () => {
    const res = await request(app).post("/api/zupdrive/notifications/webhooks/status").send({ notificationLogId: "n1", status: "SENT" });
    expect(res.status).toBe(404);
    expect(db.notificationLog.updateMany).not.toHaveBeenCalled();
  });
});
