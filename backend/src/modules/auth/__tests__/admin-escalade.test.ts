import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const db: any = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  platformRole: { findMany: jest.fn(), createMany: jest.fn() },
  systemAuditLog: { create: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../auth.middleware", () => ({ oublierCompte: jest.fn(), authMiddleware: (req: any, res: any, next: any) => {
  const who = req.headers.authorization?.replace("Bearer ", "");
  if (!["owner", "admin", "user"].includes(who)) return res.status(401).json({});
  req.userId = who;
  req.compte = { id: who, isSuperOwner: who === "owner", isSystemAdmin: who !== "user", acces: who === "admin" ? { EAT: "SUPER_ADMIN" } : {} };
  next();
} }));
import teamRouter from "../team.admin.routes";
import { exigerPermission, oublierRoles } from "../permissions-plateforme.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", teamRouter);
app.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({ code: error.code }));

beforeEach(() => {
  oublierRoles();
  db.platformRole.findMany.mockResolvedValue([{ code: "ADMIN", label: "Admin", permissions: { organizations: "write" } }, { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: { organizations: "write" } }]);
  db.user.findUnique.mockResolvedValue({ id: "cible", email: "cible@example.test", emailVerified: true, isSystemAdmin: false, isSuperOwner: false });
  db.user.update.mockImplementation(async ({ data }: any) => ({ id: "cible", email: "cible@example.test", status: "ACTIVE", ...data, accesEquipe: [{ plateforme: "EAT", role: "ADMIN" }] }));
});

describe("équipe : aucune élévation par un utilisateur ou un administrateur", () => {
  const operations: [string, string, any][] = [
    ["post", "/admins", { email: "cible@example.test", role: "SUPER_ADMIN" }],
    ["patch", "/admins/cible/role", { role: "SUPER_ADMIN" }],
    ["delete", "/admins/cible", {}],
    ["put", "/roles/ADMIN", { permissions: { "system-config": "write" } }],
    ["post", "/roles", { label: "Nouveau" }],
  ];
  it.each(operations)("%s %s refuse sans token, utilisateur et SuperAdmin", async (method, path, body) => {
    for (const who of [undefined, "user", "admin"]) {
      const call = (request(app) as any)[method](`/api/superowner${path}`).send(body);
      if (who) call.set("Authorization", `Bearer ${who}`);
      expect((await call).status).toBe(who ? 403 : 401);
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("même le propriétaire ne promeut pas une adresse non confirmée", async () => {
    db.user.findUnique.mockResolvedValue({ id: "cible", emailVerified: false });
    const r = await request(app).post("/api/superowner/admins").set("Authorization", "Bearer owner").send({ email: "cible@example.test" });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("USER_EMAIL_NOT_VERIFIED");
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("le propriétaire promeut un compte confirmé et l'action est journalisée", async () => {
    const r = await request(app).post("/api/superowner/admins").set("Authorization", "Bearer owner").send({ email: "cible@example.test", role: "ADMIN", plateforme: "EAT", isSuperOwner: true });
    expect(r.status).toBe(201);
    const written = db.user.update.mock.calls[0][0].data;
    expect(written.isSystemAdmin).toBe(true);
    expect(written.isSuperOwner).toBeUndefined();
    expect(db.systemAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ adminId: "owner", action: "GRANT_ADMIN", target: "cible" }) }));
  });
  it("on ne crée pas un autre superowner via une promotion", async () => {
    const r = await request(app).post("/api/superowner/admins").set("Authorization", "Bearer owner").send({ email: "cible@example.test", role: "SUPEROWNER" });
    expect(r.status).toBe(409);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("HTTP Express : la casse ne contourne pas le droit de fermeture", () => {
  it.each(["close", "CLOSE", "ClOsE"])("%s garde la permission spécifique", async segment => {
    const protectedApp = express();
    protectedApp.use((req: any, _res: any, next: any) => { req.compte = { isSystemAdmin: true, acces: { EAT: "ADMIN" } }; next(); });
    protectedApp.use(exigerPermission("superowner"));
    protectedApp.post("/organizations/:id/close", (_req, res) => res.json({ closed: true }));
    protectedApp.use((error: any, _req: any, res: any, _next: any) => res.status(error.statusCode || 500).json({}));
    expect((await request(protectedApp).post(`/organizations/IdAbC/${segment}`)).status).toBe(403);
    db.platformRole.findMany.mockResolvedValue([{ code: "ADMIN", label: "Admin", permissions: { "organizations-close": "write" } }]);
    oublierRoles();
    expect((await request(protectedApp).post(`/organizations/IdAbC/${segment}`)).status).toBe(200);
  });
});
