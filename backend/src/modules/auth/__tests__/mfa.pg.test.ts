import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import { generate } from "otplib";
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
import { db } from "../../../services/db";
import { MfaService, exigerMfa, MFA_RECENT_MS } from "../mfa.service";
import { recoverMfaOperator } from "../mfa-operator.service";
import { AuthService } from "../auth.service";
import { SsoService } from "../sso.service";
import { authMiddleware } from "../auth.middleware";
import { exigerPermission } from "../permissions-plateforme.service";
import { compteSocket } from "../../realtime/socket-access";
import mfaRouter from "../mfa.routes";
import { errorHandler } from "../../../middleware/errorHandler";
import { redact } from "../../privacy/redaction";

const enabled = process.env.MFA_INTEGRATION === "true" && new URL(process.env.DATABASE_URL!).pathname.includes("test");
const suite = enabled ? describe : describe.skip;
const app = express(); app.use(express.json());
app.use("/api/auth/mfa", mfaRouter);
app.get("/api/auth/me", authMiddleware, (_req, res) => res.json({ ok: true }));
app.use("/api/superowner", authMiddleware, exigerPermission("superowner"), (_req, res) => res.json({ ok: true }));
app.use("/api/zupdrive", authMiddleware, exigerPermission("zupdrive", "DRIVE", "courses-drive"), (_req, res) => res.json({ ok: true }));
app.use(errorHandler);
let id: string, secret: string, session: Awaited<ReturnType<typeof SsoService.connecter>>, codes: string[];
let passwordHash: string;
const password = "MfaTestOnly123!";
const otp = (offset = 0) => generate({ secret, epoch: Math.floor(Date.now() / 1000) + offset });
const call = (method: "get" | "post", path: string, token = session.accessToken) => request(app)[method](path).set("Authorization", `Bearer ${token}`);
async function enroll() {
  secret = (await MfaService.begin(id, session.sid, password)).secret;
  codes = (await MfaService.check(id, session.sid, await otp(-30), "confirm")).recoveryCodes!;
}

suite("A05 MFA PostgreSQL et API directe", () => {
  beforeAll(async () => {
    process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ mfaTest: Buffer.alloc(32, 97).toString("base64") });
    process.env.DATA_ENCRYPTION_ACTIVE_KEY = "mfaTest";
    passwordHash = await AuthService.hashPassword(password);
    await db.platformRole.upsert({ where: { plateforme_code: { plateforme: "EAT", code: "MFA_TEST" } },
      create: { plateforme: "EAT", code: "MFA_TEST", label: "MFA test", permissions: { dashboard: "read", billing: "write", payouts: "write" } }, update: {} });
    process.env.SSO_ORIGIN = "https://zupone.com";
    process.env.ALLOWED_ORIGINS = "https://manager.zupone.com,https://manager.zupdrive.com";
  });
  beforeEach(async () => {
    process.env.MFA_MODE = "enforced";
    const user = await db.user.create({ data: { email: `a05-${Date.now()}-${Math.random()}@example.test`, passwordHash, isSystemAdmin: true,
      accesEquipe: { create: { plateforme: "EAT", role: "MFA_TEST" } } } });
    id = user.id; session = await SsoService.connecter(id);
  });
  afterEach(async () => {
    const events = await db.securityEvent.findMany({ where: { action: { startsWith: "MFA_" } } });
    await db.securityEvent.deleteMany({ where: { id: { in: events.filter((e) => e.target === id).map((e) => e.id) } } });
    await db.user.delete({ where: { id } });
  });
  afterAll(async () => { await db.platformRole.delete({ where: { plateforme_code: { plateforme: "EAT", code: "MFA_TEST" } } }); await db.$disconnect(); });

  it("mot de passe seul et session ancienne : aucun accès privilégié, préparation accessible", async () => {
    expect((await call("get", "/api/superowner/dashboard")).body.code).toBe("MFA_ENROLLMENT_REQUIRED");
    expect((await call("get", "/api/auth/me")).status).toBe(200);
    expect((await call("get", "/api/auth/mfa")).headers["cache-control"]).toBe("no-store");
    await enroll();
    const old = await SsoService.connecter(id);
    expect((await call("post", "/api/superowner/billing", old.accessToken)).body.code).toBe("MFA_REQUIRED");
    expect((await call("get", "/api/superowner/dashboard", AuthService.generateAccessToken(id))).body.code).toBe("MFA_REQUIRED");
  });
  it("activation confirme un vrai facteur, chiffre le secret et hache dix codes", async () => {
    await enroll(); const factor = await db.mfaFactor.findUniqueOrThrow({ where: { userId: id } });
    expect(factor.secretCipher).toMatch(/^zupenc:v1:/); expect(factor.secretCipher).not.toContain(secret);
    expect(factor.recoveryHashes).toHaveLength(10); expect(factor.recoveryHashes).not.toContain(codes[0]);
    const status = (await call("get", "/api/auth/mfa")).body;
    expect(status.verified).toBe(true); expect(JSON.stringify(status)).not.toContain(secret);
    expect((await call("post", "/api/superowner/billing")).status).toBe(200);
  });
  it("le superowner sans rôle de plateforme ne contourne pas le second facteur", async () => {
    await db.user.update({ where: { id }, data: { isSuperOwner: true, isSystemAdmin: false } });
    expect((await call("get", "/api/superowner/dashboard")).body.code).toBe("MFA_ENROLLMENT_REQUIRED");
    await enroll();
    expect((await call("post", "/api/zupdrive/admin/payments")).status).toBe(200);
  });
  it("activation liée à la session, limitée à dix minutes et non confirmable sans code", async () => {
    secret = (await MfaService.begin(id, session.sid, password)).secret;
    const other = await SsoService.connecter(id);
    await expect(MfaService.check(id, other.sid, await otp(), "confirm")).rejects.toMatchObject({ code: "MFA_INVALID" });
    await db.mfaFactor.update({ where: { userId: id }, data: { pendingExpiresAt: new Date(Date.now() - 1) } });
    await expect(MfaService.check(id, session.sid, await otp(), "confirm")).rejects.toMatchObject({ code: "MFA_INVALID" });
    expect((await MfaService.status(id, session.sid)).enabled).toBe(false);
  });
  it("facteur erroné et expiré ne créent pas de preuve", async () => {
    await enroll(); const other = await SsoService.connecter(id);
    await expect(MfaService.check(id, other.sid, "abcdef", "totp")).rejects.toMatchObject({ code: "MFA_INVALID" });
    await expect(MfaService.check(id, other.sid, await otp(-120), "totp")).rejects.toMatchObject({ code: "MFA_INVALID" });
    expect((await MfaService.status(id, other.sid)).verified).toBe(false);
  });
  it("un même TOTP concurrent : une seule réussite, rejet sur une autre session", async () => {
    await enroll(); const other = await SsoService.connecter(id); const token = await otp();
    const results = await Promise.allSettled([MfaService.check(id, session.sid, token, "totp"), MfaService.check(id, other.sid, token, "totp")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(MfaService.check(id, session.sid, token, "totp")).rejects.toMatchObject({ code: "MFA_INVALID" });
  });
  it("le code d'activation est déjà consommé pour la connexion", async () => {
    secret = (await MfaService.begin(id, session.sid, password)).secret; const token = await otp();
    await MfaService.check(id, session.sid, token, "confirm");
    await expect(MfaService.check(id, session.sid, token, "totp")).rejects.toMatchObject({ code: "MFA_INVALID" });
  });
  it("cinq échecs verrouillent toutes les sessions, redémarrer l'inscription ne remet pas le compteur à zéro", async () => {
    secret = (await MfaService.begin(id, session.sid, password)).secret;
    for (let i = 0; i < 5; i++) await expect(MfaService.check(id, session.sid, "abcdef", "confirm")).rejects.toMatchObject({ code: "MFA_INVALID" });
    await MfaService.begin(id, session.sid, password);
    const other = await SsoService.connecter(id);
    await expect(MfaService.check(id, other.sid, await otp(), "confirm")).rejects.toMatchObject({ code: "MFA_LOCKED" });
    expect((await db.securityEvent.findMany({ where: { action: "MFA_FAILED" } })).filter((e) => e.target === id)).toHaveLength(5);
  });
  it("action financière et export après cinq minutes : nouveau TOTP exigé", async () => {
    await enroll(); await db.sessionConnexion.update({ where: { id: session.sid }, data: { mfaVerifiedAt: new Date(Date.now() - MFA_RECENT_MS - 1) } });
    expect((await call("get", "/api/superowner/dashboard")).status).toBe(200);
    expect((await call("post", "/api/superowner/billing")).body.code).toBe("MFA_RECENT_REQUIRED");
    expect((await call("get", "/api/superowner/payouts")).body.code).toBe("MFA_RECENT_REQUIRED");
    await MfaService.check(id, session.sid, await otp(), "totp");
    expect((await call("post", "/api/superowner/billing")).status).toBe(200);
  });
  it("la MFA SSO conserve la fraîcheur entre domaines, aucun nouvel accès DRIVE", async () => {
    await enroll(); const code = await SsoService.creerCode(session.sid, "https://manager.zupdrive.com");
    const result = await SsoService.echangerCode(code, "https://manager.zupdrive.com");
    const token = AuthService.generateAccessToken(result.userId, result.sid);
    expect((await call("get", "/api/superowner/dashboard", token)).status).toBe(200);
    expect((await call("get", "/api/zupdrive/admin/stats", token)).status).toBe(403);
    await expect(SsoService.echangerCode(code, "https://manager.zupdrive.com")).rejects.toMatchObject({ code: "SSO_CODE_INVALIDE" });
  });
  it("le retrait de droits reste effectif après une MFA", async () => {
    await enroll(); await db.accesEquipe.deleteMany({ where: { userId: id } });
    expect((await call("get", "/api/superowner/dashboard")).body.code).toBe("FORBIDDEN");
    await db.user.update({ where: { id }, data: { isSystemAdmin: false } });
    expect((await call("get", "/api/superowner/dashboard")).status).toBe(403);
  });
  it("récupération concurrente : un code une seule fois, les autres sessions ferment", async () => {
    await enroll(); const other = await SsoService.connecter(id);
    const result = await Promise.allSettled([MfaService.check(id, session.sid, codes[0], "recovery"), MfaService.check(id, other.sid, codes[0], "recovery")]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.mfaFactor.findUniqueOrThrow({ where: { userId: id } })).recoveryHashes).toHaveLength(9);
    const winner = result[0].status === "fulfilled" ? session.sid : other.sid;
    await expect(exigerMfa(id, winner)).rejects.toMatchObject({ code: "MFA_ROTATION_REQUIRED" });
    await expect(MfaService.check(id, winner, await otp(), "totp")).rejects.toMatchObject({ code: "MFA_ROTATION_REQUIRED" });
    secret = (await MfaService.begin(id, winner, password)).secret;
    await MfaService.check(id, winner, await otp(-30), "confirm");
    await expect(exigerMfa(id, winner, true)).resolves.toBeUndefined();
    await expect(MfaService.check(id, winner, codes[1], "recovery")).rejects.toMatchObject({ code: "MFA_INVALID" });
  });
  it("rotation exige la MFA récente, invalide l'ancien facteur et ses sessions", async () => {
    await enroll(); const oldSecret = secret; const other = await SsoService.connecter(id);
    await expect(MfaService.begin(id, other.sid, password)).rejects.toMatchObject({ code: "MFA_RECENT_REQUIRED" });
    secret = (await MfaService.begin(id, session.sid, password)).secret;
    await MfaService.check(id, session.sid, await otp(-30), "confirm");
    expect(await SsoService.sessionActive(other.sid)).toBe(false);
    await expect(MfaService.check(id, session.sid, await generate({ secret: oldSecret }), "totp")).rejects.toMatchObject({ code: "MFA_INVALID" });
  });
  it("révocation ferme immédiatement HTTP, SSO et temps réel, même en mode enrôlement", async () => {
    await enroll(); const payload = AuthService.verifyAccessToken(session.accessToken);
    expect(await compteSocket(payload)).not.toBeNull(); await MfaService.revoke(id, session.sid);
    expect(await compteSocket(payload)).toBeNull(); expect((await call("get", "/api/superowner/dashboard")).status).toBe(401);
    process.env.MFA_MODE = "enrollment"; const other = await SsoService.connecter(id);
    await expect(exigerMfa(id, other.sid)).rejects.toMatchObject({ code: "MFA_ENROLLMENT_REQUIRED" });
  });
  it("secours opérateur impose deux identités et trace le ticket, puis exige un nouvel enrôlement", async () => {
    await enroll(); await expect(recoverMfaOperator({ userId: id, ticket: "INC-123", verifier: "ops-a", approver: "ops-a" })).rejects.toThrow();
    await recoverMfaOperator({ userId: id, ticket: "INC-123", verifier: "ops-a", approver: "ops-b" });
    expect(await SsoService.sessionActive(session.sid)).toBe(false);
    const other = await SsoService.connecter(id); await expect(exigerMfa(id, other.sid)).rejects.toMatchObject({ code: "MFA_ENROLLMENT_REQUIRED" });
    expect((await db.securityEvent.findMany({ where: { action: "MFA_OPERATOR_RECOVERY" } })).filter((e) => e.target === id)).toHaveLength(1);
  });
  it("la période préparatoire ne laisse passer que les comptes jamais enrôlés", async () => {
    process.env.MFA_MODE = "enrollment"; await expect(exigerMfa(id, session.sid)).resolves.toBeUndefined();
    await enroll(); const other = await SsoService.connecter(id);
    await expect(exigerMfa(id, other.sid)).rejects.toMatchObject({ code: "MFA_REQUIRED" });
  });
  it("les métadonnées expurgent code, secret, récupération et enveloppe", () => {
    expect(redact({ code: "123456", secret: "ABC", recoveryCodes: ["DEF"], pendingCipher: "cipher" })).toEqual({ code: "[masqué]", secret: "[masqué]", recoveryCodes: "[masqué]", pendingCipher: "[masqué]" });
  });
});
