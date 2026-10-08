import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const COMPTES: Record<string, any> = {
  alice: { isSuperOwner: false, isSystemAdmin: false },
  bob: { isSuperOwner: false, isSystemAdmin: false },
  admin: { isSuperOwner: false, isSystemAdmin: true },
  owner: { isSuperOwner: true, isSystemAdmin: true },
};
const db: any = {
  user: { findUnique: jest.fn() },
  privacyLegalHold: { upsert: jest.fn() },
};
type MockAsync = jest.Mock<(...args: any[]) => Promise<any>>;
const recordAudit = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../middleware/throttle", () => ({ limiterCadence: () => (_req: any, _res: any, next: any) => next() }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));
jest.mock("../../auth/auth.service", () => ({ AuthService: {
  verifyAccessToken: (jeton: string) => {
    if (!COMPTES[jeton]) {
      const { ApiError } = jest.requireActual("../../../middleware/errorHandler") as any;
      throw new ApiError(401, "Jeton invalide", "INVALID_TOKEN");
    }
    return { userId: jeton, sid: `session-${jeton}` };
  },
  comparePassword: async (mot: string, hash: string) => hash === `hash:${mot}`,
} }));
jest.mock("../audit", () => ({
  recordAudit: (...args: any[]) => recordAudit(...args),
  actorHash: (id: string) => `hash-acteur:${id}`,
}));
jest.mock("../export.service", () => ({
  collectExport: jest.fn(async (userId: string) => ({ profile: { id: userId }, generatedAt: "2026-10-08" })),
  exportSummary: jest.fn(() => Buffer.from("%PDF-resume")),
  exportZip: jest.fn(async () => Buffer.from("PK-zip")),
}));
jest.mock("../erasure.service", () => ({ requestErasure: jest.fn() }));

import privacyRouter from "../privacy.routes";
import { collectExport, exportSummary, exportZip } from "../export.service";
import { requestErasure } from "../erasure.service";
import { errorHandler, ApiError } from "../../../middleware/errorHandler";

const app = express();
app.use(express.json());
app.use("/api/privacy", privacyRouter);
app.use(errorHandler);

const MOT_DE_PASSE = "Secret-Correct-1!";
const appeler = (methode: string, chemin: string, corps?: unknown, qui?: string) => {
  const appel = (request(app) as any)[methode](`/api/privacy${chemin}`);
  if (qui) appel.set("Authorization", `Bearer ${qui}`);
  return corps === undefined ? appel : appel.send(corps);
};
const actions = () => recordAudit.mock.calls.map(([, action, , issue]) => `${action}:${issue ?? "AUTHORIZED"}`);

beforeEach(() => {
  recordAudit.mockResolvedValue(undefined);
  db.user.findUnique.mockImplementation(async ({ where, select }: any) => {
    if (!COMPTES[where.id]) return null;
    // authMiddleware lit le compte, la réauthentification lit le hash du mot de passe.
    return select?.passwordHash
      ? { passwordHash: `hash:${MOT_DE_PASSE}`, status: "ACTIVE" }
      : { id: where.id, status: "ACTIVE", passwordChangedAt: null, accesEquipe: [], ...COMPTES[where.id] };
  });
  db.privacyLegalHold.upsert.mockResolvedValue({ id: "hold-1" });
  (requestErasure as MockAsync).mockResolvedValue({ status: "COMPLETED" });
});

describe("exportation des données personnelles", () => {
  it("refuse l'appel anonyme et n'écrit aucune trace", async () => {
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE });
    expect(r.status).toBe(401);
    expect(collectExport).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("exige une réauthentification : un mauvais mot de passe ne livre rien", async () => {
    const r = await appeler("post", "/export", { password: "mauvais" }, "alice");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("REAUTHENTICATION_REQUIRED");
    expect(collectExport).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it.each(["DELETION_PENDING", "DELETED", "SUSPENDED"])("un compte au statut %s ne peut plus exporter", async status => {
    db.user.findUnique.mockImplementation(async ({ where, select }: any) =>
      select?.passwordHash ? { passwordHash: `hash:${MOT_DE_PASSE}`, status } : { id: where.id, status: "ACTIVE", ...COMPTES[where.id], accesEquipe: [] });
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE }, "alice");
    expect(r.status).toBe(403);
    expect(collectExport).not.toHaveBeenCalled();
  });

  it("n'exporte que le compte du jeton : un userId dans le corps est refusé (schéma strict)", async () => {
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE, userId: "bob" }, "alice");
    expect(r.status).toBe(400);
    expect(collectExport).not.toHaveBeenCalled();
  });

  it("exporte l'identité du jeton, jamais celle d'un paramètre de requête", async () => {
    const r = await appeler("post", "/export?userId=bob", { password: MOT_DE_PASSE, format: "json" }, "alice");
    expect(r.status).toBe(200);
    expect(collectExport).toHaveBeenCalledWith("alice");
    expect(JSON.parse(r.text).profile.id).toBe("alice");
  });

  it.each([
    ["json", "application/json", "zupone-donnees.json"],
    ["pdf", "application/pdf", "zupone-donnees.pdf"],
    ["zip", "application/zip", "zupone-donnees.zip"],
  ])("format %s : type, pièce jointe et aucun cache", async (format, type, fichier) => {
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE, format }, "alice");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain(type);
    expect(r.headers["content-disposition"]).toBe(`attachment; filename="${fichier}"`);
    expect(r.headers["cache-control"]).toBe("private, no-store");
  });

  it("le ZIP est le format par défaut et reçoit l'appelant pour contrôler l'accès aux pièces", async () => {
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE }, "alice");
    expect(r.status).toBe(200);
    expect(exportZip).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "alice" }));
    expect(exportSummary).not.toHaveBeenCalled();
  });

  it("refuse un format inconnu", async () => {
    expect((await appeler("post", "/export", { password: MOT_DE_PASSE, format: "xml" }, "alice")).status).toBe(400);
    expect(collectExport).not.toHaveBeenCalled();
  });

  it("trace la tentative avant la collecte puis le succès", async () => {
    await appeler("post", "/export", { password: MOT_DE_PASSE, format: "json" }, "alice");
    expect(actions()).toEqual(["PERSONAL_DATA_EXPORT:ATTEMPT", "PERSONAL_DATA_EXPORT:SUCCESS"]);
    expect(recordAudit.mock.calls[0].slice(0, 3)).toEqual(["alice", "PERSONAL_DATA_EXPORT", "alice"]);
  });

  it("un export en échec laisse la tentative mais jamais de succès", async () => {
    (collectExport as MockAsync).mockRejectedValueOnce(new ApiError(413, "Export trop volumineux", "EXPORT_TOO_LARGE"));
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE, format: "json" }, "alice");
    expect(r.status).toBe(413);
    expect(actions()).toEqual(["PERSONAL_DATA_EXPORT:ATTEMPT"]);
  });

  it("échec fermé : sans trace d'audit, aucune donnée n'est collectée", async () => {
    recordAudit.mockRejectedValueOnce(new Error("base d'audit indisponible"));
    const r = await appeler("post", "/export", { password: MOT_DE_PASSE, format: "json" }, "alice");
    expect(r.status).toBe(500);
    expect(collectExport).not.toHaveBeenCalled();
  });
});

describe("suppression du compte", () => {
  it("refuse l'appel anonyme", async () => {
    expect((await appeler("delete", "/account", { password: MOT_DE_PASSE })).status).toBe(401);
    expect(requestErasure).not.toHaveBeenCalled();
  });

  it("exige le mot de passe : un jeton volé ne suffit pas à effacer un compte", async () => {
    const r = await appeler("delete", "/account", { password: "mauvais" }, "alice");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("REAUTHENTICATION_REQUIRED");
    expect(requestErasure).not.toHaveBeenCalled();
  });

  it("refuse l'absence de mot de passe et tout champ supplémentaire (cible désignée par le corps)", async () => {
    expect((await appeler("delete", "/account", {}, "alice")).status).toBe(400);
    expect((await appeler("delete", "/account", { password: MOT_DE_PASSE, userId: "bob" }, "alice")).status).toBe(400);
    expect(requestErasure).not.toHaveBeenCalled();
  });

  it("efface le compte du jeton, jamais un autre", async () => {
    const r = await appeler("delete", "/account?userId=bob", { password: MOT_DE_PASSE }, "alice");
    expect(r.status).toBe(200);
    expect(requestErasure).toHaveBeenCalledTimes(1);
    expect(requestErasure).toHaveBeenCalledWith("alice");
    expect(r.headers["cache-control"]).toBe("no-store");
  });

  it("répond 202 quand le dernier versement retarde l'effacement complet", async () => {
    (requestErasure as MockAsync).mockResolvedValue({ status: "WAITING_FINAL_PAYMENT" });
    const r = await appeler("delete", "/account", { password: MOT_DE_PASSE }, "alice");
    expect(r.status).toBe(202);
    expect(r.body.data.status).toBe("WAITING_FINAL_PAYMENT");
    expect(r.body.message).toContain("accès est révoqué");
  });

  it("propage le refus métier quand une commande ou course est en cours", async () => {
    (requestErasure as MockAsync).mockRejectedValue(new ApiError(409, "Terminez ou annulez les commandes", "ACTIVITY_IN_PROGRESS"));
    const r = await appeler("delete", "/account", { password: MOT_DE_PASSE }, "alice");
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ACTIVITY_IN_PROGRESS");
  });
});

describe("conservation légale (legal holds)", () => {
  const corps = { password: MOT_DE_PASSE, model: "Order", recordId: "order-1", reason: "LITIGATION", days: 30 };

  it("refuse l'appel anonyme", async () => {
    expect((await appeler("post", "/legal-holds", corps)).status).toBe(401);
  });

  it.each(["alice", "admin"])("%s (même administrateur système) ne peut pas poser de gel : réservé au superowner", async qui => {
    const r = await appeler("post", "/legal-holds", corps, qui);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("FORBIDDEN");
    expect(db.privacyLegalHold.upsert).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("le superowner doit aussi se réauthentifier", async () => {
    const r = await appeler("post", "/legal-holds", { ...corps, password: "mauvais" }, "owner");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("REAUTHENTICATION_REQUIRED");
    expect(db.privacyLegalHold.upsert).not.toHaveBeenCalled();
  });

  it("pose le gel, avec l'acteur haché et une échéance, et le trace", async () => {
    const avant = Date.now();
    const r = await appeler("post", "/legal-holds", corps, "owner");
    expect(r.status).toBe(200);
    const appel = db.privacyLegalHold.upsert.mock.calls[0][0];
    expect(appel.where).toEqual({ model_recordId: { model: "Order", recordId: "order-1" } });
    expect(appel.create.createdBy).toBe("hash-acteur:owner");
    expect(appel.create.createdBy).not.toBe("owner");
    const jours = (appel.create.expiresAt.getTime() - avant) / 86400000;
    expect(jours).toBeGreaterThan(29.9);
    expect(jours).toBeLessThan(30.1);
    expect(actions()).toEqual(["LEGAL_HOLD_CREATE:ATTEMPT", "LEGAL_HOLD_CREATE:SUCCESS"]);
  });

  it.each([
    [{ model: "User" }],
    [{ model: "Payment" }],
    [{ reason: "CURIOSITE" }],
    [{ days: 0 }],
    [{ days: 366 }],
    [{ days: 1.5 }],
    [{ recordId: "" }],
    [{ extra: "champ inconnu" }],
  ])("refuse la demande invalide %j sans écriture", async surcharge => {
    const r = await appeler("post", "/legal-holds", { ...corps, ...surcharge }, "owner");
    expect(r.status).toBe(400);
    expect(db.privacyLegalHold.upsert).not.toHaveBeenCalled();
  });
});
