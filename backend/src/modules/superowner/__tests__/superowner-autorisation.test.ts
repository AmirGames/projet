import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Accès générique à la base : chaque méthode est un jest.fn créé à la demande.
const tables: Record<string, Record<string, any>> = {};
const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (!tables[table]) {
      const methodes: Record<string, any> = {};
      tables[table] = new Proxy(methodes, {
        get(_methodes, methode: string) {
          if (!methodes[methode]) {
            methodes[methode] = jest.fn(async () =>
              methode === "findMany" ? [] : methode === "count" ? 0 : { id: "objet", title: "t", status: "OPEN", tier: "FREE", priority: "LOW" });
          }
          return methodes[methode];
        },
      }) as any;
    }
    return tables[table];
  },
});

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
// Seule la cryptographie du jeton est simulée : authMiddleware, isSuperOwner et exigerPermission sont réels.
jest.mock("../../auth/auth.service", () => ({ AuthService: {
  verifyAccessToken: (token: string) => {
    if (!["client", "support", "admin", "owner"].includes(token)) {
      const { ApiError } = jest.requireActual("../../../middleware/errorHandler") as any;
      throw new ApiError(401, "Jeton invalide", "INVALID_TOKEN");
    }
    return { userId: token, sid: `session-${token}` };
  },
} }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));
jest.mock("../../auth/api-key.service", () => ({ ApiKeyService: {} }));
jest.mock("../../monitoring/maintenance.middleware", () => ({ invalidateMaintenanceCache: jest.fn() }));
jest.mock("../../merchants/merchant-closure.service", () => ({ MerchantClosureService: {
  suspend: jest.fn(async () => ({ id: "org-a", status: "SUSPENDED" })),
  unsuspend: jest.fn(async () => ({ id: "org-a", status: "ACTIVE" })),
  close: jest.fn(async () => ({ id: "org-a", status: "CLOSED" })),
} }));
jest.mock("../../merchants/merchant-profile.service", () => ({ MerchantProfileService: {
  dossier: jest.fn(async () => ({})),
  changerEcheance: jest.fn(async () => ({ avant: null, piece: { type: "KBIS", expiryDate: "2030-01-01" } })),
  examinerPiece: jest.fn(async () => ({ type: "KBIS" })),
} }));
jest.mock("../../merchants/merchant-approval.service", () => ({ MerchantApprovalService: {
  valider: jest.fn(async () => ({ id: "org-a", approvedAt: null })),
} }));
jest.mock("../../plans/plan.service", () => ({
  ...(jest.requireActual("../../plans/plan.service") as object),
  PlanService: {
    formule: jest.fn(async () => ({ libelle: "Pro", commission: 5, commissionLivreursPlateforme: 8, maxBoutiques: 10 })),
    enregistrer: jest.fn(async () => ({ libelle: "Pro" })),
    toutes: jest.fn(async () => []),
  },
}));
jest.mock("../../legal/pages-legales.service", () => ({ PagesLegalesService: {
  toutes: jest.fn(async () => []),
  historique: jest.fn(async () => []),
  publier: jest.fn(async () => ({ version: "2", titre: "CGU" })),
} }));
jest.mock("../../support/ticket-message.service", () => ({ TicketMessageService: {
  add: jest.fn(async () => ({ id: "m1" })),
  list: jest.fn(async () => []),
  changerEtat: jest.fn(async () => ({ ticket: { title: "t" }, precedent: "OPEN" })),
  notifierChangementEtat: jest.fn(async () => undefined),
} }));
jest.mock("../../invoicing/platform-invoice.service", () => ({
  moisPrecedent: () => "2026-09",
  PlatformInvoiceService: {
    emettreLeMois: jest.fn(async () => ({ emises: 0 })),
    emettre: jest.fn(async () => ({ id: "inv1", number: "N1" })),
    envoyer: jest.fn(async () => ({ id: "inv1", number: "N1" })),
  },
}));
jest.mock("../../webhooks/webhook.service", () => ({
  EVENEMENTS_WEBHOOK: [],
  WebhookService: {
    create: jest.fn(async () => ({ id: "wh1", url: "https://x.test/h", events: ["order.created"], status: "ACTIVE", retryCount: 0 })),
    remove: jest.fn(async () => undefined),
    setStatus: jest.fn(async () => ({ id: "wh1", status: "INACTIVE", retryCount: 0 })),
    essayer: jest.fn(async () => ({ success: true, statusCode: 200 })),
  },
}));

import superownerRouter from "../superowner.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { PERMISSIONS_PAR_DEFAUT } from "../../auth/permissions-plateforme.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", superownerRouter);
app.use(errorHandler);

const COMPTES: Record<string, any> = {
  client: { isSuperOwner: false, isSystemAdmin: false, accesEquipe: [] },
  support: { isSuperOwner: false, isSystemAdmin: true, accesEquipe: [{ plateforme: "EAT", role: "SUPPORT" }] },
  admin: { isSuperOwner: false, isSystemAdmin: true, accesEquipe: [{ plateforme: "EAT", role: "ADMIN" }] },
  owner: { isSuperOwner: true, isSystemAdmin: true, accesEquipe: [] },
};

const appeler = (methode: string, chemin: string, corps?: unknown, qui?: string) => {
  const appel = (request(app) as any)[methode](`/api/superowner${chemin}`);
  if (qui) appel.set("Authorization", `Bearer ${qui}`);
  return corps === undefined ? appel : appel.send(corps);
};

beforeEach(() => {
  db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, email: `${where.id}@zup.test`, passwordChangedAt: null, status: "ACTIVE", ...COMPTES[where.id] }));
  // Les groupes livrés avec la plateforme, avec leurs permissions par défaut.
  db.platformRole.findMany.mockResolvedValue(Object.entries(PERMISSIONS_PAR_DEFAUT).map(([code, permissions]) => ({ code, label: code, permissions })));
  db.systemAuditLog.create.mockResolvedValue({});
  db.systemConfig.findFirst.mockResolvedValue({ id: "cfg", driverBikeMaxKm: 5, driverScooterMaxKm: 10, settings: {}, maintenanceMode: false });
  db.systemConfig.update.mockResolvedValue({ id: "cfg", settings: {}, maintenanceMode: false, maintenanceMessage: "" });
  db.organization.findUnique.mockResolvedValue({ id: "org-a", tier: "FREE", commissionFreeActive: false, commissionFreeUntil: null, customCommissionPercent: null, customPlatformDeliveryCommissionPercent: null, customMaxStores: null, customMonthlyPrice: null, customTermsNote: null });
  db.organization.update.mockResolvedValue({ id: "org-a", tier: "PRO", commissionFreeActive: false, commissionFreeUntil: null, commissionFreeNote: null, customCommissionPercent: null, customPlatformDeliveryCommissionPercent: null, customMaxStores: null, customMonthlyPrice: null, customTermsNote: null });
  db.merchantTicket.findUnique.mockResolvedValue({ id: "t1", priority: "LOW", title: "t" });
  db.merchantTicket.update.mockResolvedValue({ id: "t1", priority: "HIGH", title: "t" });
});

// [méthode, chemin, corps, action attendue dans le journal (null = lecture)]
type Operation = [string, string, unknown, string | null];

const LECTURES: Operation[] = [
  "/dashboard", "/organizations", "/organizations/org-a/profile", "/billing", "/billing/org-a",
  "/financial-reports", "/system-config", "/advanced-settings", "/analytics", "/audit-logs",
  "/members/clients", "/members/merchants", "/members/deliveries", "/members/drivers",
  "/plans", "/pages-legales", "/platform-invoices", "/platform-invoices/overview",
  "/platform-invoices/inv1/ubl", "/webhooks", "/webhooks/evenements", "/webhooks/wh1/deliveries",
  "/support-tickets", "/support-tickets/t1/messages",
].map(chemin => ["get", chemin, undefined, null] as Operation);

const MODIFICATIONS: Operation[] = [
  ["put", "/system-config", { serviceFee: 1 }, "SYSTEM_CONFIG_UPDATED"],
  ["put", "/advanced-settings", { debugMode: true }, "UPDATE_ADVANCED_SETTINGS"],
  ["patch", "/plans/PRO", { prixMensuel: 30 }, "PLAN_TIER_UPDATED"],
  ["post", "/pages-legales/cgu", { titre: "CGU", contenu: "Texte", version: "2.0" }, "PAGE_LEGALE_PUBLIEE"],
  ["patch", "/support-tickets/t1/priority", { priority: "HIGH" }, "TICKET_PRIORITY_CHANGED"],
  ["patch", "/support-tickets/t1/status", { status: "RESOLVED" }, "UPDATE_TICKET_STATUS"],
  ["post", "/support-tickets/t1/messages", { body: "Bonjour" }, "REPLY_TICKET"],
  ["patch", "/organizations/org-a/tier", { tier: "PRO" }, "MERCHANT_TIER_CHANGED"],
  ["patch", "/organizations/org-a/conditions", { commission: 4, commissionLivreursPlateforme: 6, maxBoutiques: null, prixMensuel: null }, "MERCHANT_CUSTOM_TERMS_SET"],
  ["patch", "/organizations/org-a/commission-promo", { active: false }, "COMMISSION_PROMO_REMOVED"],
  ["post", "/organizations/org-a/suspend", { reason: "fraude" }, "SUSPEND_MERCHANT"],
  ["post", "/organizations/org-a/unsuspend", {}, "UNSUSPEND_MERCHANT"],
  ["post", "/organizations/org-a/close", { reason: "demande" }, "CLOSE_MERCHANT"],
  ["post", "/organizations/org-a/approve", {}, "APPROVE_MERCHANT"],
  ["patch", "/organizations/org-a/documents/doc-1", { approuve: true }, "APPROVE_MERCHANT_DOCUMENT"],
  ["patch", "/organizations/org-a/documents/doc-1/expiry", { expiryDate: "2030-01-01" }, "UPDATE_MERCHANT_DOCUMENT_EXPIRY"],
  ["post", "/platform-invoices/issue-month", {}, "ISSUE_PLATFORM_INVOICES_MONTH"],
  ["post", "/billing/org-a/invoice", {}, "ISSUE_PLATFORM_INVOICE"],
  ["post", "/platform-invoices/inv1/send", {}, "SEND_PLATFORM_INVOICE"],
  ["post", "/webhooks", { url: "https://x.test/h", events: ["order.created"] }, "CREATE_WEBHOOK"],
  ["patch", "/webhooks/wh1", { status: "INACTIVE" }, "SET_WEBHOOK_STATUS"],
  ["post", "/webhooks/wh1/essai", {}, "TEST_WEBHOOK"],
  ["delete", "/webhooks/wh1", undefined, "DELETE_WEBHOOK"],
];

describe("superowner : l'authentification est exigée sur chaque route", () => {
  it.each([...LECTURES, ...MODIFICATIONS])("%s %s sans jeton → 401, rien n'est lu ni écrit", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps);
    expect(r.status).toBe(401);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.platformRole.findMany).not.toHaveBeenCalled();
  });

  it("un jeton falsifié est refusé comme l'absence de jeton", async () => {
    expect((await appeler("get", "/dashboard", undefined, "forge")).status).toBe(401);
  });
});

describe("superowner : un compte sans rôle d'équipe est refusé en 403", () => {
  it.each([...LECTURES, ...MODIFICATIONS])("%s %s → 403", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps, "client");
    expect(r.status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemConfig.update).not.toHaveBeenCalled();
  });
});

describe("superowner : les sections fermées au Support le restent, y compris en lecture", () => {
  // Rôle Support par défaut : support-tickets, organizations (lecture), members (lecture)…
  const fermees: Operation[] = [
    ...MODIFICATIONS.filter(([, chemin]) => !chemin.startsWith("/support-tickets")),
    ["get", "/system-config", undefined, null],
    ["get", "/advanced-settings", undefined, null],
    ["get", "/billing", undefined, null],
    ["get", "/financial-reports", undefined, null],
    ["get", "/plans", undefined, null],
    ["get", "/webhooks", undefined, null],
    ["get", "/platform-invoices", undefined, null],
    ["get", "/analytics", undefined, null],
    ["get", "/audit-logs", undefined, null],
    ["get", "/pages-legales", undefined, null],
  ];

  it.each(fermees)("%s %s → 403 pour le Support", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps, "support");
    expect(r.status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.systemConfig.update).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("le Support lit les organisations (lecture ouverte) mais ne les suspend pas", async () => {
    expect((await appeler("get", "/organizations", undefined, "support")).status).toBe(200);
    expect((await appeler("post", "/organizations/org-a/suspend", { reason: "x" }, "support")).status).toBe(403);
  });

  it("le Support traite les tickets : autorisé et journalisé sous son identité", async () => {
    const r = await appeler("patch", "/support-tickets/t1/status", { status: "RESOLVED" }, "support");
    expect(r.status).toBe(200);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "support", action: "UPDATE_TICKET_STATUS", target: "t1" }) });
  });
});

describe("superowner : l'Administrateur par défaut n'ouvre pas la plateforme technique", () => {
  it.each([
    ["put", "/system-config", { serviceFee: 1 }],
    ["put", "/advanced-settings", { debugMode: true }],
    ["post", "/webhooks", { url: "https://x.test/h", events: ["order.created"] }],
    ["delete", "/webhooks/wh1", undefined],
    ["get", "/webhooks", undefined],
  ] as [string, string, unknown][])("%s %s → 403 pour l'Administrateur", async (methode, chemin, corps) => {
    expect((await appeler(methode, chemin, corps, "admin")).status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});

describe("superowner : chaque modification est journalisée (qui, quoi, sur quelle ressource)", () => {
  it.each(MODIFICATIONS)("%s %s par le superowner → journal %s", async (methode, chemin, corps, action) => {
    const r = await appeler(methode, chemin, corps, "owner");
    expect(r.status).toBeLessThan(300);
    expect(db.systemAuditLog.create).toHaveBeenCalledTimes(1);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "owner", action }) });
  });

  it("le journal garde la ressource touchée et la raison", async () => {
    await appeler("post", "/organizations/org-a/suspend", { reason: "fraude" }, "owner");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "SUSPEND_MERCHANT", target: "org-a", changes: { reason: "fraude" } } });
  });

  it("le changement de formule journalise l'avant et l'après", async () => {
    await appeler("patch", "/organizations/org-a/tier", { tier: "PRO" }, "owner");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ target: "org-a", changes: expect.objectContaining({ avant: "FREE", apres: "PRO" }) }) });
  });

  it.each([
    ["patch", "/organizations/org-a/tier", { tier: "DIAMANT" }],
    ["post", "/organizations/org-a/suspend", { reason: "" }],
    ["put", "/system-config", { platformFeePercent: 150 }],
    ["put", "/system-config", { minOrderAmount: 50, maxOrderAmount: 10 }],
    ["patch", "/organizations/org-a/commission-promo", { active: true, until: "2000-01-01" }],
    ["patch", "/organizations/org-a/conditions", { commission: 10, commissionLivreursPlateforme: 5, maxBoutiques: null, prixMensuel: null }],
  ] as [string, string, unknown][])("%s %s avec %j est refusé en 400, sans écriture ni journal", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps, "owner");
    expect(r.status).toBe(400);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemConfig.update).not.toHaveBeenCalled();
  });

  it("un commerçant inconnu donne 404 sans journal", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    for (const [methode, chemin, corps] of [
      ["patch", "/organizations/inconnue/tier", { tier: "PRO" }],
      ["patch", "/organizations/inconnue/commission-promo", { active: false }],
    ] as [string, string, unknown][]) {
      expect((await appeler(methode, chemin, corps, "owner")).status).toBe(404);
    }
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("un ticket inconnu donne 404 sans journal", async () => {
    db.merchantTicket.findUnique.mockResolvedValue(null);
    expect((await appeler("patch", "/support-tickets/inconnu/priority", { priority: "HIGH" }, "owner")).status).toBe(404);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});
