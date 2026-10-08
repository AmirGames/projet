/**
 * Tests de caractérisation de /api/auth, pour les routes que `auth.integration`
 * et `session-rotation` ne couvrent pas : profil, rôles, devenir commerçant ou
 * livreur, inscription commerçant, mot de passe, confirmation d'adresse.
 *
 * Ils figent le contrat (statuts, codes d'erreur, formes de réponse, écritures
 * Prisma) pour que l'extraction de la logique vers des services (CLAUDE.md §5)
 * reste sans effet pour le frontend et les applications mobiles. Ils ne
 * dépendent pas du fichier qui porte chaque route.
 */
import request from "supertest";
import express from "express";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const model = (...methods: string[]) => Object.fromEntries(methods.map((m) => [m, jest.fn()]));
const db: any = {
  user: model("findUnique", "create", "update"),
  customer: model("findUnique", "create"),
  courier: model("findUnique", "create"),
  organization: model("findUnique", "create"),
  membership: model("create", "update"),
  sessionConnexion: model("updateMany"),
};
db.$transaction = jest.fn(async (fn: any) => fn(db));

const sendEmailVerification = jest.fn(async (..._a: any[]) => undefined);
const sendPasswordReset = jest.fn(async (..._a: any[]) => undefined);
const recordSecurityEvent = jest.fn(async (..._a: any[]) => undefined);

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock("../../../middleware/throttle", () => {
  const passer = (_req: any, _res: any, next: any) => next();
  return {
    limiterCadence: () => passer,
    limiterConnexions: Object.assign(passer, { reinitialiser: jest.fn(async () => undefined) }),
    limiterAuthParIp: passer,
    limiterCourrielsParIp: passer,
    limiterInscriptions: passer,
    parDestinataire: () => "",
  };
});
jest.mock("../sso.service", () => ({
  SsoService: {
    connecter: jest.fn(async () => ({ accessToken: "acces", refreshToken: "renouvellement" })),
    emettreRefresh: jest.fn(async () => "refresh-neuf"),
  },
}));
jest.mock("../security-event.service", () => ({ SecurityEventService: { record: (...a: any[]) => recordSecurityEvent(...a) } }));
jest.mock("../../notifications/email.service", () => ({
  EmailService: {
    sendEmailVerification: (...a: any[]) => sendEmailVerification(...a),
    sendPasswordReset: (...a: any[]) => sendPasswordReset(...a),
  },
}));
jest.mock("../../legal/acceptation-conditions.service", () => {
  const { z } = jest.requireActual("zod") as typeof import("zod");
  return { champAcceptation: { conditionsAcceptees: z.literal(true) }, enregistrerAcceptation: jest.fn(async () => undefined) };
});
jest.mock("../compte-connecte", () => ({ compteConnecte: jest.fn(async (id: string) => ({ user: { id } })) }));
jest.mock("../../customers/fiche-client.service", () => ({ rattacherFicheInvite: jest.fn(async () => undefined) }));
jest.mock("../../stores/store.service", () => ({
  StoreService: { create: jest.fn(async (d: any) => ({ id: "store-1", name: d.name, slug: d.slug })) },
}));
jest.mock("../auth.middleware", () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    const id = req.headers.authorization?.replace("Bearer ", "");
    if (!["alice", "alice-sans-sid"].includes(id)) return res.status(401).json({});
    req.userId = id === "alice" ? "user-alice" : "user-alice";
    req.user = { userId: "user-alice", sid: id === "alice" ? "sid-1" : undefined };
    req.compte = { acces: {} };
    next();
  },
  compteDuJeton: jest.fn(),
  jetonPerime: jest.fn(),
  oublierCompte: jest.fn(),
}));

import authRouter from "../auth.routes";
import authInscriptionsRouter from "../auth.inscriptions.routes";
import authMotDePasseRouter from "../auth.motdepasse.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { AuthService } from "../auth.service";
import { UserService } from "../user.service";
import { AccountTokenService } from "../account-token.service";
import { StoreService } from "../../stores/store.service";
import { rattacherFicheInvite } from "../../customers/fiche-client.service";
import { enregistrerAcceptation } from "../../legal/acceptation-conditions.service";
import { SsoService } from "../sso.service";

const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/auth", authInscriptionsRouter);
app.use("/api/auth", authMotDePasseRouter);
app.use(errorHandler);

const alice = (r: request.Test) => r.set("Authorization", "Bearer alice");
const attendre = () => new Promise((r) => setImmediate(r));
const MDP = "MotDePasse123!";

const commercant = {
  businessName: "Chez Test", storeName: "Chez Test", storeSlug: "chez-test", businessType: "restaurant", cuisineType: "italien",
  phone: "0612345678", address: "1 rue A", city: "Lyon", postalCode: "69000", description: "Bon",
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const m of Object.values(db)) if (m && typeof m === "object") for (const f of Object.values(m as any)) (f as any).mockReset?.();
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
  process.env.NODE_ENV = "test";
  jest.spyOn(AuthService, "hashPassword").mockResolvedValue("hash" as any);
  jest.spyOn(AuthService, "comparePassword").mockResolvedValue(true as any);
  jest.spyOn(AuthService, "generateAccessToken").mockReturnValue("acces-neuf" as any);
  jest.spyOn(UserService, "getUserById").mockResolvedValue({ id: "user-alice", email: "alice@test.fr", name: "Alice", isSuperOwner: false, isSystemAdmin: false, emailVerified: true } as any);
  jest.spyOn(UserService, "getUserOrganizations").mockResolvedValue([
    { role: "ADMIN", org: { id: "org-1", name: "Chez Test", status: "ACTIVE", suspensionReason: null, closureReason: null } },
  ] as any);
});

describe("GET /demo", () => {
  it("indique si la démo est activée", async () => {
    const r = await request(app).get("/api/auth/demo");
    expect(r.status).toBe(200);
    expect(typeof r.body.enabled).toBe("boolean");
  });
});

describe("POST /signup, /login, /logout, /refresh : cas hors tests existants", () => {
  it("signup : adresse déjà prise → 409 EMAIL_EXISTS (confirmation non exigée)", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", email: "a@test.fr" });
    const r = await request(app).post("/api/auth/signup").send({ email: "a@test.fr", name: "Alice Test", password: MDP, conditionsAcceptees: true });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EMAIL_EXISTS");
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("signup : conditions non acceptées → 400 sans création", async () => {
    const r = await request(app).post("/api/auth/signup").send({ email: "a@test.fr", name: "A", password: MDP });
    expect(r.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("logout sans jeton → 200 { success: true }", async () => {
    const r = await request(app).post("/api/auth/logout").send({});
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true });
  });
  it("refresh sans jeton → 400", async () => {
    const r = await request(app).post("/api/auth/refresh").send({});
    expect(r.status).toBe(400);
  });
});

describe("GET /me et /me/roles", () => {
  it("sans jeton → 401", async () => {
    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect((await request(app).get("/api/auth/me/roles")).status).toBe(401);
  });
  it("GET /me", async () => {
    const r = await alice(request(app).get("/api/auth/me"));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      user: { id: "user-alice", email: "alice@test.fr", name: "Alice", isSuperOwner: false, isSystemAdmin: false, emailVerified: true },
      organizations: [{ id: "org-1", name: "Chez Test", role: "ADMIN", status: "ACTIVE", suspensionReason: null, closureReason: null }],
    });
  });
  it("GET /me/roles : client, livreur et commerçant", async () => {
    db.courier.findUnique.mockResolvedValue({ id: "driver-1", status: "PENDING" });
    db.customer.findUnique.mockResolvedValue({ id: "cust-1" });
    const r = await alice(request(app).get("/api/auth/me/roles"));
    expect(r.status).toBe(200);
    expect(r.body.user).toEqual({
      id: "user-alice", email: "alice@test.fr", isSuperOwner: false, isSystemAdmin: false, platformRole: null, platformRoleLabel: null, accesEquipe: [],
    });
    expect(r.body.roles).toEqual({
      customer: { active: true, customerId: "cust-1" },
      driver: { active: true, driverId: "driver-1", status: "PENDING" },
      merchant: { active: true, organizations: [{ id: "org-1", name: "Chez Test", role: "ADMIN" }] },
    });
    expect(db.courier.findUnique).toHaveBeenCalledWith({ where: { userId: "user-alice" }, select: { id: true, status: true } });
    expect(db.customer.findUnique).toHaveBeenCalledWith({ where: { userId: "user-alice" }, select: { id: true } });
  });
  it("GET /me/roles : aucun rôle", async () => {
    db.courier.findUnique.mockResolvedValue(null);
    db.customer.findUnique.mockResolvedValue(null);
    (UserService.getUserOrganizations as any).mockResolvedValue([]);
    const r = await alice(request(app).get("/api/auth/me/roles"));
    expect(r.body.roles).toEqual({
      customer: { active: false, customerId: null },
      driver: { active: false, driverId: null, status: null },
      merchant: { active: false, organizations: [] },
    });
  });
});

describe("POST /me/become-merchant", () => {
  const post = (corps: any) => alice(request(app).post("/api/auth/me/become-merchant").send(corps));
  it("sans jeton → 401", async () => {
    expect((await request(app).post("/api/auth/me/become-merchant").send(commercant)).status).toBe(401);
  });
  it("corps invalide → 400, type inconnu → 400 INVALID_BUSINESS_TYPE, URL prise → 400 SLUG_EXISTS", async () => {
    expect((await post({ businessName: "x" })).status).toBe(400);
    let r = await post({ ...commercant, businessType: "zzz-inconnu", cuisineType: null });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_BUSINESS_TYPE");
    db.organization.findUnique.mockResolvedValue({ id: "org-x" });
    r = await post(commercant);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("SLUG_EXISTS");
    expect(db.organization.create).not.toHaveBeenCalled();
  });
  it("crée organisation, adhésion, boutique et rattache la boutique", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    db.organization.create.mockResolvedValue({ id: "org-9", name: "Chez Test", slug: "chez-test" });
    const r = await post(commercant);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      message: "Rôle de commerçant activé avec succès",
      organization: { id: "org-9", name: "Chez Test", slug: "chez-test" },
      store: { id: "store-1", name: "Chez Test", slug: "chez-test" },
    });
    expect(db.organization.create).toHaveBeenCalledWith({
      data: { name: "Chez Test", email: "alice@test.fr", slug: "chez-test", tier: "FREE", plan: "STARTER", status: "ACTIVE", approvedAt: null },
    });
    expect(db.membership.create).toHaveBeenCalledWith({ data: { userId: "user-alice", orgId: "org-9", role: "ADMIN", storeIds: [] } });
    expect(StoreService.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-9", slug: "chez-test", email: "alice@test.fr", businessType: expect.any(String) }));
    expect(db.membership.update).toHaveBeenCalledWith({ where: { userId_orgId: { userId: "user-alice", orgId: "org-9" } }, data: { storeIds: ["store-1"] } });
  });
  it("un super-propriétaire voit son commerce approuvé d'office", async () => {
    (UserService.getUserById as any).mockResolvedValue({ id: "user-alice", email: "alice@test.fr", isSuperOwner: true });
    db.organization.findUnique.mockResolvedValue(null);
    db.organization.create.mockResolvedValue({ id: "org-9", name: "x", slug: "chez-test" });
    await post(commercant);
    expect(db.organization.create).toHaveBeenCalledWith({ data: expect.objectContaining({ approvedAt: expect.any(Date) }) });
  });
});

describe("POST /me/become-driver", () => {
  const corps = { phone: "0612345678", vehicleType: "bike", vehiclePlate: "AB-123" };
  it("session sans sid → 401 SESSION_INVALIDE", async () => {
    const r = await request(app).post("/api/auth/me/become-driver").set("Authorization", "Bearer alice-sans-sid").send(corps);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("SESSION_INVALIDE");
  });
  it("profil livreur existant → 400 DRIVER_EXISTS ; e-mail pris → 409 EMAIL_EXISTS", async () => {
    db.courier.findUnique.mockResolvedValueOnce({ id: "d" });
    let r = await alice(request(app).post("/api/auth/me/become-driver").send(corps));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("DRIVER_EXISTS");
    db.courier.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "d2" });
    r = await alice(request(app).post("/api/auth/me/become-driver").send(corps));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EMAIL_EXISTS");
    expect(db.courier.create).not.toHaveBeenCalled();
  });
  it("crée la candidature et réémet les jetons dans la même session", async () => {
    db.courier.findUnique.mockResolvedValue(null);
    db.courier.create.mockResolvedValue({ id: "d3", name: "Alice", status: "PENDING" });
    const r = await alice(request(app).post("/api/auth/me/become-driver").send(corps));
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      message: "Candidature de livreur soumise avec succès",
      accessToken: "acces-neuf",
      refreshToken: "refresh-neuf",
      driver: { id: "d3", name: "Alice", status: "PENDING" },
    });
    expect(db.courier.create).toHaveBeenCalledWith({
      data: { userId: "user-alice", name: "Alice", email: "alice@test.fr", phone: "0612345678", vehicleType: "bike", vehiclePlate: "AB-123", licensePlate: "AB-123", status: "PENDING" },
    });
    expect(AuthService.generateAccessToken).toHaveBeenCalledWith("user-alice", "sid-1");
    expect(SsoService.emettreRefresh).toHaveBeenCalledWith("user-alice", "sid-1");
  });
});

describe("POST /merchant-register", () => {
  const corps = { ...commercant, email: "pro@test.fr", password: MDP, conditionsAcceptees: true, country: "BE", website: "https://chez.test" };
  it("e-mail pris → 400 EMAIL_EXISTS ; URL prise → 400 SLUG_EXISTS ; type inconnu → 400", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u" });
    let r = await request(app).post("/api/auth/merchant-register").send(corps);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("EMAIL_EXISTS");
    db.user.findUnique.mockResolvedValue(null);
    db.organization.findUnique.mockResolvedValue({ id: "o" });
    r = await request(app).post("/api/auth/merchant-register").send(corps);
    expect(r.body.code).toBe("SLUG_EXISTS");
    r = await request(app).post("/api/auth/merchant-register").send({ ...corps, businessType: "zzz", cuisineType: null });
    expect(r.body.code).toBe("INVALID_BUSINESS_TYPE");
    expect(db.user.create).not.toHaveBeenCalled();
  });
  it("inscription complète → 201", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.organization.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "u9", email: "pro@test.fr", name: "Chez Test", isSuperOwner: false, isSystemAdmin: false });
    db.organization.create.mockResolvedValue({ id: "o9", name: "Chez Test", slug: "chez-test" });
    const r = await request(app).post("/api/auth/merchant-register").send(corps);
    expect(r.status).toBe(201);
    expect(r.body).toEqual({
      message: "Inscription réussie et boutique créée!",
      accessToken: "acces",
      refreshToken: "renouvellement",
      user: { id: "u9", email: "pro@test.fr", name: "Chez Test", isSuperOwner: false, isSystemAdmin: false },
      organization: { id: "o9", name: "Chez Test", slug: "chez-test" },
      store: { id: "store-1", name: "Chez Test", slug: "chez-test", url: "/store/chez-test" },
      organizationId: "o9",
    });
    expect(db.user.create).toHaveBeenCalledWith({ data: { email: "pro@test.fr", name: "Chez Test", passwordHash: "hash", emailVerified: false, status: "ACTIVE" } });
    expect(enregistrerAcceptation).toHaveBeenCalledWith(expect.anything(), { email: "pro@test.fr", userId: "u9", documents: ["cgu", "conditions-commercants", "confidentialite"] });
    expect(db.organization.create).toHaveBeenCalledWith({
      data: { name: "Chez Test", email: "pro@test.fr", slug: "chez-test", tier: "FREE", plan: "STARTER", status: "ACTIVE", billingCountry: "Belgique", approvedAt: null },
    });
    expect(StoreService.create).toHaveBeenCalledWith(expect.objectContaining({ settings: { website: "https://chez.test" } }));
    expect(db.membership.update).toHaveBeenCalledWith({ where: { userId_orgId: { userId: "u9", orgId: "o9" } }, data: { storeIds: ["store-1"] } });
    expect(SsoService.connecter).toHaveBeenCalledWith("u9");
  });
});

describe("POST /forgot-password", () => {
  it("adresse inconnue ou compte inactif : même réponse, rien d'écrit", async () => {
    const attendu = { message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'y être envoyé." };
    db.user.findUnique.mockResolvedValueOnce(null);
    let r = await request(app).post("/api/auth/forgot-password").send({ email: "Inconnu@Test.fr" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual(attendu);
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: "inconnu@test.fr" }, select: { id: true, email: true, name: true, status: true } });
    db.user.findUnique.mockResolvedValueOnce({ id: "u", email: "u@test.fr", name: "U", status: "SUSPENDED" });
    r = await request(app).post("/api/auth/forgot-password").send({ email: "u@test.fr" });
    expect(r.body).toEqual(attendu);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(sendPasswordReset).not.toHaveBeenCalled();
  });
  it("compte actif : empreinte du jeton enregistrée, lien envoyé, évènement de sécurité", async () => {
    db.user.findUnique.mockResolvedValue({ id: "u", email: "u@test.fr", name: "U", status: "ACTIVE" });
    const r = await request(app).post("/api/auth/forgot-password").send({ email: "u@test.fr" });
    expect(r.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { resetTokenHash: expect.any(String), resetTokenExpiresAt: expect.any(Date) } });
    await attendre();
    const lien = String(sendPasswordReset.mock.calls[0][2]);
    const jeton = new URL(lien).searchParams.get("jeton")!;
    expect(lien).toContain("/reinitialiser?jeton=");
    expect((db.user.update.mock.calls[0][0] as any).data.resetTokenHash).toBe(AccountTokenService.empreinte(jeton));
    expect(recordSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "PASSWORD_RESET_REQUESTED", actor: "u@test.fr", severity: "LOW" }));
  });
  it("e-mail invalide → 400", async () => {
    expect((await request(app).post("/api/auth/forgot-password").send({ email: "pas-un-mail" })).status).toBe(400);
  });
});

describe("POST /reset-password", () => {
  const jeton = "a".repeat(40);
  const envoyer = (corps: any = { jeton, password: MDP }) => request(app).post("/api/auth/reset-password").send(corps);
  const compte = (extra: any = {}) => ({
    id: "u", email: "u@test.fr", name: "U", status: "ACTIVE",
    resetTokenHash: AccountTokenService.empreinte(jeton), resetTokenExpiresAt: new Date(Date.now() + 60_000), ...extra,
  });
  it("jeton inconnu, non correspondant ou expiré → 400 INVALID_RESET_TOKEN", async () => {
    db.user.findUnique.mockResolvedValue(null);
    let r = await envoyer();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_RESET_TOKEN");
    db.user.findUnique.mockResolvedValue(compte({ resetTokenExpiresAt: new Date(Date.now() - 1000) }));
    r = await envoyer();
    expect(r.body.code).toBe("INVALID_RESET_TOKEN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("compte désactivé → 403 ACCOUNT_DISABLED", async () => {
    db.user.findUnique.mockResolvedValue(compte({ status: "SUSPENDED" }));
    const r = await envoyer();
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("ACCOUNT_DISABLED");
  });
  it("jeton trop court → 400", async () => {
    expect((await envoyer({ jeton: "court", password: MDP })).status).toBe(400);
  });
  it("réinitialise en transaction, ferme les sessions, rattache la fiche invité", async () => {
    db.user.findUnique.mockResolvedValue(compte());
    const r = await envoyer();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u" },
      data: {
        passwordHash: "hash", passwordChangedAt: expect.any(Date), resetTokenHash: null, resetTokenExpiresAt: null,
        emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null,
      },
    });
    expect(db.sessionConnexion.updateMany).toHaveBeenCalledWith({ where: { userId: "u", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(rattacherFicheInvite).toHaveBeenCalledWith(expect.objectContaining({ id: "u" }));
    expect(recordSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "PASSWORD_RESET", severity: "HIGH" }));
  });
});

describe("POST /change-password", () => {
  const envoyer = (corps: any) => alice(request(app).post("/api/auth/change-password").send(corps));
  it("sans jeton → 401", async () => {
    expect((await request(app).post("/api/auth/change-password").send({})).status).toBe(401);
  });
  it("mot de passe actuel faux → 400 INVALID_CURRENT_PASSWORD", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-alice", email: "alice@test.fr", passwordHash: "h" });
    (AuthService.comparePassword as any).mockResolvedValue(false);
    const r = await envoyer({ currentPassword: "faux", newPassword: MDP });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("compte absent ou sans mot de passe → 400 INVALID_CURRENT_PASSWORD", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await envoyer({ currentPassword: "x", newPassword: MDP })).body.code).toBe("INVALID_CURRENT_PASSWORD");
  });
  it("nouveau identique à l'actuel → 400 SAME_PASSWORD", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-alice", email: "alice@test.fr", passwordHash: "h" });
    const r = await envoyer({ currentPassword: MDP, newPassword: MDP });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("SAME_PASSWORD");
  });
  it("change en transaction, ferme toutes les sessions", async () => {
    db.user.findUnique.mockResolvedValue({ id: "user-alice", email: "alice@test.fr", passwordHash: "h" });
    const r = await envoyer({ currentPassword: "Ancien123!", newPassword: MDP });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Mot de passe modifié. Toutes vos sessions ont été déconnectées." });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-alice" },
      data: { passwordHash: "hash", passwordChangedAt: expect.any(Date), resetTokenHash: null, resetTokenExpiresAt: null },
    });
    expect(db.sessionConnexion.updateMany).toHaveBeenCalledWith({ where: { userId: "user-alice", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(recordSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "PASSWORD_CHANGED", severity: "MEDIUM" }));
  });
});

describe("POST /verify-email", () => {
  const jeton = "b".repeat(40);
  const envoyer = (corps: any = { jeton }) => request(app).post("/api/auth/verify-email").send(corps);
  const compte = (extra: any = {}) => ({
    id: "u", email: "u@test.fr", emailTokenHash: AccountTokenService.empreinte(jeton), emailTokenExpiresAt: new Date(Date.now() + 60_000), ...extra,
  });
  it("jeton inconnu → 400 INVALID_EMAIL_TOKEN ; expiré → 400 EXPIRED_EMAIL_TOKEN", async () => {
    db.user.findUnique.mockResolvedValue(null);
    let r = await envoyer();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_EMAIL_TOKEN");
    db.user.findUnique.mockResolvedValue(compte({ emailTokenExpiresAt: new Date(Date.now() - 1000) }));
    r = await envoyer();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("EXPIRED_EMAIL_TOKEN");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("confirme l'adresse et rattache la fiche invité", async () => {
    db.user.findUnique.mockResolvedValue(compte());
    const r = await envoyer();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: "Adresse confirmée.", email: "u@test.fr" });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { emailVerified: true, emailTokenHash: null, emailTokenExpiresAt: null } });
    expect(rattacherFicheInvite).toHaveBeenCalledWith(expect.objectContaining({ id: "u" }));
  });
});

describe("POST /resend-verification", () => {
  const GENERIQUE = { message: "Si un compte existe pour cette adresse et n'est pas encore confirmé, un lien vient d'y être envoyé." };
  it("ni session ni adresse → 400 MISSING_EMAIL", async () => {
    const r = await request(app).post("/api/auth/resend-verification").send({});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("MISSING_EMAIL");
  });
  it("sans session : réponse générique, lien seulement pour un compte actif non confirmé", async () => {
    db.user.findUnique.mockResolvedValueOnce(null);
    let r = await request(app).post("/api/auth/resend-verification").send({ email: "x@test.fr" });
    expect(r.body).toEqual(GENERIQUE);
    expect(db.user.update).not.toHaveBeenCalled();
    db.user.findUnique.mockResolvedValueOnce({ id: "u", email: "x@test.fr", name: "X", emailVerified: false, status: "ACTIVE" });
    r = await request(app).post("/api/auth/resend-verification").send({ email: "X@test.fr" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual(GENERIQUE);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u" }, data: { emailTokenHash: expect.any(String), emailTokenExpiresAt: expect.any(Date) } });
    await attendre();
    expect(sendEmailVerification).toHaveBeenCalledWith("x@test.fr", "X", expect.stringContaining("/verifier-email?jeton="));
    expect(db.user.findUnique).toHaveBeenLastCalledWith({ where: { email: "x@test.fr" }, select: { id: true, email: true, name: true, emailVerified: true, status: true } });
  });
  it("connecté : précis (déjà confirmée / nouveau lien / compte introuvable)", async () => {
    const envoyer = () => alice(request(app).post("/api/auth/resend-verification").send({}));
    db.user.findUnique.mockResolvedValueOnce({ id: "user-alice", email: "alice@test.fr", name: "A", emailVerified: true, status: "ACTIVE" });
    let r = await envoyer();
    expect(r.body).toEqual({ message: "Votre adresse est déjà confirmée.", emailVerified: true });
    db.user.findUnique.mockResolvedValueOnce({ id: "user-alice", email: "alice@test.fr", name: "A", emailVerified: false, status: "ACTIVE" });
    r = await envoyer();
    expect(r.body).toEqual({ message: "Un nouveau lien vient de vous être envoyé.", emailVerified: false });
    expect(db.user.update).toHaveBeenCalledTimes(1);
    db.user.findUnique.mockResolvedValueOnce(null);
    r = await envoyer();
    expect(r.status).toBe(404);
    expect(r.body.code).toBe("USER_NOT_FOUND");
  });
});
