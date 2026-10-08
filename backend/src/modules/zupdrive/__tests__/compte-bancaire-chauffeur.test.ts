import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn() },
  compteBancaireChauffeurDrive: { findUnique: jest.fn(), upsert: jest.fn() },
  driverPayoutDrive: { updateMany: jest.fn() },
};
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const user = req.header("x-user");
    if (!user) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = user;
    next();
  },
}));
// Les autres services montés par chauffeur.routes n'interviennent pas ici.
jest.mock("../chauffeur-onboarding.service", () => ({ ChauffeurOnboardingService: {}, REGIONS: ["BRUXELLES"], TYPES_PIECE: [], libelleDeLaPiece: (t: string) => t }));
jest.mock("../course-drive.service", () => ({ CourseDriveService: {} }));
jest.mock("../societe-drive.service", () => ({ SocieteDriveService: {} }));
jest.mock("../zupdrive-driver-management.service", () => ({ ZupDriveDriverManagementService: {} }));
jest.mock("../chat-course-drive.service", () => ({ ChatCourseDriveService: {} }));
jest.mock("../chat-course-drive.routes", () => ({ lectureSchema: {}, messageSchema: {} }));
jest.mock("../note-course-drive.service", () => ({ COMMENTAIRE_MAX: 1, NOTE_MAX: 5, NOTE_MIN: 1, NoteCourseDriveService: {} }));
jest.mock("../../files/file-upload.middleware", () => ({ uploadMiddleware: { single: () => (_r: any, _s: any, next: any) => next() } }));
jest.mock("../../files/fichiers-prives.service", () => ({ presenter: (u: string) => u }));

import { CompteBancaireChauffeurService } from "../compte-bancaire-chauffeur.service";
import router from "../chauffeur.routes";

const IBAN = "BE68 5390 0754 7034";
const IBAN_NORMALISE = "BE68539007547034";

beforeEach(() => {
  jest.clearAllMocks();
  db.compteBancaireChauffeurDrive.upsert.mockResolvedValue({});
  db.driverPayoutDrive.updateMany.mockResolvedValue({ count: 0 });
});

describe("CompteBancaireChauffeurService", () => {
  it("enregistre l'IBAN normalisé, rend les 4 derniers caractères seulement et ne logge jamais l'IBAN", async () => {
    const vue = await CompteBancaireChauffeurService.enregistrer("ch-1", { iban: IBAN, bic: " gebabebb ", accountHolder: "  Sam Dupont " });

    expect(db.compteBancaireChauffeurDrive.upsert).toHaveBeenCalledWith({
      where: { chauffeurId: "ch-1" },
      create: { chauffeurId: "ch-1", iban: IBAN_NORMALISE, bic: "GEBABEBB", accountHolder: "Sam Dupont" },
      update: { iban: IBAN_NORMALISE, bic: "GEBABEBB", accountHolder: "Sam Dupont" },
    });
    expect(vue).toEqual({ ibanFin: "7034", titulaire: "Sam Dupont", valide: true });
    const journaux = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(journaux).not.toContain(IBAN_NORMALISE);
    expect(journaux).not.toContain("5390");
  });

  it("IBAN invalide (clé de contrôle fausse) : 400 INVALID_IBAN, rien n'est écrit", async () => {
    await expect(CompteBancaireChauffeurService.enregistrer("ch-1", { iban: "BE00 0000 0000 0000", accountHolder: "Sam" })).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_IBAN",
    });
    expect(db.compteBancaireChauffeurDrive.upsert).not.toHaveBeenCalled();
    expect(db.driverPayoutDrive.updateMany).not.toHaveBeenCalled();
  });

  it("les versements en attente, hors lot et sans copie, reçoivent l'IBAN ; jamais un lot déjà soumis", async () => {
    await CompteBancaireChauffeurService.enregistrer("ch-1", { iban: IBAN, accountHolder: "Sam" });
    expect(db.driverPayoutDrive.updateMany).toHaveBeenCalledWith({
      where: { chauffeurId: "ch-1", status: "PENDING", batchId: null, ibanSnapshot: null },
      data: { ibanSnapshot: IBAN_NORMALISE },
    });
  });

  it("lire : masqué ; sans compte : null", async () => {
    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce({ iban: IBAN_NORMALISE, accountHolder: "Sam", bic: "GEBABEBB" });
    const vue = await CompteBancaireChauffeurService.lire("ch-1");
    expect(vue).toEqual({ ibanFin: "7034", titulaire: "Sam", valide: true });
    expect(JSON.stringify(vue)).not.toContain("BE68");

    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce(null);
    await expect(CompteBancaireChauffeurService.lire("ch-1")).resolves.toBeNull();
  });

  it("ibanPourVersement : l'IBAN normalisé s'il est valide, sinon null (absent ou invalide)", async () => {
    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce({ iban: IBAN });
    await expect(CompteBancaireChauffeurService.ibanPourVersement("ch-1")).resolves.toBe(IBAN_NORMALISE);
    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce(null);
    await expect(CompteBancaireChauffeurService.ibanPourVersement("ch-1")).resolves.toBeNull();
    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce({ iban: "BE00 0000 0000 0000" });
    await expect(CompteBancaireChauffeurService.ibanPourVersement("ch-1")).resolves.toBeNull();
  });
});

describe("routes /api/zupdrive/chauffeur/me/bank-account", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/zupdrive/chauffeur", router);
  app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code })
  );
  const alice = { "x-user": "user-alice" };

  beforeEach(() => {
    // Chacun chez soi : le chauffeur est toujours celui de la session.
    db.chauffeurDrive.findUnique.mockImplementation(async ({ where }: any) => (where.userId === "user-alice" ? { id: "chauffeur-alice" } : null));
  });

  it.each([["get"], ["put"]] as const)("%s sans jeton : 401, rien n'est lu ni écrit", async (methode) => {
    const res = await request(app)[methode]("/api/zupdrive/chauffeur/me/bank-account").send({ iban: IBAN, accountHolder: "Sam" });
    expect(res.status).toBe(401);
    expect(db.compteBancaireChauffeurDrive.upsert).not.toHaveBeenCalled();
    expect(db.compteBancaireChauffeurDrive.findUnique).not.toHaveBeenCalled();
  });

  it("PUT enregistre sur le chauffeur de la session et ne renvoie que la fin de l'IBAN", async () => {
    const res = await request(app).put("/api/zupdrive/chauffeur/me/bank-account").set(alice).send({ iban: IBAN, accountHolder: "Sam Dupont" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ibanFin: "7034", titulaire: "Sam Dupont", valide: true } });
    expect(db.compteBancaireChauffeurDrive.upsert.mock.calls[0][0].where).toEqual({ chauffeurId: "chauffeur-alice" });
    expect(JSON.stringify(res.body)).not.toContain("BE68");
  });

  it("PUT ne prend aucun chauffeurId du corps (champ inconnu refusé) ni IBAN invalide", async () => {
    const inconnu = await request(app).put("/api/zupdrive/chauffeur/me/bank-account").set(alice).send({ iban: IBAN, accountHolder: "Sam", chauffeurId: "chauffeur-bob" });
    expect(inconnu.status).toBe(400);
    const invalide = await request(app).put("/api/zupdrive/chauffeur/me/bank-account").set(alice).send({ iban: "BE00 0000 0000 0000", accountHolder: "Sam" });
    expect(invalide.status).toBe(400);
    expect(invalide.body.code).toBe("INVALID_IBAN");
    expect(db.compteBancaireChauffeurDrive.upsert).not.toHaveBeenCalled();
  });

  it("compte sans dossier chauffeur : 404", async () => {
    const res = await request(app).get("/api/zupdrive/chauffeur/me/bank-account").set({ "x-user": "user-sans-dossier" });
    expect(res.status).toBe(404);
  });

  it("GET : le compte masqué, ou null", async () => {
    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce({ iban: IBAN_NORMALISE, accountHolder: "Sam" });
    const res = await request(app).get("/api/zupdrive/chauffeur/me/bank-account").set(alice);
    expect(res.body.data).toEqual({ ibanFin: "7034", titulaire: "Sam", valide: true });
    expect(JSON.stringify(res.body)).not.toContain(IBAN_NORMALISE);

    db.compteBancaireChauffeurDrive.findUnique.mockResolvedValueOnce(null);
    expect((await request(app).get("/api/zupdrive/chauffeur/me/bank-account").set(alice)).body.data).toBeNull();
  });
});
