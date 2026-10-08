import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const message = (o: any = {}) => ({ id: "m1", auteur: "PASSAGER", texte: "Bonjour", createdAt: new Date("2026-10-08T10:00:00Z"), ...o });
const db: any = {
  courseDrive: { findUnique: jest.fn() },
  messageCourseDrive: { findMany: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), count: jest.fn(), create: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../middleware/throttle", () => ({ limiterCadence: () => (_req: any, _res: any, next: any) => next() }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    next();
  },
}));
import router from "../chat-course-drive.routes";
import { ChatCourseDriveService, MESSAGES_MAX } from "../chat-course-drive.service";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/courses", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const COURSE = { id: "c1", statut: "EN_COURS", passagerId: "user-alice", chauffeurId: "chauffeur-1" };
const cle = "cle-1234567890";

beforeEach(() => {
  jest.clearAllMocks();
  db.courseDrive.findUnique.mockResolvedValue(COURSE);
  db.messageCourseDrive.findMany.mockResolvedValue([message()]);
  db.messageCourseDrive.findUnique.mockResolvedValue(null);
  db.messageCourseDrive.count.mockResolvedValue(0);
  db.messageCourseDrive.create.mockResolvedValue(message());
});

describe("chat côté passager (routes)", () => {
  it("refuse sans jeton", async () => {
    expect((await request(app).get("/api/zupdrive/courses/c1/messages")).status).toBe(401);
    expect((await request(app).post("/api/zupdrive/courses/c1/messages").send({ texte: "a", cleIdempotence: cle })).status).toBe(401);
  });

  it("une course d'un autre compte répond 404, en lecture comme en écriture", async () => {
    const bob = { "x-user": "user-bob" };
    expect((await request(app).get("/api/zupdrive/courses/c1/messages").set(bob)).status).toBe(404);
    expect((await request(app).post("/api/zupdrive/courses/c1/messages").set(bob).send({ texte: "salut", cleIdempotence: cle })).status).toBe(404);
    expect(db.messageCourseDrive.findMany).not.toHaveBeenCalled();
    expect(db.messageCourseDrive.create).not.toHaveBeenCalled();
  });

  it("envoie un message pour l'auteur PASSAGER du jeton, jamais un auteur fourni par le client", async () => {
    const res = await request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send({ texte: "  Bonjour  ", cleIdempotence: cle });
    expect(res.status).toBe(201);
    expect(db.messageCourseDrive.create.mock.calls[0][0].data).toEqual({ courseId: "c1", auteur: "PASSAGER", texte: "Bonjour", cleIdempotence: cle });
    const triche = await request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send({ texte: "x", cleIdempotence: cle, auteur: "CHAUFFEUR" });
    expect(triche.status).toBe(400);
  });

  it("refuse un texte vide, trop long, ou une clé invalide", async () => {
    const envoyer = (corps: any) => request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send(corps);
    expect((await envoyer({ texte: "   ", cleIdempotence: cle })).status).toBe(400);
    expect((await envoyer({ texte: "a".repeat(501), cleIdempotence: cle })).status).toBe(400);
    expect((await envoyer({ texte: "ok", cleIdempotence: "court" })).status).toBe(400);
    expect((await envoyer({ texte: "ok", cleIdempotence: "clé avec espaces!!" })).status).toBe(400);
    expect(db.messageCourseDrive.create).not.toHaveBeenCalled();
  });

  it("le chat est fermé hors d'un trajet en cours avec chauffeur", async () => {
    for (const statut of ["RECHERCHE", "TERMINEE", "ANNULEE", "SANS_CHAUFFEUR"]) {
      db.courseDrive.findUnique.mockResolvedValue({ ...COURSE, statut });
      const res = await request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send({ texte: "ok", cleIdempotence: cle });
      expect(res.status).toBe(409);
    }
    expect(db.messageCourseDrive.create).not.toHaveBeenCalled();
  });

  it("la lecture reste possible après la fin du trajet, pour le passager seulement", async () => {
    db.courseDrive.findUnique.mockResolvedValue({ ...COURSE, statut: "TERMINEE" });
    const res = await request(app).get("/api/zupdrive/courses/c1/messages").set(alice);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("rejouer l'envoi (même clé) rend le même message sans en créer un second", async () => {
    db.messageCourseDrive.findUnique.mockResolvedValue(message());
    const res = await request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send({ texte: "Bonjour", cleIdempotence: cle });
    expect(res.status).toBe(201);
    expect(db.messageCourseDrive.create).not.toHaveBeenCalled();
  });

  it("limite le nombre de messages d'une course", async () => {
    db.messageCourseDrive.count.mockResolvedValue(MESSAGES_MAX);
    const res = await request(app).post("/api/zupdrive/courses/c1/messages").set(alice).send({ texte: "ok", cleIdempotence: cle });
    expect(res.status).toBe(429);
    expect(db.messageCourseDrive.create).not.toHaveBeenCalled();
  });

  it("la relecture accepte une date `depuis` et refuse une date invalide", async () => {
    expect((await request(app).get("/api/zupdrive/courses/c1/messages?depuis=2026-10-08T10:00:00Z").set(alice)).status).toBe(200);
    expect(db.messageCourseDrive.findMany.mock.calls[0][0].where.createdAt.gte).toEqual(new Date("2026-10-08T10:00:00Z"));
    expect((await request(app).get("/api/zupdrive/courses/c1/messages?depuis=hier").set(alice)).status).toBe(400);
  });
});

describe("chat côté chauffeur (service)", () => {
  const chauffeur = { auteur: "CHAUFFEUR" as const, chauffeurId: "chauffeur-1" };

  it("le chauffeur de la course écrit en tant que CHAUFFEUR ; un autre chauffeur est refusé", async () => {
    await ChatCourseDriveService.envoyer(chauffeur, "c1", "J'arrive", cle);
    expect(db.messageCourseDrive.create.mock.calls[0][0].data.auteur).toBe("CHAUFFEUR");
    await expect(ChatCourseDriveService.envoyer({ auteur: "CHAUFFEUR", chauffeurId: "chauffeur-2" }, "c1", "x", cle)).rejects.toMatchObject({ code: "RIDE_NOT_FOUND" });
    await expect(ChatCourseDriveService.lister({ auteur: "CHAUFFEUR", chauffeurId: "chauffeur-2" }, "c1")).rejects.toMatchObject({ code: "RIDE_NOT_FOUND" });
  });

  it("les clés d'idempotence des deux côtés sont indépendantes", async () => {
    await ChatCourseDriveService.envoyer(chauffeur, "c1", "a", cle);
    expect(db.messageCourseDrive.findUnique.mock.calls[0][0].where).toEqual({ courseId_auteur_cleIdempotence: { courseId: "c1", auteur: "CHAUFFEUR", cleIdempotence: cle } });
  });
});
