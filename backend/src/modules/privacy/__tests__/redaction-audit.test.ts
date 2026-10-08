import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = { privacyAuditEvent: { create: jest.fn() }, privacyLegalHold: { findMany: jest.fn() } };
jest.mock("../../../services/db", () => ({ db }));

import { redact } from "../redaction";
import { actorHash, recordAudit } from "../audit";
import { activeHolds, HOLD_MODELS } from "../legal-holds";
import { zip, summaryPdf } from "../formats";

describe("redact : rien de personnel dans les journaux", () => {
  it("masque e-mails, IBAN et jetons dans un texte libre", () => {
    const texte = redact("Contact alice@exemple.test, IBAN BE68 5390 0754 7034, jeton eyJhbGciOi.eyJ1c2VyIjoiYSJ9.c2lnbmF0dXJl, champ zupenc:v1:AbCd==");
    expect(texte).not.toContain("alice@exemple.test");
    expect(texte).not.toContain("5390");
    expect(texte).not.toContain("eyJhbGciOi");
    expect(texte).not.toContain("zupenc:v1");
    expect(texte).toContain("[email masqué]");
    expect(texte).toContain("[IBAN masqué]");
    expect(texte).toContain("[jeton masqué]");
    expect(texte).toContain("[chiffré]");
  });

  it.each(["password", "token", "Authorization", "cookie", "iban", "email", "phone", "telephone", "adresse", "latitude", "lng", "documentUrl", "body", "stack", "changes"])(
    "masque la valeur de la clé « %s »", clef => {
      expect(redact({ [clef]: "valeur-sensible", id: "visible" })).toEqual({ [clef]: "[masqué]", id: "visible" });
    }
  );

  it("masque en profondeur, dans les listes comme dans les objets imbriqués", () => {
    expect(redact({ utilisateurs: [{ id: "1", motDePasse: "x", password: "secret" }], meta: { email: "a@b.test", ok: true } }))
      .toEqual({ utilisateurs: [{ id: "1", motDePasse: "x", password: "[masqué]" }], meta: { email: "[masqué]", ok: true } });
  });

  it("réduit une erreur à son nom et son code (pas de message ni de pile)", () => {
    const erreur = Object.assign(new Error("échec pour alice@exemple.test"), { code: "P2002" });
    expect(redact(erreur)).toEqual({ name: "Error", code: "P2002" });
  });

  it("coupe les structures trop profondes", () => {
    let profond: any = { fin: "x" };
    for (let i = 0; i < 12; i++) profond = { niveau: profond };
    expect(JSON.stringify(redact(profond))).toContain("[masqué]");
  });

  it("laisse intacts nombres, booléens et valeurs nulles", () => {
    expect(redact({ n: 12, b: false, v: null })).toEqual({ n: 12, b: false, v: null });
  });
});

describe("audit : empreinte de l'acteur et intégrité", () => {
  beforeEach(() => db.privacyAuditEvent.create.mockReset());

  it("l'empreinte est stable, distincte par acteur, et ne contient pas l'identifiant", () => {
    expect(actorHash("alice")).toBe(actorHash("alice"));
    expect(actorHash("alice")).not.toBe(actorHash("bob"));
    expect(actorHash("alice")).toMatch(/^[0-9a-f]{64}$/);
    expect(actorHash("alice")).not.toContain("alice");
  });

  it("enregistre l'événement avec acteur haché, cible tronquée et sceau d'intégrité", async () => {
    await recordAudit("alice", "PERSONAL_DATA_EXPORT", "x".repeat(500), "SUCCESS");
    const { data } = db.privacyAuditEvent.create.mock.calls[0][0];
    expect(data).toMatchObject({ actor: actorHash("alice"), action: "PERSONAL_DATA_EXPORT", outcome: "SUCCESS" });
    expect(data.target).toHaveLength(200);
    expect(data.integrity).toMatch(/^[0-9a-f]{64}$/);
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("le résultat par défaut est AUTHORIZED", async () => {
    await recordAudit("alice", "ROLE_CHANGE", "cible");
    expect(db.privacyAuditEvent.create.mock.calls[0][0].data.outcome).toBe("AUTHORIZED");
  });

  it("échec fermé : l'erreur d'écriture remonte à l'appelant", async () => {
    db.privacyAuditEvent.create.mockRejectedValue(new Error("base indisponible"));
    await expect(recordAudit("alice", "PERSONAL_DATA_EXPORT", "alice")).rejects.toThrow("base indisponible");
  });

  it("deux événements identiques n'ont ni le même identifiant ni le même sceau", async () => {
    db.privacyAuditEvent.create.mockResolvedValue({});
    await recordAudit("alice", "ROLE_CHANGE", "cible");
    await recordAudit("alice", "ROLE_CHANGE", "cible");
    const [a, b] = db.privacyAuditEvent.create.mock.calls.map((c: any) => c[0].data);
    expect(a.id).not.toBe(b.id);
    expect(a.integrity).not.toBe(b.integrity);
  });
});

describe("gels légaux : lecture", () => {
  it("regroupe les identifiants gelés par modèle et ignore les gels échus", async () => {
    db.privacyLegalHold.findMany.mockResolvedValue([
      { model: "Order", recordId: "o1" }, { model: "Order", recordId: "o2" }, { model: "CourseDrive", recordId: "c1" },
    ]);
    const maintenant = new Date("2026-10-08T00:00:00Z");
    const gelsDe = await activeHolds(maintenant);
    expect(db.privacyLegalHold.findMany).toHaveBeenCalledWith({ where: { expiresAt: { gt: maintenant } }, select: { model: true, recordId: true } });
    expect(gelsDe("Order")).toEqual(["o1", "o2"]);
    expect(gelsDe("CourseDrive")).toEqual(["c1"]);
    expect(gelsDe("Payment")).toEqual([]);
  });

  it("couvre les pièces comptables et les dossiers d'identité", () => {
    expect(HOLD_MODELS).toEqual(expect.arrayContaining(["Order", "PlatformInvoice", "CourierPayout", "MerchantPayout", "CourierDocument", "DocumentChauffeurDrive"]));
  });
});

describe("formats d'exportation", () => {
  it("le ZIP refuse un nom de fichier qui sort du dossier", () => {
    expect(() => zip([{ name: "../etc/passwd", content: Buffer.from("x") }])).toThrow("Nom ZIP invalide");
    expect(() => zip([{ name: "a b.txt", content: Buffer.from("x") }])).toThrow("Nom ZIP invalide");
  });

  it("le ZIP contient les entrées, un répertoire central et le nombre d'entrées", () => {
    const archive = zip([{ name: "a.txt", content: Buffer.from("un") }, { name: "dossier/b.txt", content: Buffer.from("deux") }]);
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
    const fin = archive.subarray(archive.length - 22);
    expect(fin.readUInt32LE(0)).toBe(0x06054b50);
    expect(fin.readUInt16LE(10)).toBe(2);
    expect(archive.toString("latin1")).toContain("dossier/b.txt");
  });

  it("le PDF échappe les parenthèses et neutralise les caractères hors ASCII", () => {
    const pdf = summaryPdf(["Profil : (a)\\b é"]).toString();
    expect(pdf).toContain("\\(a\\)\\\\b");
    expect(pdf).toContain("%%EOF");
    expect(pdf).not.toContain("é");
  });
});
