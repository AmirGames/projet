import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  chauffeurDrive: { findUnique: jest.fn() },
  driverPayoutDrive: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0), aggregate: jest.fn(async () => ({ _sum: {} })) },
  courseDrive: { groupBy: jest.fn(async () => []) },
  platformSettingsDrive: { findUnique: jest.fn(async () => null), upsert: jest.fn(async () => ({})) },
};
const service: any = {
  getDriverEarnings: jest.fn(async () => ({})),
  getFinancialDashboard: jest.fn(async () => ({})),
  getPayoutHistory: jest.fn(async () => []),
  preparePayout: jest.fn(async () => ({})),
  getPayoutStatus: jest.fn(async () => ({})),
  calculateCourseEarnings: jest.fn(async () => ({})),
  processPayout: jest.fn(async () => ({ id: "po1", chauffeurId: "c1", amount: 1200, batchId: "lot-1" })),
};
const journaliser: any = jest.fn(async () => undefined);
const sections: Array<string | undefined> = [];
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../superowner/shared", () => ({ journaliser }));
jest.mock("../zupdrive-payment-driver.service", () => ({ ZupDrivePaymentDriverService: service }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    if (!req.header("x-user")) return res.status(401).json({ code: "UNAUTHORIZED" });
    req.userId = req.header("x-user");
    req.compte = { id: req.userId, isSuperOwner: req.header("x-superowner") === "1", isSystemAdmin: req.header("x-equipe") === "1", acces: {} };
    next();
  },
}));
// Un chemin sans section n'est ouvert qu'au superowner ; avec une section, à l'équipe.
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: (_r: string, _p: string, section?: string) => {
    sections.push(section);
    return (req: any, res: any, next: any) => {
      if (req.compte?.isSuperOwner) return next();
      return section && req.compte?.isSystemAdmin ? next() : res.status(403).json({ code: "FORBIDDEN" });
    };
  },
}));
import router from "../zupdrive-payment-driver.routes";

const app = express();
app.use(express.json());
app.use("/api/zupdrive/finance", router);
app.use((err: any, _req: any, res: any, _next: any) => res.status(err.statusCode || (err.name === "ZodError" ? 400 : 500)).json({ code: err.code }));

const alice = { "x-user": "user-alice" };
const equipe = { "x-user": "agent", "x-equipe": "1" };
const owner = { "x-user": "owner", "x-superowner": "1" };

beforeEach(() => {
  jest.clearAllMocks();
  db.chauffeurDrive.findUnique.mockImplementation(async ({ where }: any) => (where.userId === "user-alice" ? { id: "chauffeur-alice" } : null));
});

describe("revenus et versements d'un chauffeur : chacun chez soi", () => {
  it.each([["get", "/earnings"], ["get", "/financial-dashboard"], ["get", "/payouts/history"], ["post", "/payouts/request"], ["get", "/payouts/p1"], ["post", "/earnings/calculate"]] as const)(
    "%s %s : 401 sans jeton",
    async (m, url) => {
      expect((await (request(app) as any)[m](`/api/zupdrive/finance${url}`).send({})).status).toBe(401);
    }
  );

  it("le chauffeur est celui du jeton : un autre compte n'a pas de dossier, 404", async () => {
    expect((await request(app).get("/api/zupdrive/finance/earnings").set({ "x-user": "intrus" })).status).toBe(404);
    expect(service.getDriverEarnings).not.toHaveBeenCalled();
  });

  it("le statut d'un versement est cherché pour le chauffeur du jeton seulement", async () => {
    await request(app).get("/api/zupdrive/finance/payouts/versement-de-bob").set(alice);
    expect(service.getPayoutStatus).toHaveBeenCalledWith("versement-de-bob", "chauffeur-alice");
  });

  it("préparer un versement ne vise que le chauffeur du jeton", async () => {
    await request(app).post("/api/zupdrive/finance/payouts/request").set(alice).send({ chauffeurId: "chauffeur-bob" });
    expect(service.preparePayout).toHaveBeenCalledWith("chauffeur-alice");
  });
});

describe("administration financière : droits et journal", () => {
  it("les lectures de l'équipe demandent la section « courses-drive »", () => expect(sections).toContain("courses-drive"));

  it.each([["get", "/admin/payouts/pending"], ["get", "/admin/driver/c1/payouts"], ["get", "/admin/financial-dashboard"]] as const)(
    "%s %s : refusé à un chauffeur, ouvert à l'équipe",
    async (m, url) => {
      expect((await (request(app) as any)[m](`/api/zupdrive/finance${url}`).set(alice)).status).toBe(403);
      expect((await (request(app) as any)[m](`/api/zupdrive/finance${url}`).set(equipe)).status).toBe(200);
    }
  );

  it("traiter un versement ou changer la commission : superowner seulement", async () => {
    expect((await request(app).post("/api/zupdrive/finance/admin/payouts/po1/process").set(equipe)).status).toBe(403);
    expect((await request(app).post("/api/zupdrive/finance/admin/settings/commission").set(equipe).send({ commissionPercentage: 5 })).status).toBe(403);
    expect(service.processPayout).not.toHaveBeenCalled();
    expect(db.platformSettingsDrive.upsert).not.toHaveBeenCalled();
  });

  it("le traitement d'un versement est journalisé avec le montant et le lot", async () => {
    const res = await request(app).post("/api/zupdrive/finance/admin/payouts/po1/process").set(owner);
    expect(res.status).toBe(200);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_PROCESS_PAYOUT", "po1", { chauffeurId: "c1", amountCentimes: 1200, batchId: "lot-1" });
  });

  it("le changement de commission est journalisé avec l'ancienne et la nouvelle valeur", async () => {
    db.platformSettingsDrive.findUnique.mockResolvedValue({ commissionPercentage: 20 } as never);
    const res = await request(app).post("/api/zupdrive/finance/admin/settings/commission").set(owner).send({ commissionPercentage: 25 });
    expect(res.status).toBe(200);
    expect(journaliser).toHaveBeenCalledWith(expect.anything(), "ZUPDRIVE_UPDATE_COMMISSION", "default", { avant: 20, apres: 25 });
  });

  it("une commission hors de 0-100 est refusée", async () => {
    expect((await request(app).post("/api/zupdrive/finance/admin/settings/commission").set(owner).send({ commissionPercentage: 120 })).status).toBe(400);
    expect(db.platformSettingsDrive.upsert).not.toHaveBeenCalled();
  });
});
