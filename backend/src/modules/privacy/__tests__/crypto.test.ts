import { randomBytes } from "node:crypto";
import { decrypt, encrypt, isEncrypted, keyring } from "../crypto";
import { decryptResult, encryptData, checkEncryptedQuery } from "../encrypted-fields";
import { redact } from "../redaction";
import { summaryPdf, zip } from "../formats";

beforeEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.DATA_ENCRYPTION_KEYS;
  delete process.env.DATA_ENCRYPTION_ACTIVE_KEY;
});

test("AES-GCM est probabiliste et refuse altération et mauvais contexte", () => {
  const value = "BE68539007547034";
  const a = encrypt(value, "Organization.iban"), b = encrypt(value, "Organization.iban");
  expect(a).not.toContain(value); expect(a).not.toBe(b);
  expect(decrypt(a, "Organization.iban").toString()).toBe(value);
  expect(() => decrypt(a, "Courier.iban")).toThrow();
  const parts = a.split(":"); parts[4] = Buffer.alloc(16).toString("base64url");
  expect(() => decrypt(parts.join(":"), "Organization.iban")).toThrow();
});

test("rotation : nouvelle clé pour les écritures, ancienne pour les lectures", () => {
  const old = randomBytes(32).toString("base64"), fresh = randomBytes(32).toString("base64");
  process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ old, fresh }); process.env.DATA_ENCRYPTION_ACTIVE_KEY = "old";
  const a = encrypt("document", "test");
  process.env.DATA_ENCRYPTION_ACTIVE_KEY = "fresh";
  expect(decrypt(a, "test").toString()).toBe("document");
  expect(encrypt("document", "test")).toContain(":fresh:");
  process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ fresh });
  expect(() => decrypt(a, "test")).toThrow();
});

test("aucune clé faible ou manquante ne permet une écriture", () => {
  process.env.DATA_ENCRYPTION_KEYS = JSON.stringify({ bad: "abc" }); process.env.DATA_ENCRYPTION_ACTIVE_KEY = "bad";
  expect(() => keyring()).toThrow();
  delete process.env.DATA_ENCRYPTION_KEYS; process.env.NODE_ENV = "production";
  expect(() => encrypt("secret", "test")).toThrow();
});

/** Lit `objet.a.b.c` sur une valeur dont on ne connaît pas la forme. */
function lire(objet: unknown, ...chemin: string[]): unknown {
  return chemin.reduce<unknown>((courant, cle) => (typeof courant === "object" && courant !== null ? Reflect.get(courant, cle) : undefined), objet);
}

test("écritures imbriquées et JSON restent lisibles uniquement via le client protégé", () => {
  const input = { email: "public@example.test", customer: { create: { phone: "123456", savedAddresses: [{ address: "Rue privée" }] } }, memberships: { create: { org: { create: { name: "test", iban: "BE68539007547034" } } } } };
  const encrypted = encryptData("User", input);
  expect(isEncrypted(lire(encrypted, "customer", "create", "phone"))).toBe(true);
  expect(JSON.stringify(encrypted)).not.toContain("Rue privée");
  expect(isEncrypted(lire(encrypted, "memberships", "create", "org", "create", "iban"))).toBe(true);
  const read = decryptResult("User", { customer: lire(encrypted, "customer", "create") });
  expect(lire(read, "customer", "savedAddresses", "0", "address")).toBe("Rue privée");
  expect(input.customer.create.phone).toBe("123456");
});

test("recherche chiffrée interdite, filtres de nullité autorisés", () => {
  expect(() => checkEncryptedQuery("Customer", { where: { OR: [{ phone: { contains: "123" } }] } })).toThrow();
  expect(() => checkEncryptedQuery("Customer", { where: { phone: null } })).not.toThrow();
  expect(() => checkEncryptedQuery("Organization", { orderBy: { iban: "asc" } })).toThrow();
});

test("les métadonnées et messages du journal masquent les données personnelles", () => {
  const output = JSON.stringify(redact({ email: "me@example.test", data: { iban: "BE68539007547034", password: "secret", message: "Login me@example.test" } }));
  expect(output).not.toContain("me@example.test"); expect(output).not.toContain("BE68539007547034"); expect(output).not.toContain('"secret"');
});

test("ZIP produit un répertoire central et PDF un document avec table xref", () => {
  const archive = zip([{ name: "donnees.json", content: Buffer.from('{"ok":true}') }]);
  expect(archive.readUInt32LE(0)).toBe(0x04034b50);
  expect(archive.readUInt32LE(archive.length - 22)).toBe(0x06054b50);
  expect(() => zip([{ name: "../secret", content: Buffer.from("") }])).toThrow();
  const pdf = summaryPdf(["Profil (test)", "Ligne \\ 2"]).toString();
  expect(pdf.startsWith("%PDF-1.4")).toBe(true); expect(pdf).toContain("xref"); expect(pdf).toContain("\\(test\\)");
});

describe("encryptData : valeur déjà chiffrée", () => {
  it("ne rechiffre pas une origine déjà chiffrée en amont (journal d'audit)", async () => {
    const { encrypt } = await import("../crypto");
    const { encryptData, decryptResult } = await import("../encrypted-fields");
    const deja = encrypt(JSON.stringify("203.0.113.7"), "SystemAuditLog.ipAddress");
    const ecrit = encryptData("SystemAuditLog", { action: "X", ipAddress: deja });
    expect(lire(ecrit, "ipAddress")).toBe(deja);
    expect(lire(decryptResult("SystemAuditLog", ecrit), "ipAddress")).toBe("203.0.113.7");
  });
});
