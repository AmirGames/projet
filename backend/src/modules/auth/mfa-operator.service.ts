import { z } from "zod";
import { db } from "../../services/db";

/** Accès OS/DB d'exploitation uniquement ; aucun endpoint ni lien magique. */
export async function recoverMfaOperator(input: unknown) {
  const data = z.object({ userId: z.string().min(1), ticket: z.string().min(3).max(150),
    verifier: z.string().min(3).max(150), approver: z.string().min(3).max(150) }).strict()
    .refine((v) => v.verifier !== v.approver, "Deux opérateurs distincts sont nécessaires").parse(input);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${data.userId} FOR UPDATE`;
    await tx.user.findUniqueOrThrow({ where: { id: data.userId } });
    await tx.mfaFactor.upsert({ where: { userId: data.userId },
      create: { userId: data.userId, version: 1, recoveryHashes: [] },
      update: { version: { increment: 1 }, enabled: false, secretCipher: null, recoveryHashes: [],
        pendingCipher: null, pendingSession: null, pendingExpiresAt: null, lastStep: -1 } });
    await tx.sessionConnexion.updateMany({ where: { userId: data.userId }, data: { revokedAt: new Date() } });
    await tx.securityEvent.create({ data: { action: "MFA_OPERATOR_RECOVERY", actor: data.verifier,
      target: data.userId, severity: "CRITICAL", status: "SUCCESS", details: JSON.stringify({ ticket: data.ticket, approver: data.approver }) } });
  });
}
