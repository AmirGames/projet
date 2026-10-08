import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const stats: any = { getDriverStats: jest.fn(async () => ({ id: "chauffeur-alice", name: "Alice" })), getDriverInfractions: jest.fn(async () => [{ id: "i1" }]) };
const course: any = { chauffeurDuCompte: jest.fn() };
jest.mock("../../../services/db", () => ({ db: {} }));
jest.mock("../../../config/env", () => ({ getEnv: () => ({ JWT_SECRET: "a".repeat(40), API_URL: "https://api.test" }) }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../files/file-upload.middleware", () => ({ uploadMiddleware: { single: () => (_req: any, _res: any, next: any) => next() } }));
jest.mock("../../files/fichiers-prives.service", () => ({ presenter: (u: string) => u }));
jest.mock("../chauffeur-onboarding.service", () => ({ ChauffeurOnboardingService: {}, REGIONS: ["BRUXELLES"], TYPES_PIECE: ["permis"], libelleDeLaPiece: (t: string) => t }));
jest.mock("../societe-drive.service", () => ({ SocieteDriveService: {} }));
jest.mock("../note-course-drive.service", () => ({ COMMENTAIRE_MAX: 500, NOTE_MAX: 5, NOTE_MIN: 1, NoteCourseDriveService: {} }));
jest.mock("../course-drive.service", () => ({ CourseDriveService: course }));
jest.mock("../zupdrive-driver-management.service", () => ({ ZupDriveDriverManagementService: stats }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    next();
  },
}));
import router from "../chauffeur.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/chauffeur", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || 500).json({ code: err.code }));

const alice = { "x-user": "user-alice" };

beforeEach(() => {
  jest.clearAllMocks();
  course.chauffeurDuCompte.mockImplementation(async (userId: string) => {
    if (userId !== "user-alice") throw Object.assign(new Error("aucun dossier"), { statusCode: 404, code: "CHAUFFEUR_NOT_FOUND" });
    return { id: "chauffeur-alice" };
  });
});

describe("statistiques et infractions du chauffeur connecté", () => {
  it.each(["stats", "infractions"])("/me/%s : 401 sans jeton", async (chemin) => {
    expect((await request(app).get(`/api/zupdrive/chauffeur/me/${chemin}`)).status).toBe(401);
    expect(stats.getDriverStats).not.toHaveBeenCalled();
    expect(stats.getDriverInfractions).not.toHaveBeenCalled();
  });

  it("les statistiques sont celles du dossier du jeton, jamais d'un identifiant de la requête", async () => {
    const res = await request(app).get("/api/zupdrive/chauffeur/me/stats?driverId=chauffeur-bob&chauffeurId=chauffeur-bob").set(alice);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: "chauffeur-alice" });
    expect(stats.getDriverStats).toHaveBeenCalledWith("chauffeur-alice");
  });

  it("les infractions sont celles du dossier du jeton", async () => {
    const res = await request(app).get("/api/zupdrive/chauffeur/me/infractions?driverId=chauffeur-bob").set(alice);
    expect(res.status).toBe(200);
    expect(stats.getDriverInfractions).toHaveBeenCalledWith("chauffeur-alice");
  });

  it("un compte sans dossier chauffeur : 404, rien n'est lu", async () => {
    expect((await request(app).get("/api/zupdrive/chauffeur/me/stats").set({ "x-user": "user-passager" })).status).toBe(404);
    expect(stats.getDriverStats).not.toHaveBeenCalled();
  });
});
