import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "zupenc:v1:";
const testKey = randomBytes(32);

export function keyring(): { active: string; keys: Record<string, Buffer> } {
  if (!process.env.DATA_ENCRYPTION_KEYS && process.env.NODE_ENV === "test") {
    return { active: "test", keys: { test: testKey } };
  }
  let entries: Record<string, string>;
  try { entries = JSON.parse(process.env.DATA_ENCRYPTION_KEYS || ""); }
  catch { throw new Error("DATA_ENCRYPTION_KEYS requis (objet JSON de clés base64)"); }
  const active = process.env.DATA_ENCRYPTION_ACTIVE_KEY || "";
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("Trousseau invalide");
  const keys: Record<string, Buffer> = Object.create(null);
  for (const [id, encoded] of Object.entries(entries)) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof encoded !== "string") throw new Error("Trousseau invalide");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32 || key.toString("base64") !== encoded) throw new Error("Chaque clé doit contenir 32 octets en base64 canonique");
    keys[id] = key;
  }
  if (!keys[active]) throw new Error("Clé de chiffrement active absente");
  return { active, keys };
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** AES-256-GCM : IV aléatoire 96 bits, tag 128 bits et contexte authentifié. */
export function encrypt(value: string | Buffer, context: string): string {
  const { active, keys } = keyring();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys[active], iv);
  cipher.setAAD(Buffer.from(`zupone:v1:${context}`));
  const body = Buffer.concat([cipher.update(value), cipher.final()]);
  return `${PREFIX}${active}:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${body.toString("base64url")}`;
}

export function decrypt(value: string, context: string): Buffer {
  if (!isEncrypted(value)) throw new Error("Donnée non chiffrée");
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 4) throw new Error("Enveloppe de chiffrement invalide");
  const [id, nonce, tag, body] = parts;
  const key = keyring().keys[id];
  if (!key) throw new Error("Clé de déchiffrement indisponible");
  const iv = Buffer.from(nonce, "base64url"), auth = Buffer.from(tag, "base64url");
  if (iv.length !== 12 || auth.length !== 16) throw new Error("Enveloppe de chiffrement invalide");
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`zupone:v1:${context}`));
  cipher.setAuthTag(auth);
  return Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]);
}

export function assertPrivacyConfiguration() {
  keyring();
  if (process.env.NODE_ENV === "production") {
    for (const name of ["PRIVACY_AUDIT_KEY", "FILE_SIGNING_SECRET"]) {
      if ((process.env[name] || "").length < 32) throw new Error(`${name} requis (32 caractères minimum)`);
      if ([process.env.JWT_SECRET, process.env.JWT_REFRESH_SECRET].includes(process.env[name])) throw new Error(`${name} doit être indépendant des secrets JWT`);
    }
    if (!process.env.CLAMAV_HOST) throw new Error("CLAMAV_HOST requis : aucun dépôt sans antivirus");
    if (process.env.PRIVACY_MIGRATION_VERIFIED !== "true") throw new Error("Migration RGPD et vérification du stockage requises avant démarrage (voir docs/rgpd)");
    if (process.env.PRISMA_LOG_QUERIES === "true") throw new Error("Journalisation SQL interdite en production");
  }
}
