import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { db } from "../../services/db";

const testSecret = randomBytes(32).toString("base64");
function auditKey() {
  const key = process.env.PRIVACY_AUDIT_KEY || (process.env.NODE_ENV === "test" ? testSecret : "");
  if (key.length < 32) throw new Error("PRIVACY_AUDIT_KEY requis");
  return key;
}
export const actorHash = (id: string) => createHmac("sha256", auditKey()).update(`actor:${id}`).digest("hex");
function auditIntegrity(event: { id: string; actor: string; action: string; target: string; outcome: string; createdAt: Date }) {
  return createHmac("sha256", auditKey()).update(JSON.stringify([event.id, event.actor, event.action, event.target, event.outcome, event.createdAt.toISOString()])).digest("hex");
}
/** Échec fermé : un accès sensible n'est pas délivré si sa trace ne peut pas être écrite. */
export async function recordAudit(userId: string, action: string, target: string, outcome = "AUTHORIZED") {
  const event = { id: randomUUID(), actor: actorHash(userId), action, target: target.slice(0, 200), outcome, createdAt: new Date() };
  await db.privacyAuditEvent.create({ data: { ...event, integrity: auditIntegrity(event) } });
}
