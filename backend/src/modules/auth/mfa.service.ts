import { createHash, randomBytes } from "node:crypto";
import { generateSecret, verify } from "otplib";
import { db } from "../../services/db";
import { encrypt, decrypt } from "../privacy/crypto";
import { ApiError } from "../../middleware/errorHandler";
import { AuthService } from "./auth.service";

export const MFA_RECENT_MS = 5 * 60_000;
const invalid = () => new ApiError(403, "Facteur incorrect, expiré ou déjà utilisé.", "MFA_INVALID");
const hash = (userId: string, code: string) => createHash("sha256").update(`mfa:${userId}:${code}`).digest("hex");
const context = (userId: string) => `mfa:${userId}`;
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** La preuve est en base, jamais dans un JWT ni dans le stockage d'un client. */
export async function exigerMfa(userId: string, sid: string | undefined, recent = false) {
  const factor = await db.mfaFactor.findUnique({ where: { userId } });
  if (!factor?.enabled && !factor?.version && process.env.MFA_MODE !== "enforced") return;
  if (!factor?.enabled) throw new ApiError(403, "Inscrivez votre second facteur.", "MFA_ENROLLMENT_REQUIRED");
  const session = sid ? await db.sessionConnexion.findUnique({ where: { id: sid } }) : null;
  if (!session || session.userId !== userId || session.revokedAt || session.expiresAt <= new Date() ||
      !session.mfaVerifiedAt || session.mfaVersion !== factor.version) {
    throw new ApiError(403, "Confirmez votre second facteur.", "MFA_REQUIRED");
  }
  if (recent && (session.mfaRecovery || Date.now() - session.mfaVerifiedAt.getTime() > MFA_RECENT_MS)) {
    throw new ApiError(403, "Un code TOTP récent est nécessaire.", "MFA_RECENT_REQUIRED");
  }
  if (session.mfaRecovery) throw new ApiError(403, "Remplacez le facteur après récupération.", "MFA_ROTATION_REQUIRED");
}

async function audit(tx: Tx, userId: string, action: string, status = "SUCCESS") {
  await tx.securityEvent.create({ data: { actor: userId, target: userId, action, status, severity: "HIGH", details: "" } });
}

/** Le verrou utilisateur couvre aussi l'enrôlement initial et les sessions concurrentes. */
async function locked<T>(userId: string, sid: string, work: (tx: Tx) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } });
    const session = await tx.sessionConnexion.findUnique({ where: { id: sid } });
    if (!user || user.status !== "ACTIVE" || !session || session.userId !== userId || session.revokedAt ||
        session.expiresAt <= new Date() || (user.passwordChangedAt && session.createdAt < user.passwordChangedAt)) {
      throw new ApiError(401, "Session invalide.", "SESSION_INVALIDE");
    }
    return work(tx);
  });
}

async function proof(tx: Tx, sid: string, version: number, recovery = false) {
  await tx.sessionConnexion.update({ where: { id: sid }, data: { mfaVerifiedAt: new Date(), mfaVersion: version, mfaRecovery: recovery } });
}

async function recentForManagement(tx: Tx, sid: string, version: number) {
  const session = await tx.sessionConnexion.findUniqueOrThrow({ where: { id: sid } });
  if (!session.mfaVerifiedAt || session.mfaVersion !== version || Date.now() - session.mfaVerifiedAt.getTime() > MFA_RECENT_MS) {
    throw new ApiError(403, "Confirmez votre second facteur avant cette opération.", "MFA_RECENT_REQUIRED");
  }
}

export const MfaService = {
  async status(userId: string, sid?: string) {
    const factor = await db.mfaFactor.findUnique({ where: { userId }, select: { enabled: true, version: true } });
    const session = sid ? await db.sessionConnexion.findUnique({ where: { id: sid } }) : null;
    const verified = !!factor?.enabled && !!session && session.userId === userId && !session.revokedAt && session.expiresAt > new Date() &&
      session.mfaVersion === factor.version && !!session.mfaVerifiedAt;
    return { enabled: !!factor?.enabled, required: !!factor?.enabled || !!factor?.version || process.env.MFA_MODE === "enforced",
      verified, recent: verified && !session!.mfaRecovery && Date.now() - session!.mfaVerifiedAt!.getTime() <= MFA_RECENT_MS,
      recovery: verified && session!.mfaRecovery };
  },

  async begin(userId: string, sid: string, password: string) {
    return locked(userId, sid, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
      if (!await AuthService.comparePassword(password, user.passwordHash)) throw invalid();
      const factor = await tx.mfaFactor.upsert({ where: { userId }, create: { userId, recoveryHashes: [] }, update: {} });
      if (factor.enabled) await recentForManagement(tx, sid, factor.version);
      const secret = generateSecret();
      await tx.mfaFactor.update({ where: { userId }, data: { pendingCipher: encrypt(secret, context(userId)),
        pendingSession: sid, pendingExpiresAt: new Date(Date.now() + 10 * 60_000) } });
      await audit(tx, userId, "MFA_ENROLLMENT_STARTED");
      // Livraison exceptionnelle, une seule fois et exclusivement dans le corps no-store.
      return { secret, expiresIn: 600 };
    });
  },

  async check(userId: string, sid: string, token: string, kind: "totp" | "recovery" | "confirm") {
    const result = await locked(userId, sid, async (tx) => {
      const factor = await tx.mfaFactor.findUnique({ where: { userId } });
      if (!factor) return { error: invalid() };
      if (kind === "totp" && (await tx.sessionConnexion.findUniqueOrThrow({ where: { id: sid } })).mfaRecovery) {
        return { error: new ApiError(403, "Remplacez le facteur après récupération.", "MFA_ROTATION_REQUIRED") };
      }
      if (factor.lockedUntil && factor.lockedUntil > new Date()) {
        return { error: new ApiError(429, "Trop de tentatives MFA.", "MFA_LOCKED") };
      }
      const pending = kind === "confirm";
      const cipher = pending ? factor.pendingCipher : factor.secretCipher;
      const pendingValid = !!factor.pendingExpiresAt && factor.pendingExpiresAt > new Date() && factor.pendingSession === sid;
      let step: number | undefined;
      let recoveryIndex = -1;
      if (kind === "recovery" && factor.enabled) recoveryIndex = factor.recoveryHashes.indexOf(hash(userId, token));
      else if (cipher && (pending ? pendingValid : factor.enabled) && /^\d{6}$/.test(token)) {
        const checked = await verify({ secret: decrypt(cipher, context(userId)).toString(), token,
          epochTolerance: [30, 0], ...(pending || factor.lastStep < 0 ? {} : { afterTimeStep: factor.lastStep }) });
        if (checked.valid && "timeStep" in checked) step = checked.timeStep;
      }
      if (step === undefined && recoveryIndex < 0) {
        const failures = factor.lockedUntil ? 1 : factor.failures + 1;
        await tx.mfaFactor.update({ where: { userId }, data: { failures,
          lockedUntil: failures >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
        await audit(tx, userId, "MFA_FAILED", "FAILED");
        return { error: invalid() };
      }
      if (pending) {
        if (factor.enabled) await recentForManagement(tx, sid, factor.version);
        const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString("hex"));
        const version = factor.version + 1;
        await tx.mfaFactor.update({ where: { userId }, data: { enabled: true, version, secretCipher: cipher,
          lastStep: step, pendingCipher: null, pendingSession: null, pendingExpiresAt: null,
          recoveryHashes: recoveryCodes.map((c) => hash(userId, c)), failures: 0, lockedUntil: null } });
        await tx.sessionConnexion.updateMany({ where: { userId, id: { not: sid }, revokedAt: null }, data: { revokedAt: new Date() } });
        await proof(tx, sid, version);
        await audit(tx, userId, factor.enabled ? "MFA_ROTATED" : "MFA_ENABLED");
        return { recoveryCodes };
      }
      const recovery = kind === "recovery";
      await tx.mfaFactor.update({ where: { userId }, data: { failures: 0, lockedUntil: null,
        ...(recovery ? { recoveryHashes: factor.recoveryHashes.filter((_, i) => i !== recoveryIndex) } : { lastStep: step }) } });
      if (recovery) await tx.sessionConnexion.updateMany({ where: { userId, id: { not: sid }, revokedAt: null }, data: { revokedAt: new Date() } });
      await proof(tx, sid, factor.version, recovery);
      await audit(tx, userId, recovery ? "MFA_RECOVERED" : "MFA_VERIFIED");
      return { ok: true };
    });
    // Hors transaction : les échecs et compteurs doivent être committés.
    if (result.error) throw result.error;
    return result;
  },

  async revoke(userId: string, sid: string) {
    return locked(userId, sid, async (tx) => {
      const factor = await tx.mfaFactor.findUniqueOrThrow({ where: { userId } });
      await recentForManagement(tx, sid, factor.version);
      await tx.mfaFactor.update({ where: { userId }, data: { enabled: false, version: { increment: 1 }, secretCipher: null,
        pendingCipher: null, pendingSession: null, pendingExpiresAt: null, recoveryHashes: [], lastStep: -1 } });
      await tx.sessionConnexion.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
      await audit(tx, userId, "MFA_REVOKED");
      return { ok: true };
    });
  },
};
