import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// Un accès générique à la base : chaque méthode est un jest.fn, créé à la demande.
// Les tests précisent seulement ce dont ils ont besoin (compte, rôles, journal).
const tables: Record<string, Record<string, any>> = {};
const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (!tables[table]) {
      const methodes: Record<string, any> = {};
      tables[table] = new Proxy(methodes, {
        get(_methodes, methode: string) {
          if (!methodes[methode]) {
            methodes[methode] = jest.fn(async () =>
              methode === "findMany" ? [] : methode === "count" ? 0 : { id: "objet", title: "t", status: "OPEN", archivedAt: null });
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
// Seule la cryptographie du jeton est simulée : authMiddleware et exigerPermission sont réels.
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
jest.mock("../../monitoring/maintenance.middleware", () => ({ invalidateMaintenanceCache: jest.fn() }));
jest.mock("../../merchants/merchant-closure.service", () => ({ MerchantClosureService: {
  suspend: jest.fn(async () => ({ id: "org-a", status: "SUSPENDED" })),
  unsuspend: jest.fn(async () => ({ id: "org-a", status: "ACTIVE" })),
  close: jest.fn(async () => ({ archive: { id: "archive-a" } })),
  restoreFromBackup: jest.fn(async () => ({ id: "org-a", status: "ACTIVE" })),
} }));
jest.mock("../../support/ticket-message.service", () => ({ TicketMessageService: {
  add: jest.fn(async () => ({ id: "m1" })),
  archive: jest.fn(async () => ({ id: "t1" })),
  unarchive: jest.fn(async () => ({ id: "t1" })),
  notifierChangementEtat: jest.fn(async () => undefined),
} }));
jest.mock("../../marketing/announcement.service", () => ({
  PUBLICS_CONNUS: ["ALL", "MERCHANTS"],
  AnnouncementService: { diffuser: jest.fn(async () => ({ annonce: { id: "annonce-1" }, destinataires: 3 })) },
}));

import adminRouter from "../admin.routes";
import { errorHandler } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use(errorHandler);

const COMPTES: Record<string, any> = {
  client: { isSuperOwner: false, isSystemAdmin: false, accesEquipe: [] },
  support: { isSuperOwner: false, isSystemAdmin: true, accesEquipe: [{ plateforme: "EAT", role: "SUPPORT" }] },
  admin: { isSuperOwner: false, isSystemAdmin: true, accesEquipe: [{ plateforme: "EAT", role: "SUPER_ADMIN" }] },
  owner: { isSuperOwner: true, isSystemAdmin: true, accesEquipe: [] },
};

const appeler = (methode: string, chemin: string, corps?: unknown, qui?: string) => {
  const appel = (request(app) as any)[methode](`/api/admin${chemin}`);
  if (qui) appel.set("Authorization", `Bearer ${qui}`);
  return corps === undefined ? appel : appel.send(corps);
};

beforeEach(() => {
  db.user.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, email: `${where.id}@zup.test`, passwordChangedAt: null, status: "ACTIVE", ...COMPTES[where.id] }));
  db.platformRole.findMany.mockResolvedValue([
    { code: "SUPPORT", label: "Support", permissions: { "support-tickets": "write", notifications: "write", organizations: "read", stores: "read", dashboard: "read" } },
    { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: { "system-config": "write", organizations: "write", "organizations-close": "write", formules: "write", stores: "write", "support-tickets": "write", notifications: "write", exports: "write", dashboard: "write", "access-logs": "write", "audit-logs": "write", billing: "write" } },
  ]);
  db.systemAuditLog.create.mockResolvedValue({});
  db.systemConfig.findFirst.mockResolvedValue({ id: "cfg" });
  db.notification.findUnique.mockResolvedValue({ id: "annonce-1" });
});

// [méthode, chemin, corps, action attendue dans le journal (null = lecture)]
type Operation = [string, string, unknown, string | null];

const LECTURES: Operation[] = [
  ["get", "/config", undefined, null],
  ["get", "/merchants", undefined, null],
  ["get", "/merchants/org-a", undefined, null],
  ["get", "/stores", undefined, null],
  ["get", "/tickets", undefined, null],
  ["get", "/tickets/t1", undefined, null],
  ["get", "/tickets/t1/messages", undefined, null],
  ["get", "/commissions", undefined, null],
  ["get", "/access-logs", undefined, null],
  ["get", "/stats", undefined, null],
  ["get", "/audit-logs", undefined, null],
  ["get", "/notifications", undefined, null],
];

const MODIFICATIONS: Operation[] = [
  ["put", "/config", { maintenanceMode: false }, "UPDATE_SYSTEM_CONFIG"],
  ["patch", "/merchants/org-a", { tier: "PRO" }, "UPDATE_MERCHANT"],
  ["post", "/merchants/org-a/suspend", { reason: "fraude" }, "SUSPEND_MERCHANT"],
  ["post", "/merchants/org-a/unsuspend", {}, "UNSUSPEND_MERCHANT"],
  ["post", "/merchants/org-a/close", { reason: "demande" }, "CLOSE_MERCHANT"],
  ["post", "/merchants/org-a/restore-from-backup", {}, "RESTORE_MERCHANT"],
  ["patch", "/tickets/t1", { status: "RESOLVED" }, "UPDATE_TICKET"],
  ["post", "/tickets/t1/messages", { body: "Bonjour" }, "REPLY_TICKET"],
  ["post", "/tickets/t1/archive", {}, "ARCHIVE_TICKET"],
  ["post", "/tickets/t1/unarchive", {}, "UNARCHIVE_TICKET"],
  ["post", "/notifications", { title: "Info", message: "Maintenance ce soir" }, "BROADCAST_ANNOUNCEMENT"],
  ["delete", "/notifications/annonce-1", undefined, "DELETE_ANNOUNCEMENT"],
];

describe("administration : l'authentification est exigée sur chaque route", () => {
  it.each([...LECTURES, ...MODIFICATIONS, ["patch", "/notifications/annonce-1/read", undefined, null] as Operation])(
    "%s %s sans jeton → 401, et rien n'est lu ni écrit",
    async (methode, chemin, corps) => {
      const r = await appeler(methode, chemin, corps);
      expect(r.status).toBe(401);
      expect(db.systemAuditLog.create).not.toHaveBeenCalled();
      expect(db.platformRole.findMany).not.toHaveBeenCalled();
    }
  );

  it("un jeton falsifié est refusé comme l'absence de jeton", async () => {
    const r = await appeler("get", "/config", undefined, "forge");
    expect(r.status).toBe(401);
  });

  it("un jeton valide d'un compte supprimé ou suspendu est refusé en 401", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await appeler("get", "/config", undefined, "admin")).status).toBe(401);
    db.user.findUnique.mockResolvedValue({ id: "admin", status: "SUSPENDED", isSystemAdmin: true, isSuperOwner: false, accesEquipe: [] });
    expect((await appeler("get", "/config", undefined, "admin")).status).toBe(401);
  });
});

describe("administration : un client sans rôle d'équipe est refusé en 403", () => {
  it.each([...LECTURES, ...MODIFICATIONS])("%s %s → 403", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps, "client");
    expect(r.status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemConfig.update).not.toHaveBeenCalled();
  });
});

describe("administration : un rôle Support ne modifie que les sections qui lui sont ouvertes", () => {
  const interdites: Operation[] = MODIFICATIONS.filter(([, chemin]) =>
    chemin.startsWith("/config") || chemin.startsWith("/merchants"));

  it.each(interdites)("%s %s → 403 pour le Support (lecture seule ou section fermée)", async (methode, chemin, corps) => {
    const r = await appeler(methode, chemin, corps, "support");
    expect(r.status).toBe(403);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });

  it("le Support ne lit pas la configuration système ni les rapports hors de son périmètre", async () => {
    for (const chemin of ["/config", "/commissions", "/audit-logs", "/access-logs"]) {
      expect((await appeler("get", chemin, undefined, "support")).status).toBe(403);
    }
  });

  it("le Support lit les commerces (lecture ouverte) mais ne les modifie pas", async () => {
    expect((await appeler("get", "/merchants", undefined, "support")).status).toBe(200);
    expect((await appeler("patch", "/merchants/org-a", { tier: "PRO" }, "support")).status).toBe(403);
  });

  it("le Support traite les tickets : l'action est autorisée et journalisée", async () => {
    const r = await appeler("patch", "/tickets/t1", { priority: "HIGH" }, "support");
    expect(r.status).toBe(200);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "support", action: "UPDATE_TICKET", target: "t1" }) });
  });

  it("la fermeture d'un commerce exige sa section propre, même avec « organizations »", async () => {
    db.platformRole.findMany.mockResolvedValue([{ code: "SUPPORT", label: "Support", permissions: { organizations: "write" } }]);
    for (const segment of ["close", "CLOSE", "restore-from-backup"]) {
      const r = await appeler("post", `/merchants/org-a/${segment}`, { reason: "x" }, "support");
      expect(r.status).toBe(403);
    }
  });
});

describe("administration : chaque modification est journalisée (qui, quoi, sur quelle ressource)", () => {
  it.each(MODIFICATIONS)("%s %s par un administrateur → journal %s", async (methode, chemin, corps, action) => {
    const r = await appeler(methode, chemin, corps, "admin");
    expect(r.status).toBeLessThan(300);
    expect(db.systemAuditLog.create).toHaveBeenCalledTimes(1);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "admin", action }) });
  });

  it("le superowner passe partout et reste journalisé sous son identité", async () => {
    const r = await appeler("post", "/merchants/org-a/suspend", { reason: "fraude" }, "owner");
    expect(r.status).toBe(200);
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ adminId: "owner", action: "SUSPEND_MERCHANT", target: "org-a", changes: { reason: "fraude" } }) });
  });

  it("une donnée invalide est refusée avant toute écriture et sans journal", async () => {
    const r = await appeler("post", "/merchants/org-a/suspend", { reason: "" }, "admin");
    expect(r.status).toBe(400);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });

  it("le statut d'un commerce ne se change pas par le PATCH historique", async () => {
    const r = await appeler("patch", "/merchants/org-a", { status: "ACTIVE" }, "admin");
    expect(r.status).toBe(400);
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });

  it("une suppression d'annonce sur un identifiant inconnu est un 404 sans effet", async () => {
    db.notification.findUnique.mockResolvedValue(null);
    const r = await appeler("delete", "/notifications/inconnue", undefined, "admin");
    expect(r.status).toBe(404);
    expect(db.notification.delete).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
});
