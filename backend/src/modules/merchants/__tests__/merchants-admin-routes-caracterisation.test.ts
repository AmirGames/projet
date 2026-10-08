/**
 * Tests de caractérisation de l'administration des commerçants
 * (/api/superowner/organizations/...) : liste, formule, conditions négociées,
 * promo zéro commission, suspension/fermeture, dossier, pièces, validation.
 * Ils figent statuts, codes d'erreur, formes de réponse, écritures Prisma et
 * entrées du journal d'audit avant l'extraction de la logique vers un service
 * (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  organization: model("findMany", "findUnique", "count", "update"),
  store: model("findMany", "count"),
  order: model("findMany", "update"),
  user: model("findUnique"),
  systemAuditLog: model("create"),
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers.authorization?.replace("Bearer ", "");
    if (!["owner", "user"].includes(who)) return res.status(401).json({});
    req.userId = who;
    req.compte = { isSuperOwner: who === "owner", isSystemAdmin: who === "owner", acces: {} };
    next();
  },
}));
jest.mock("../../auth/permissions-plateforme.service", () => ({
  exigerPermission: () => (req: any, res: any, next: any) => (req.compte?.isSuperOwner ? next() : res.status(403).json({ code: "FORBIDDEN" })),
}));
jest.mock("../../plans/plan.service", () => {
  const reel = jest.requireActual("../../plans/plan.service") as any;
  const grille: any = {
    FREE: { code: "FREE", libelle: "Gratuite", commission: 5, commissionLivreursPlateforme: 8, maxBoutiques: 1 },
    PRO: { code: "PRO", libelle: "Pro", commission: 3, commissionLivreursPlateforme: 6, maxBoutiques: 5 },
  };
  return { ...reel, PlanService: { formule: jest.fn(async (code: string) => grille[code] ?? grille.FREE) } };
});
jest.mock("../merchant-closure.service", () => ({
  MerchantClosureService: {
    suspend: jest.fn(async (id: string) => ({ id, status: "SUSPENDED" })),
    unsuspend: jest.fn(async (id: string) => ({ id, status: "ACTIVE" })),
    close: jest.fn(async (id: string) => ({ id, status: "CLOSED" })),
  },
}));
jest.mock("../merchant-profile.service", () => ({
  MerchantProfileService: {
    dossier: jest.fn(async (id: string) => ({ orgId: id })),
    changerEcheance: jest.fn(async () => ({ avant: "2026-01-01", piece: { id: "d1", type: "KBIS", expiryDate: "2027-01-01" } })),
    examinerPiece: jest.fn(async () => ({ id: "d1", type: "KBIS" })),
  },
}));
jest.mock("../merchant-approval.service", () => ({
  MerchantApprovalService: { valider: jest.fn(async () => ({ id: "o1", approvedAt: "2026-10-01T00:00:00.000Z" })) },
}));

import router from "../merchants.admin.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { MerchantClosureService } from "../merchant-closure.service";
import { MerchantProfileService } from "../merchant-profile.service";
import { MerchantApprovalService } from "../merchant-approval.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", router);
app.use(errorHandler);
const owner = (r: request.Test) => r.set("Authorization", "Bearer owner");

const org = (extra: any = {}) => ({
  id: "o1", name: "Chez Test", email: "c@test.fr", status: "ACTIVE", tier: "FREE", createdAt: new Date("2026-10-01T00:00:00Z"), approvedAt: null,
  commissionFreeActive: false, commissionFreeUntil: null, commissionFreeNote: null,
  customCommissionPercent: null, customPlatformDeliveryCommissionPercent: null, customMaxStores: null, customMonthlyPrice: null, customTermsNote: null,
  stores: [{ id: "s1" }], _count: { memberships: 2 }, ...extra,
});
const conditionsVides = { customCommissionPercent: null, customPlatformDeliveryCommissionPercent: null, customMaxStores: null, customMonthlyPrice: null, customTermsNote: null };

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) for (const f of Object.values(m as any)) (f as any).mockReset();
  db.user.findUnique.mockResolvedValue({ email: "owner@test.fr" });
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("accès", () => {
  it.each([
    ["get", "/organizations"], ["patch", "/organizations/o1/tier"], ["patch", "/organizations/o1/conditions"],
    ["patch", "/organizations/o1/commission-promo"], ["post", "/organizations/o1/suspend"], ["post", "/organizations/o1/unsuspend"],
    ["post", "/organizations/o1/close"], ["get", "/organizations/o1/profile"], ["patch", "/organizations/o1/documents/d1/expiry"],
    ["patch", "/organizations/o1/documents/d1"], ["post", "/organizations/o1/approve"],
  ])("%s %s : 401 sans session, 403 sans droit", async (method, path) => {
    expect((await (request(app) as any)[method](`/api/superowner${path}`).send({})).status).toBe(401);
    expect((await (request(app) as any)[method](`/api/superowner${path}`).set("Authorization", "Bearer user").send({})).status).toBe(403);
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("GET /organizations", () => {
  it("liste avec activité réelle, promo et conditions négociées", async () => {
    db.organization.findMany.mockResolvedValue([org({ customCommissionPercent: "2.5", commissionFreeActive: true, commissionFreeNote: "Lancement" })]);
    db.organization.count.mockResolvedValue(1);
    db.order.findMany.mockResolvedValue([{ totalAmount: "10.10" }, { totalAmount: "20.20" }]);
    const r = await owner(request(app).get("/api/superowner/organizations?status=ACTIVE&validation=attente&limit=5&offset=2"));
    expect(r.status).toBe(200);
    expect(r.body.pagination).toEqual({ total: 1, limit: 5, offset: 2 });
    expect(r.body.organizations[0]).toMatchObject({
      id: "o1", name: "Chez Test", email: "c@test.fr", status: "ACTIVE", tier: "FREE", approvedAt: null, activeUsers: 2, revenue: 30.3,
      commissionFree: { active: true, until: null, note: "Lancement" },
      customTerms: { actives: true, commission: 2.5, commissionLivreursPlateforme: null, maxBoutiques: null, prixMensuel: null, note: null },
    });
    expect(db.organization.findMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", approvedAt: null }, skip: 2, take: 5,
      include: { stores: { select: { id: true } }, _count: { select: { memberships: true } } }, orderBy: { createdAt: "desc" },
    });
    expect(db.order.findMany).toHaveBeenCalledWith({ where: { storeId: { in: ["s1"] } }, select: { totalAmount: true } });
  });
  it("sans boutique : chiffre d'affaires nul, aucune lecture de commandes", async () => {
    db.organization.findMany.mockResolvedValue([org({ stores: [] })]);
    db.organization.count.mockResolvedValue(1);
    const r = await owner(request(app).get("/api/superowner/organizations"));
    expect(r.body.organizations[0].revenue).toBe(0);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect((db.organization.findMany.mock.calls[0][0] as any).where).toEqual({});
  });
});

describe("PATCH /organizations/:orgId/tier", () => {
  const changer = (corps: any) => owner(request(app).patch("/api/superowner/organizations/o1/tier").send(corps));
  it("formule invalide → 400, commerçant inconnu → 404", async () => {
    expect((await changer({ tier: "GOLD" })).status).toBe(400);
    db.organization.findUnique.mockResolvedValue(null);
    const r = await changer({ tier: "PRO" });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("ORG_NOT_FOUND");
  });
  it("rétrogradation sous le nombre de boutiques → 400 TIER_BELOW_USAGE", async () => {
    db.organization.findUnique.mockResolvedValue({ tier: "PRO", ...conditionsVides });
    db.store.count.mockResolvedValue(3);
    const r = await changer({ tier: "FREE" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("TIER_BELOW_USAGE");
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("fige les commissions du mois au taux d'avant, change la formule, journalise", async () => {
    db.organization.findUnique.mockResolvedValue({ tier: "FREE", ...conditionsVides });
    db.store.count.mockResolvedValue(1);
    db.store.findMany.mockResolvedValue([{ id: "s1" }]);
    db.order.findMany.mockResolvedValue([
      { id: "c1", totalAmount: "100", commissionAmount: "0", commissionWaived: false },
      { id: "c2", totalAmount: "50", commissionAmount: "2.5", commissionWaived: false },
      { id: "c3", totalAmount: "50", commissionAmount: "0", commissionWaived: true },
    ]);
    db.organization.update.mockResolvedValue({ id: "o1", tier: "PRO" });
    const r = await changer({ tier: "PRO" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Formule passée en Pro", organization: { id: "o1", tier: "PRO" } });
    expect(db.order.update).toHaveBeenCalledTimes(1);
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { commissionPercent: 5, commissionAmount: 5, tierAtOrder: "FREE" } });
    expect(db.organization.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { tier: "PRO" } });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "owner", action: "MERCHANT_TIER_CHANGED", target: "o1", changes: { avant: "FREE", apres: "PRO", commandesFigees: true } },
    });
  });
});

describe("PATCH /organizations/:orgId/conditions", () => {
  const corps = { commission: 2, commissionLivreursPlateforme: 4, maxBoutiques: 3, prixMensuel: 20, note: " Enseigne " };
  const fixer = (c: any) => owner(request(app).patch("/api/superowner/organizations/o1/conditions").send(c));
  it("validation, inconnu → 404, livreurs sous la commission → 400, quota sous l'usage → 400", async () => {
    expect((await fixer({ commission: 200 })).status).toBe(400);
    db.organization.findUnique.mockResolvedValue(null);
    expect((await fixer(corps)).status).toBe(404);
    db.organization.findUnique.mockResolvedValue({ tier: "FREE", ...conditionsVides });
    let r = await fixer({ ...corps, commission: 6, commissionLivreursPlateforme: 4 });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_COMMISSION");
    db.store.count.mockResolvedValue(5);
    r = await fixer(corps);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("TIER_BELOW_USAGE");
    expect(db.organization.update).not.toHaveBeenCalled();
  });
  it("enregistre les conditions négociées et journalise avant/après", async () => {
    db.organization.findUnique.mockResolvedValue({ tier: "FREE", ...conditionsVides });
    db.store.count.mockResolvedValue(1);
    db.store.findMany.mockResolvedValue([]);
    db.organization.update.mockResolvedValue({ customCommissionPercent: "2", customPlatformDeliveryCommissionPercent: "4", customMaxStores: 3, customMonthlyPrice: "20", customTermsNote: "Enseigne" });
    const r = await fixer(corps);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      message: "Conditions négociées enregistrées",
      customTerms: { actives: true, commission: 2, commissionLivreursPlateforme: 4, maxBoutiques: 3, prixMensuel: 20, note: "Enseigne" },
    });
    expect(db.organization.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { customCommissionPercent: 2, customPlatformDeliveryCommissionPercent: 4, customMaxStores: 3, customMonthlyPrice: 20, customTermsNote: "Enseigne" },
      select: { customCommissionPercent: true, customPlatformDeliveryCommissionPercent: true, customMaxStores: true, customMonthlyPrice: true, customTermsNote: true },
    });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: "owner", action: "MERCHANT_CUSTOM_TERMS_SET", target: "o1",
        changes: {
          avant: { actives: false, commission: null, commissionLivreursPlateforme: null, maxBoutiques: null, prixMensuel: null, note: null },
          apres: { actives: true, commission: 2, commissionLivreursPlateforme: 4, maxBoutiques: 3, prixMensuel: 20, note: "Enseigne" },
        },
      },
    });
  });
  it("tout à null : le commerçant retrouve sa formule", async () => {
    db.organization.findUnique.mockResolvedValue({ tier: "FREE", ...conditionsVides });
    db.store.findMany.mockResolvedValue([]);
    db.organization.update.mockResolvedValue(conditionsVides);
    const r = await fixer({ commission: null, commissionLivreursPlateforme: null, maxBoutiques: null, prixMensuel: null });
    expect(r.body.message).toBe("Le commerçant retrouve les conditions de sa formule");
    expect(db.store.count).not.toHaveBeenCalled();
  });
});

describe("PATCH /organizations/:orgId/commission-promo", () => {
  const promo = (c: any) => owner(request(app).patch("/api/superowner/organizations/o1/commission-promo").send(c));
  it("inconnu → 404, date de fin passée → 400", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    expect((await promo({ active: true })).status).toBe(404);
    db.organization.findUnique.mockResolvedValue({ commissionFreeActive: false, commissionFreeUntil: null });
    const r = await promo({ active: true, until: "2020-01-01" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("PROMO_END_IN_PAST");
    expect((await promo({ active: true, until: "demain" })).status).toBe(400);
    expect(db.organization.update).not.toHaveBeenCalled();
  });
  it("active la promo jusqu'à une date et journalise COMMISSION_PROMO_GRANTED", async () => {
    db.organization.findUnique.mockResolvedValue({ commissionFreeActive: false, commissionFreeUntil: null });
    db.organization.update.mockImplementation(async ({ data }: any) => ({ commissionFreeActive: data.commissionFreeActive, commissionFreeUntil: data.commissionFreeUntil, commissionFreeNote: data.commissionFreeNote }));
    const r = await promo({ active: true, until: "2099-12-31", note: " Lancement " });
    expect(r.status).toBe(200);
    expect(r.body.message).toBe("Promo zéro commission activée");
    expect(r.body.commissionFree).toMatchObject({ active: true, note: "Lancement", enCours: true });
    const ecrit = (db.organization.update.mock.calls[0][0] as any).data;
    expect(ecrit.commissionFreeUntil).toEqual(new Date("2099-12-31T23:59:59.999"));
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "owner", action: "COMMISSION_PROMO_GRANTED", target: "o1", changes: expect.objectContaining({ avant: { commissionFreeActive: false, commissionFreeUntil: null } }) },
    });
  });
  it("retire la promo : note et fin effacées, COMMISSION_PROMO_REMOVED", async () => {
    db.organization.findUnique.mockResolvedValue({ commissionFreeActive: true, commissionFreeUntil: null });
    db.organization.update.mockResolvedValue({ commissionFreeActive: false, commissionFreeUntil: null, commissionFreeNote: null });
    const r = await promo({ active: false, until: "2099-12-31", note: "x" });
    expect(r.body.message).toBe("Promo zéro commission retirée");
    expect(db.organization.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { commissionFreeActive: false, commissionFreeUntil: null, commissionFreeNote: null } });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "COMMISSION_PROMO_REMOVED" }) });
  });
});

describe("suspension, fermeture, dossier, pièces, validation", () => {
  it("suspend / unsuspend / close : raison requise, journal", async () => {
    expect((await owner(request(app).post("/api/superowner/organizations/o1/suspend").send({}))).status).toBe(400);
    let r = await owner(request(app).post("/api/superowner/organizations/o1/suspend").send({ reason: "Fraude" }));
    expect(r.body).toEqual({ id: "o1", status: "SUSPENDED" });
    expect(MerchantClosureService.suspend).toHaveBeenCalledWith("o1", "Fraude");
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "SUSPEND_MERCHANT", target: "o1", changes: { reason: "Fraude" } } });
    r = await owner(request(app).post("/api/superowner/organizations/o1/unsuspend").send({}));
    expect(r.body).toEqual({ id: "o1", status: "ACTIVE" });
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "UNSUSPEND_MERCHANT", target: "o1", changes: {} } });
    r = await owner(request(app).post("/api/superowner/organizations/o1/close").send({ reason: "Faillite" }));
    expect(r.body).toEqual({ id: "o1", status: "CLOSED" });
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "CLOSE_MERCHANT", target: "o1", changes: { reason: "Faillite" } } });
  });
  it("GET /organizations/:orgId/profile", async () => {
    const r = await owner(request(app).get("/api/superowner/organizations/o1/profile"));
    expect(r.body).toEqual({ success: true, data: { orgId: "o1" } });
  });
  it("PATCH …/documents/:id/expiry : échéance corrigée et journalisée", async () => {
    expect((await owner(request(app).patch("/api/superowner/organizations/o1/documents/d1/expiry").send({}))).status).toBe(400);
    const r = await owner(request(app).patch("/api/superowner/organizations/o1/documents/d1/expiry").send({ expiryDate: "2027-01-01" }));
    expect(r.body).toEqual({ success: true, document: { id: "d1", type: "KBIS", expiryDate: "2027-01-01" } });
    expect(MerchantProfileService.changerEcheance).toHaveBeenCalledWith("o1", "d1", "2027-01-01");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({
      data: { adminId: "owner", action: "UPDATE_MERCHANT_DOCUMENT_EXPIRY", target: "o1", changes: { type: "KBIS", avant: "2026-01-01", apres: "2027-01-01" } },
    });
  });
  it("PATCH …/documents/:id : approuver ou rejeter, journalisé", async () => {
    expect((await owner(request(app).patch("/api/superowner/organizations/o1/documents/d1").send({ note: "x" }))).status).toBe(400);
    let r = await owner(request(app).patch("/api/superowner/organizations/o1/documents/d1").send({ approuve: true }));
    expect(r.body).toEqual({ success: true, document: { id: "d1", type: "KBIS" } });
    expect(MerchantProfileService.examinerPiece).toHaveBeenCalledWith("o1", "d1", { approuve: true });
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "APPROVE_MERCHANT_DOCUMENT", target: "o1", changes: { type: "KBIS" } } });
    r = await owner(request(app).patch("/api/superowner/organizations/o1/documents/d1").send({ approuve: false, note: "Illisible" }));
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "REJECT_MERCHANT_DOCUMENT", target: "o1", changes: { type: "KBIS", note: "Illisible" } } });
  });
  it("POST /organizations/:orgId/approve", async () => {
    const r = await owner(request(app).post("/api/superowner/organizations/o1/approve"));
    expect(r.body).toEqual({ success: true, message: "Commerce validé", organization: { id: "o1", approvedAt: "2026-10-01T00:00:00.000Z" } });
    expect(MerchantApprovalService.valider).toHaveBeenCalledWith("o1", "owner");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "APPROVE_MERCHANT", target: "o1", changes: { approvedAt: "2026-10-01T00:00:00.000Z" } } });
  });
});
