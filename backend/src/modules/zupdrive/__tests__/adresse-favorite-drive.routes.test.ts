import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = { adresseFavoriteDrive: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../course-drive.service", () => ({ CourseDriveService: {} }));
jest.mock("../note-course-drive.service", () => ({ COMMENTAIRE_MAX: 500, NOTE_MAX: 5, NOTE_MIN: 1, NoteCourseDriveService: {} }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    next();
  },
}));
import router from "../adresse-favorite-drive.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/adresses", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const adresse = { adresse: "1 rue A, 75001 Paris", latitude: 48.86, longitude: 2.34, codePostal: "75001" };

beforeEach(() => {
  jest.clearAllMocks();
  db.adresseFavoriteDrive.findMany.mockResolvedValue([]);
  db.adresseFavoriteDrive.upsert.mockResolvedValue({ type: "DOMICILE", ...adresse });
  db.adresseFavoriteDrive.deleteMany.mockResolvedValue({ count: 1 });
});

describe("adresses favorites ZupDrive", () => {
  it("refuse sans jeton", async () => {
    expect((await request(app).get("/api/zupdrive/adresses")).status).toBe(401);
    expect((await request(app).put("/api/zupdrive/adresses/DOMICILE").send(adresse)).status).toBe(401);
    expect((await request(app).delete("/api/zupdrive/adresses/DOMICILE")).status).toBe(401);
  });

  it("GET ne lit que les adresses du compte du jeton", async () => {
    await request(app).get("/api/zupdrive/adresses").set(alice);
    expect(db.adresseFavoriteDrive.findMany.mock.calls[0][0].where).toEqual({ userId: "user-alice" });
  });

  it("PUT enregistre pour le compte du jeton, même si le corps ou le chemin désigne un autre compte", async () => {
    const res = await request(app).put("/api/zupdrive/adresses/DOMICILE").set(alice).send(adresse);
    expect(res.status).toBe(200);
    const appel = db.adresseFavoriteDrive.upsert.mock.calls[0][0];
    expect(appel.where).toEqual({ userId_type: { userId: "user-alice", type: "DOMICILE" } });
    expect(appel.create.userId).toBe("user-alice");
    // Un userId glissé dans le corps est refusé (corps strict), il ne peut rien désigner.
    const triche = await request(app).put("/api/zupdrive/adresses/DOMICILE").set(alice).send({ ...adresse, userId: "user-bob" });
    expect(triche.status).toBe(400);
    expect(db.adresseFavoriteDrive.upsert).toHaveBeenCalledTimes(1);
  });

  it("PUT refuse un type inconnu et une adresse sans coordonnées ni code postal", async () => {
    expect((await request(app).put("/api/zupdrive/adresses/AUTRE").set(alice).send(adresse)).status).toBe(400);
    expect((await request(app).put("/api/zupdrive/adresses/DOMICILE").set(alice).send({ adresse: "1 rue A" })).status).toBe(400);
    expect((await request(app).put("/api/zupdrive/adresses/DOMICILE").set(alice).send({ ...adresse, latitude: 120 })).status).toBe(400);
    expect(db.adresseFavoriteDrive.upsert).not.toHaveBeenCalled();
  });

  it("DELETE ne touche que le compte du jeton et reste sans erreur si l'adresse n'existe pas", async () => {
    db.adresseFavoriteDrive.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(app).delete("/api/zupdrive/adresses/TRAVAIL").set(alice);
    expect(res.status).toBe(200);
    expect(db.adresseFavoriteDrive.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-alice", type: "TRAVAIL" } });
  });
});
