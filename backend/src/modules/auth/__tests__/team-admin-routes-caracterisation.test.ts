/**
 * Tests de caractérisation de l'équipe d'administration (/api/superowner/admins,
 * /roles, /me/permissions) : statuts, codes d'erreur, formes de réponse,
 * écritures Prisma et journal d'audit. Ils complètent `admin-escalade.test`
 * avant l'extraction de la logique vers un service (CLAUDE.md §5).
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  user: model("findUnique", "findMany", "count", "update"),
  accesEquipe: model("findUnique", "deleteMany", "upsert", "groupBy"),
  platformRole: model("findMany", "createMany"),
  systemAuditLog: model("create"),
};
db.$transaction = jest.fn(async (ops: any[]) => Promise.all(ops));
const oublierCompte = jest.fn();

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../auth.middleware", () => ({
  oublierCompte: (...a: any[]) => oublierCompte(...a),
  authMiddleware: (req: any, res: any, next: any) => {
    const who = req.headers.authorization?.replace("Bearer ", "");
    if (!["owner", "admin", "user", "sansrole"].includes(who)) return res.status(401).json({});
    req.userId = who;
    req.compte = {
      id: who, isSuperOwner: who === "owner", isSystemAdmin: who !== "user",
      acces: who === "admin" ? { EAT: "ADMIN" } : {},
    };
    next();
  },
}));

import teamRouter from "../team.admin.routes";
import { PermissionsPlateforme, oublierRoles } from "../permissions-plateforme.service";

const app = express();
app.use(express.json());
app.use("/api/superowner", teamRouter);
app.use((error: any, _req: any, res: any, _next: any) =>
  res.status(error.name === "ZodError" ? 400 : error.statusCode || 500).json({ code: error.code }));
const owner = (r: request.Test) => r.set("Authorization", "Bearer owner");

const ROLE_ADMIN = { code: "ADMIN", label: "Admin", permissions: { organizations: "write" } };

beforeEach(() => {
  jest.clearAllMocks();
  oublierRoles();
  for (const m of Object.values(db)) if (typeof m === "object") for (const f of Object.values(m as any)) (f as any).mockReset();
  db.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
  db.platformRole.findMany.mockResolvedValue([ROLE_ADMIN]);
  db.systemAuditLog.create.mockResolvedValue({});
});

describe("GET /admins", () => {
  it("liste paginée avec rôles et libellés par plateforme", async () => {
    db.user.findMany.mockResolvedValue([
      { id: "u1", email: "a@test.fr", name: null, isSuperOwner: false, status: "BANNED", updatedAt: new Date("2026-10-02T00:00:00Z"), createdAt: new Date("2026-10-01T00:00:00Z"), accesEquipe: [{ plateforme: "EAT", role: "ADMIN" }] },
      { id: "u0", email: "o@test.fr", name: "Owner", isSuperOwner: true, status: "ACTIVE", updatedAt: new Date("2026-10-02T00:00:00Z"), createdAt: new Date("2026-10-01T00:00:00Z"), accesEquipe: [] },
    ]);
    db.user.count.mockResolvedValue(2);
    const r = await owner(request(app).get("/api/superowner/admins?limit=5&offset=1"));
    expect(r.status).toBe(200);
    expect(r.body.pagination).toEqual({ total: 2, limit: 5, offset: 1 });
    expect(Array.isArray(r.body.plateformes)).toBe(true);
    expect(r.body.admins[0]).toMatchObject({
      id: "u1", email: "a@test.fr", name: "a@test.fr", role: "ADMIN", status: "SUSPENDED", lastLogin: "2026-10-02T00:00:00.000Z",
      acces: [{ plateforme: "EAT", role: "ADMIN", roleLabel: "Admin" }],
    });
    expect(r.body.admins[1]).toMatchObject({ role: "SUPEROWNER", acces: [] });
    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { OR: [{ isSystemAdmin: true }, { isSuperOwner: true }] }, skip: 1, take: 5, orderBy: { createdAt: "desc" },
      include: { accesEquipe: { select: { plateforme: true, role: true } } },
    });
  });
});

describe("POST /admins", () => {
  const promouvoir = (corps: any) => owner(request(app).post("/api/superowner/admins").send(corps));
  it("rôle inconnu → 400, compte inconnu → 404, déjà dans l'équipe → 400", async () => {
    let r = await promouvoir({ email: "x@test.fr", role: "INCONNU" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("UNKNOWN_ROLE");
    db.user.findUnique.mockResolvedValue(null);
    r = await promouvoir({ email: "x@test.fr", role: "ADMIN" });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("USER_NOT_FOUND");
    db.user.findUnique.mockResolvedValue({ id: "c", emailVerified: true, isSystemAdmin: true, isSuperOwner: false });
    r = await promouvoir({ email: "x@test.fr", role: "ADMIN" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("ALREADY_ADMIN");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("promeut, oublie le compte, journalise GRANT_ADMIN et rend le membre présenté", async () => {
    db.user.findUnique.mockResolvedValue({ id: "c", name: "Cible", emailVerified: true, isSystemAdmin: false, isSuperOwner: false });
    db.user.update.mockResolvedValue({
      id: "c", email: "c@test.fr", name: "Nouveau", isSuperOwner: false, status: "ACTIVE", updatedAt: new Date("2026-10-02T00:00:00Z"),
      createdAt: new Date("2026-10-01T00:00:00Z"), accesEquipe: [{ plateforme: "EAT", role: "ADMIN" }],
    });
    const r = await promouvoir({ email: "c@test.fr", name: "Nouveau", role: "ADMIN" });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.admin).toMatchObject({ id: "c", name: "Nouveau", role: "ADMIN", status: "ACTIVE" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "c" },
      data: { isSystemAdmin: true, name: "Nouveau", accesEquipe: { create: { plateforme: "EAT", role: "ADMIN" } } },
      include: { accesEquipe: { select: { plateforme: true, role: true } } },
    });
    expect(oublierCompte).toHaveBeenCalledWith("c");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "GRANT_ADMIN", target: "c", changes: { role: "ADMIN", plateforme: "EAT" } } });
  });
});

describe("DELETE /admins/:adminId", () => {
  const retirer = (id: string) => owner(request(app).delete(`/api/superowner/admins/${id}`));
  it("pas soi-même → 400, inconnu → 404, dernier superowner → 400", async () => {
    let r = await retirer("owner");
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("CANNOT_REVOKE_SELF");
    db.user.findUnique.mockResolvedValue(null);
    r = await retirer("x");
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("NOT_FOUND");
    db.user.findUnique.mockResolvedValue({ id: "so2", isSuperOwner: true });
    db.user.count.mockResolvedValue(0);
    r = await retirer("so2");
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("LAST_SUPEROWNER");
    expect(db.user.count).toHaveBeenCalledWith({ where: { isSuperOwner: true, id: { not: "so2" } } });
    expect(db.accesEquipe.deleteMany).not.toHaveBeenCalled();
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
  });
  it("retire les droits en transaction, oublie le compte, journalise REVOKE_ADMIN", async () => {
    db.user.findUnique.mockResolvedValue({ id: "c", isSuperOwner: false });
    const r = await retirer("c");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, message: "Droits d'administration retirés" });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.accesEquipe.deleteMany).toHaveBeenCalledWith({ where: { userId: "c" } });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "c" }, data: { isSystemAdmin: false, isSuperOwner: false } });
    expect(oublierCompte).toHaveBeenCalledWith("c");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "REVOKE_ADMIN", target: "c", changes: {} } });
  });
});

describe("rôles d'un membre", () => {
  const membre = { id: "c", isSystemAdmin: true, isSuperOwner: false };
  it("PATCH /admins/:id/role : rôle inconnu, soi-même, introuvable, superowner", async () => {
    const changer = (id: string, corps: any) => owner(request(app).patch(`/api/superowner/admins/${id}/role`).send(corps));
    expect((await changer("c", { role: "INCONNU" })).body.code).toBe("UNKNOWN_ROLE");
    expect((await changer("owner", { role: "ADMIN" })).body.code).toBe("CANNOT_CHANGE_SELF");
    db.user.findUnique.mockResolvedValue(null);
    let r = await changer("c", { role: "ADMIN" });
    expect(r.status).toBe(404);
    db.user.findUnique.mockResolvedValue({ id: "c", isSystemAdmin: true, isSuperOwner: true });
    r = await changer("c", { role: "ADMIN" });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("IS_SUPEROWNER");
    expect(db.accesEquipe.upsert).not.toHaveBeenCalled();
  });
  it("PATCH /admins/:id/role : upsert et journal avec l'ancien rôle", async () => {
    db.user.findUnique.mockResolvedValue(membre);
    db.accesEquipe.findUnique.mockResolvedValue({ role: "AUTRE" });
    const r = await owner(request(app).patch("/api/superowner/admins/c/role").send({ role: "ADMIN", plateforme: "EAT" }));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, plateforme: "EAT", role: "ADMIN" });
    expect(db.accesEquipe.upsert).toHaveBeenCalledWith({
      where: { userId_plateforme: { userId: "c", plateforme: "EAT" } }, create: { userId: "c", plateforme: "EAT", role: "ADMIN" }, update: { role: "ADMIN" },
    });
    expect(oublierCompte).toHaveBeenCalledWith("c");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "CHANGE_PLATFORM_ROLE", target: "c", changes: { plateforme: "EAT", avant: "AUTRE", apres: "ADMIN" } } });
  });
  it("DELETE /admins/:id/acces/:plateforme : 404 si aucun rôle, sinon journal", async () => {
    db.user.findUnique.mockResolvedValue(membre);
    db.accesEquipe.deleteMany.mockResolvedValue({ count: 0 });
    let r = await owner(request(app).delete("/api/superowner/admins/c/acces/EAT"));
    expect(r.status).toBe(404);
    expect(db.systemAuditLog.create).not.toHaveBeenCalled();
    db.accesEquipe.deleteMany.mockResolvedValue({ count: 1 });
    r = await owner(request(app).delete("/api/superowner/admins/c/acces/EAT"));
    expect(r.body).toEqual({ success: true });
    expect(db.accesEquipe.deleteMany).toHaveBeenLastCalledWith({ where: { userId: "c", plateforme: "EAT" } });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "REVOKE_PLATFORM_ROLE", target: "c", changes: { plateforme: "EAT" } } });
    expect((await owner(request(app).delete("/api/superowner/admins/c/acces/NOPE"))).status).toBe(400);
  });
});

describe("droits du compte connecté", () => {
  it("GET /me/permissions/plateformes : superowner, membre, sans accès", async () => {
    let r = await owner(request(app).get("/api/superowner/me/permissions/plateformes"));
    expect(r.body.isSuperOwner).toBe(true);
    expect(Object.values(r.body.plateformes)[0]).toMatchObject({ role: "SUPEROWNER" });
    r = await request(app).get("/api/superowner/me/permissions/plateformes").set("Authorization", "Bearer admin");
    expect(r.status).toBe(200);
    expect(r.body.isSuperOwner).toBe(false);
    expect(r.body.plateformes.EAT).toMatchObject({ role: "ADMIN", roleLabel: "Admin" });
    r = await request(app).get("/api/superowner/me/permissions/plateformes").set("Authorization", "Bearer sansrole");
    expect(r.status).toBe(403);
    r = await request(app).get("/api/superowner/me/permissions/plateformes").set("Authorization", "Bearer user");
    expect(r.status).toBe(403);
  });
  it("GET /me/permissions", async () => {
    let r = await owner(request(app).get("/api/superowner/me/permissions"));
    expect(r.body).toMatchObject({ isSuperOwner: true, plateforme: "EAT", role: "SUPEROWNER" });
    r = await request(app).get("/api/superowner/me/permissions").set("Authorization", "Bearer admin");
    expect(r.body).toEqual({ isSuperOwner: false, plateforme: "EAT", role: "ADMIN", roleLabel: "Admin", permissions: ROLE_ADMIN.permissions });
    expect((await request(app).get("/api/superowner/me/permissions").set("Authorization", "Bearer user")).status).toBe(403);
  });
});

describe("rôles de plateforme", () => {
  it("GET /roles : effectifs par rôle et rôles de base", async () => {
    db.accesEquipe.groupBy.mockResolvedValue([{ role: "ADMIN", _count: { _all: 3 } }]);
    const r = await owner(request(app).get("/api/superowner/roles?plateforme=EAT"));
    expect(r.status).toBe(200);
    expect(r.body.plateforme).toBe("EAT");
    expect(r.body.roles[0]).toMatchObject({ code: "ADMIN", label: "Admin", membres: 3, permissions: ROLE_ADMIN.permissions });
    expect(typeof r.body.roles[0].deBase).toBe("boolean");
    expect(Array.isArray(r.body.sections)).toBe(true);
    expect(db.accesEquipe.groupBy).toHaveBeenCalledWith({
      by: ["role"], where: { plateforme: "EAT", user: { isSystemAdmin: true, isSuperOwner: false } }, _count: { _all: true },
    });
  });
  it("PUT /roles/:code : inconnu → 404, sinon modifie et journalise", async () => {
    expect((await owner(request(app).put("/api/superowner/roles/INCONNU").send({ permissions: {} }))).status).toBe(404);
    const modifier = jest.spyOn(PermissionsPlateforme, "modifier").mockResolvedValue({ code: "ADMIN", label: "Admin", permissions: { organizations: "read" } } as any);
    const r = await owner(request(app).put("/api/superowner/roles/ADMIN?plateforme=EAT").send({ permissions: { organizations: "read" } }));
    expect(r.body).toEqual({ success: true, role: { code: "ADMIN", label: "Admin", permissions: { organizations: "read" } } });
    expect(modifier).toHaveBeenCalledWith("ADMIN", { organizations: "read" }, "EAT");
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "UPDATE_PLATFORM_ROLE_PERMISSIONS", target: "EAT:ADMIN", changes: { plateforme: "EAT", permissions: { organizations: "read" } } } });
    expect((await owner(request(app).put("/api/superowner/roles/ADMIN").send({ permissions: { x: "owner" } }))).status).toBe(400);
  });
  it("POST /roles puis DELETE /roles/:code journalisent", async () => {
    jest.spyOn(PermissionsPlateforme, "creer").mockResolvedValue({ code: "FACTURATION", label: "Facturation", permissions: {} } as any);
    let r = await owner(request(app).post("/api/superowner/roles?plateforme=EAT").send({ label: "Facturation" }));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ success: true, role: { code: "FACTURATION", label: "Facturation", permissions: {}, membres: 0, deBase: false } });
    expect(db.systemAuditLog.create).toHaveBeenCalledWith({ data: { adminId: "owner", action: "CREATE_PLATFORM_ROLE", target: "EAT:FACTURATION", changes: { plateforme: "EAT", label: "Facturation" } } });
    expect((await owner(request(app).post("/api/superowner/roles").send({ label: "x" }))).status).toBe(400);
    const supprimer = jest.spyOn(PermissionsPlateforme, "supprimer").mockResolvedValue(undefined as any);
    r = await owner(request(app).delete("/api/superowner/roles/ADMIN?plateforme=EAT"));
    expect(r.body).toEqual({ success: true });
    expect(supprimer).toHaveBeenCalledWith("ADMIN", "EAT");
    expect(db.systemAuditLog.create).toHaveBeenLastCalledWith({ data: { adminId: "owner", action: "DELETE_PLATFORM_ROLE", target: "EAT:ADMIN", changes: { plateforme: "EAT" } } });
    expect((await owner(request(app).delete("/api/superowner/roles/INCONNU"))).status).toBe(404);
  });
});
