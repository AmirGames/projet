/**
 * Tests de caractérisation de /api/zupdrive/admin (dossiers chauffeurs et
 * sociétés, tarifs, courses, métriques). Ils figent accès, validations, formes
 * de réponse, requêtes Prisma et entrées du journal avant l'extraction de la
 * logique vers un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  chauffeurDrive: model("findMany", "count", "groupBy"),
  societeDrive: model("findMany", "count", "groupBy"),
  courseDrive: model("findMany", "count"),
  user: model("findUnique"),
  systemAuditLog: model("create"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers.authorization?.replace("Bearer ", "");
    if (!["equipe", "client"].includes(who)) return res.status(401).json({});
    req.userId = who;
    req.compte = { isSystemAdmin: who === "equipe" };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
jest.mock("../chauffeur-onboarding.service", () => ({
  STATUTS_CHAUFFEUR: ["BROUILLON", "SOUMIS", "VALIDE", "REFUSE", "SUSPENDU"],
  REGIONS: ["BRUXELLES", "WALLONIE", "FLANDRE"],
  piecesExigees: () => ["identite", "licence"],
  ChauffeurOnboardingService: {
    dossier: jest.fn(async () => ({ id: "ch1", userId: "u1" })),
    examinerPiece: jest.fn(async () => ({ avant: { statut: "SOUMIS" }, piece: { id: "d1", type: "licence", statut: "APPROVED", noteExamen: null }, retabli: true })),
    valider: jest.fn(async () => ({ avant: "SOUMIS", dossier: { statut: "VALIDE", motifStatut: null } })),
    refuser: jest.fn(async () => ({ avant: "SOUMIS", dossier: { statut: "REFUSE", motifStatut: "Pièce illisible" } })),
    suspendre: jest.fn(async () => ({ avant: "VALIDE", dossier: { statut: "SUSPENDU", motifStatut: "Plaintes" } })),
    reactiver: jest.fn(async () => ({ avant: "SUSPENDU", dossier: { statut: "VALIDE", motifStatut: null } })),
  },
}));
jest.mock("../chauffeur.routes", () => ({ presenterDossier: (d: any) => ({ id: d.id, presente: true }) }));
jest.mock("../societe.routes", () => ({ presenterSociete: (s: any) => ({ id: s.id, presentee: true }) }));
jest.mock("../societe-drive.service", () => ({
  STATUTS_SOCIETE: ["BROUILLON", "SOUMIS", "VALIDE", "REFUSE", "SUSPENDU"],
  SocieteDriveService: {
    societe: jest.fn(async () => ({ id: "s1" })),
    examinerPiece: jest.fn(async () => ({ avant: { statut: "SOUMIS" }, piece: { id: "d2", vehiculeId: "v1", type: "assurance", statut: "REFUSED", noteExamen: "Flou" }, vehicule: { change: true, conforme: false } })),
    valider: jest.fn(async () => ({ avant: "SOUMIS", dossier: { statut: "VALIDE", motifStatut: null } })),
    refuser: jest.fn(async () => ({ avant: "SOUMIS", dossier: { statut: "REFUSE", motifStatut: "Incomplet" } })),
    suspendre: jest.fn(async () => ({ avant: "VALIDE", dossier: { statut: "SUSPENDU", motifStatut: "Fraude" } })),
    reactiver: jest.fn(async () => ({ avant: "SUSPENDU", dossier: { statut: "VALIDE", motifStatut: null } })),
  },
}));
jest.mock("../tarification-drive.service", () => ({
  TarificationDriveService: {
    lister: jest.fn(async () => [{ region: "BRUXELLES" }]),
    definir: jest.fn(async () => ({ avant: { priseEnChargeCentimes: 400, parKmCentimes: 120, parMinuteCentimes: 40, minimumCentimes: 800, actif: true, id: "x" }, apres: { region: "BRUXELLES" } })),
  },
}));
jest.mock("../note-course-drive.service", () => ({
  COMMENTAIRE_MAX: 500, NOTE_MAX: 5, NOTE_MIN: 1,
  NoteCourseDriveService: {
    moyennesChauffeurs: jest.fn(async () => new Map([["ch1", { moyenne: 4.5, avis: 2 }]])),
    moyenneChauffeur: jest.fn(async () => ({ moyenne: 4.5, avis: 2 })),
  },
}));
jest.mock("../matching-algorithm.service", () => ({
  MatchingAlgorithmService: {
    getRegionMetrics: jest.fn(async () => ({ courses: 10 })),
    calculateSurgePricing: jest.fn(async () => 1.2),
    getDriverReport: jest.fn(async () => ({ driverId: "ch1" })),
  },
}));

import router from "../chauffeur.admin.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { ChauffeurOnboardingService } from "../chauffeur-onboarding.service";
import { SocieteDriveService } from "../societe-drive.service";
import { TarificationDriveService } from "../tarification-drive.service";
import { MatchingAlgorithmService } from "../matching-algorithm.service";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/admin", router);
app.use(errorHandler);
const equipe = (r: request.Test) => r.set("Authorization", "Bearer equipe");
const audit = (action: string, target: string, changes: any) =>
  expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "equipe", action, target, changes } });

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("accès", () => {
  it.each([
    ["get", "/chauffeurs"], ["get", "/chauffeurs/ch1"], ["patch", "/chauffeurs/ch1/documents/d1"], ["post", "/chauffeurs/ch1/approve"],
    ["post", "/chauffeurs/ch1/reject"], ["post", "/chauffeurs/ch1/suspend"], ["post", "/chauffeurs/ch1/reactivate"], ["get", "/societes"],
    ["get", "/societes/s1"], ["patch", "/societes/s1/documents/d1"], ["post", "/societes/s1/approve"], ["post", "/societes/s1/reject"],
    ["post", "/societes/s1/suspend"], ["post", "/societes/s1/reactivate"], ["get", "/tarifs"], ["put", "/tarifs/BRUXELLES"], ["get", "/courses"],
    ["get", "/metrics/BRUXELLES"], ["get", "/driver/ch1/report"],
  ])("%s %s : 401 sans session, 403 sans droit", async (method, path) => {
    expect((await (request(app) as any)[method](`/api/zupdrive/admin${path}`).send({})).status).toBe(401);
    expect((await (request(app) as any)[method](`/api/zupdrive/admin${path}`).set("Authorization", "Bearer client").send({})).status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("chauffeurs", () => {
  it("GET /chauffeurs : liste avec pièces, note et comptes par statut", async () => {
    db.chauffeurDrive.findMany.mockResolvedValue([{
      id: "ch1", nomComplet: "Léa", user: { email: "l@test.fr" }, telephone: "04", region: "BRUXELLES", raisonSociale: null, vehiculePlaque: "1-ABC-123",
      societe: null, societeId: null, statut: "SOUMIS", motifStatut: null, soumisLe: new Date("2026-10-01T00:00:00Z"), valideLe: null,
      documents: [{ type: "identite", statut: "APPROVED" }, { type: "licence", statut: "PENDING" }], createdAt: new Date("2026-09-30T00:00:00Z"),
    }]);
    db.chauffeurDrive.count.mockResolvedValue(1);
    db.chauffeurDrive.groupBy.mockResolvedValue([{ statut: "SOUMIS", _count: 1 }]);
    const r = await equipe(request(app).get("/api/zupdrive/admin/chauffeurs?statut=SOUMIS&limit=5&offset=2"));
    expect(r.status).toBe(200);
    expect(r.body.counts).toEqual({ SOUMIS: 1 });
    expect(r.body.pagination).toEqual({ total: 1, limit: 5, offset: 2 });
    expect(r.body.data[0]).toMatchObject({ id: "ch1", email: "l@test.fr", societe: null, piecesDeposees: 2, piecesValidees: 1, piecesExigees: 2, note: { moyenne: 4.5, avis: 2 } });
    expect(db.chauffeurDrive.findMany).toHaveBeenCalledWith({
      where: { statut: "SOUMIS" }, skip: 2, take: 5,
      include: { user: { select: { email: true } }, documents: { where: { archiveeLe: null }, select: { type: true, statut: true } }, societe: { select: { id: true, raisonSociale: true } } },
      orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });
    expect((await equipe(request(app).get("/api/zupdrive/admin/chauffeurs?statut=INCONNU"))).status).toBe(400);
    await equipe(request(app).get("/api/zupdrive/admin/chauffeurs"));
    expect((db.chauffeurDrive.findMany.mock.calls[1][0] as any).where).toEqual({});
  });
  it("GET /chauffeurs/:id : dossier présenté avec e-mail et note", async () => {
    db.user.findUnique.mockResolvedValue({ email: "l@test.fr" });
    const r = await equipe(request(app).get("/api/zupdrive/admin/chauffeurs/ch1"));
    expect(r.body).toEqual({ success: true, data: { id: "ch1", presente: true, email: "l@test.fr", note: { moyenne: 4.5, avis: 2 } } });
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { email: true } });
    db.user.findUnique.mockResolvedValue(null);
    expect((await equipe(request(app).get("/api/zupdrive/admin/chauffeurs/ch1"))).body.data.email).toBeNull();
  });
  it("PATCH …/documents/:id : corps strict, journal avec rétablissement", async () => {
    expect((await equipe(request(app).patch("/api/zupdrive/admin/chauffeurs/ch1/documents/d1").send({ approuve: true, extra: 1 }))).status).toBe(400);
    const r = await equipe(request(app).patch("/api/zupdrive/admin/chauffeurs/ch1/documents/d1").send({ approuve: true }));
    expect(r.body).toEqual({ success: true, data: { id: "d1", type: "licence", statut: "APPROVED", noteExamen: null } });
    expect(ChauffeurOnboardingService.examinerPiece).toHaveBeenCalledWith("ch1", "d1", { approuve: true });
    audit("ZUPDRIVE_REVIEW_CHAUFFEUR_DOCUMENT", "d1", { chauffeurId: "ch1", type: "licence", avant: "SOUMIS", apres: "APPROVED", note: null, chauffeur: { avant: "SUSPENDU", apres: "VALIDE" } });
  });
  it("décisions : approve, reject, suspend, reactivate", async () => {
    let r = await equipe(request(app).post("/api/zupdrive/admin/chauffeurs/ch1/approve"));
    expect(r.body).toEqual({ success: true, data: { statut: "VALIDE", motifStatut: null } });
    expect(ChauffeurOnboardingService.valider).toHaveBeenCalledWith("ch1", "equipe");
    audit("ZUPDRIVE_APPROVE_CHAUFFEUR", "ch1", { avant: "SOUMIS", apres: "VALIDE", motif: null });
    expect((await equipe(request(app).post("/api/zupdrive/admin/chauffeurs/ch1/reject").send({ motif: "x" }))).status).toBe(400);
    expect(ChauffeurOnboardingService.refuser).not.toHaveBeenCalled();
    await equipe(request(app).post("/api/zupdrive/admin/chauffeurs/ch1/reject").send({ motif: "Pièce illisible" }));
    expect(ChauffeurOnboardingService.refuser).toHaveBeenCalledWith("ch1", "Pièce illisible");
    audit("ZUPDRIVE_REJECT_CHAUFFEUR", "ch1", { avant: "SOUMIS", apres: "REFUSE", motif: "Pièce illisible" });
    await equipe(request(app).post("/api/zupdrive/admin/chauffeurs/ch1/suspend").send({ motif: "Plaintes" }));
    audit("ZUPDRIVE_SUSPEND_CHAUFFEUR", "ch1", { avant: "VALIDE", apres: "SUSPENDU", motif: "Plaintes" });
    await equipe(request(app).post("/api/zupdrive/admin/chauffeurs/ch1/reactivate"));
    audit("ZUPDRIVE_REACTIVATE_CHAUFFEUR", "ch1", { avant: "SUSPENDU", apres: "VALIDE", motif: null });
  });
});

describe("sociétés", () => {
  it("GET /societes : liste, véhicules conformes, comptes", async () => {
    db.societeDrive.findMany.mockResolvedValue([{
      id: "s1", raisonSociale: "Taxi SA", numeroEntreprise: "0123", region: "BRUXELLES", telephone: "02", gerant: { email: "g@test.fr" }, statut: "SOUMIS",
      motifStatut: null, soumisLe: null, _count: { chauffeurs: 2 }, vehicules: [{ conforme: true }, { conforme: false }], createdAt: new Date("2026-10-01T00:00:00Z"),
    }]);
    db.societeDrive.count.mockResolvedValue(1);
    db.societeDrive.groupBy.mockResolvedValue([{ statut: "SOUMIS", _count: 1 }]);
    const r = await equipe(request(app).get("/api/zupdrive/admin/societes?statut=SOUMIS"));
    expect(r.body.data[0]).toMatchObject({ id: "s1", email: "g@test.fr", chauffeurs: 2, vehicules: 2, vehiculesConformes: 1 });
    expect(r.body.counts).toEqual({ SOUMIS: 1 });
    expect(r.body.pagination).toEqual({ total: 1, limit: 20, offset: 0 });
    expect(db.societeDrive.findMany).toHaveBeenCalledWith({
      where: { statut: "SOUMIS" }, skip: 0, take: 20,
      include: { gerant: { select: { email: true } }, _count: { select: { chauffeurs: true } }, vehicules: { where: { retireLe: null }, select: { conforme: true } } },
      orderBy: [{ soumisLe: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });
  });
  it("GET /societes/:id, PATCH …/documents/:id et décisions", async () => {
    let r = await equipe(request(app).get("/api/zupdrive/admin/societes/s1"));
    expect(r.body).toEqual({ success: true, data: { id: "s1", presentee: true } });
    r = await equipe(request(app).patch("/api/zupdrive/admin/societes/s1/documents/d2").send({ approuve: false, note: "Flou" }));
    expect(r.body.success).toBe(true);
    expect(SocieteDriveService.examinerPiece).toHaveBeenCalledWith("s1", "d2", { approuve: false, note: "Flou" });
    audit("ZUPDRIVE_REVIEW_SOCIETE_DOCUMENT", "d2", { societeId: "s1", vehiculeId: "v1", type: "assurance", avant: "SOUMIS", apres: "REFUSED", note: "Flou", vehiculeConforme: false });
    await equipe(request(app).post("/api/zupdrive/admin/societes/s1/approve"));
    expect(SocieteDriveService.valider).toHaveBeenCalledWith("s1", "equipe");
    audit("ZUPDRIVE_APPROVE_SOCIETE", "s1", { avant: "SOUMIS", apres: "VALIDE", motif: null });
    expect((await equipe(request(app).post("/api/zupdrive/admin/societes/s1/reject").send({}))).status).toBe(400);
    await equipe(request(app).post("/api/zupdrive/admin/societes/s1/reject").send({ motif: "Incomplet" }));
    audit("ZUPDRIVE_REJECT_SOCIETE", "s1", { avant: "SOUMIS", apres: "REFUSE", motif: "Incomplet" });
    await equipe(request(app).post("/api/zupdrive/admin/societes/s1/suspend").send({ motif: "Fraude" }));
    audit("ZUPDRIVE_SUSPEND_SOCIETE", "s1", { avant: "VALIDE", apres: "SUSPENDU", motif: "Fraude" });
    await equipe(request(app).post("/api/zupdrive/admin/societes/s1/reactivate"));
    audit("ZUPDRIVE_REACTIVATE_SOCIETE", "s1", { avant: "SUSPENDU", apres: "VALIDE", motif: null });
  });
});

describe("tarifs, courses, métriques", () => {
  it("GET /tarifs", async () => {
    expect((await equipe(request(app).get("/api/zupdrive/admin/tarifs"))).body).toEqual({ success: true, data: [{ region: "BRUXELLES" }] });
  });
  it("PUT /tarifs/:region : entiers en centimes, journal avant/après", async () => {
    const valeurs = { priseEnChargeCentimes: 450, parKmCentimes: 130, parMinuteCentimes: 45, minimumCentimes: 900, actif: true };
    expect((await equipe(request(app).put("/api/zupdrive/admin/tarifs/INCONNUE").send(valeurs))).status).toBe(400);
    expect((await equipe(request(app).put("/api/zupdrive/admin/tarifs/BRUXELLES").send({ ...valeurs, parKmCentimes: 1.5 }))).status).toBe(400);
    expect((await equipe(request(app).put("/api/zupdrive/admin/tarifs/BRUXELLES").send({ ...valeurs, extra: 1 }))).status).toBe(400);
    expect(TarificationDriveService.definir).not.toHaveBeenCalled();
    const r = await equipe(request(app).put("/api/zupdrive/admin/tarifs/BRUXELLES").send(valeurs));
    expect(r.body).toEqual({ success: true, data: { region: "BRUXELLES" } });
    expect(TarificationDriveService.definir).toHaveBeenCalledWith("BRUXELLES", valeurs);
    audit("ZUPDRIVE_SET_TARIF", "BRUXELLES", { avant: { priseEnChargeCentimes: 400, parKmCentimes: 120, parMinuteCentimes: 40, minimumCentimes: 800, actif: true }, apres: valeurs });
  });
  it("GET /courses : filtre de statut, pagination, sans la clé d'idempotence", async () => {
    db.courseDrive.findMany.mockResolvedValue([{ id: "c1", statut: "TERMINEE", cleIdempotence: "secret" }]);
    db.courseDrive.count.mockResolvedValue(1);
    const r = await equipe(request(app).get("/api/zupdrive/admin/courses?statut=TERMINEE&limit=10&offset=5"));
    expect(r.body).toEqual({ success: true, data: [{ id: "c1", statut: "TERMINEE" }], pagination: { total: 1, limit: 10, offset: 5 } });
    expect(db.courseDrive.findMany).toHaveBeenCalledWith({
      where: { statut: "TERMINEE" }, skip: 5, take: 10, orderBy: { createdAt: "desc" },
      include: {
        passager: { select: { email: true, name: true } }, chauffeur: { select: { id: true, nomComplet: true, vehiculePlaque: true } },
        notes: { select: { auteur: true, note: true, commentaire: true } },
      },
    });
    expect((await equipe(request(app).get("/api/zupdrive/admin/courses?statut=AUTRE"))).status).toBe(400);
  });
  it("GET /metrics/:region et /driver/:id/report", async () => {
    let r = await equipe(request(app).get("/api/zupdrive/admin/metrics/BRUXELLES?hoursBack=48"));
    expect(r.body).toEqual({ success: true, data: { courses: 10, currentSurgeFactor: 1.2 } });
    expect(MatchingAlgorithmService.getRegionMetrics).toHaveBeenCalledWith("BRUXELLES", 48);
    expect((await equipe(request(app).get("/api/zupdrive/admin/metrics/BRUXELLES?hoursBack=1000"))).status).toBe(400);
    r = await equipe(request(app).get("/api/zupdrive/admin/driver/ch1/report"));
    expect(r.body).toEqual({ success: true, data: { driverId: "ch1" } });
    (MatchingAlgorithmService.getDriverReport as any).mockResolvedValueOnce(null);
    r = await equipe(request(app).get("/api/zupdrive/admin/driver/ch1/report"));
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, error: "DRIVER_NOT_FOUND", message: "Chauffeur introuvable" });
  });
});
