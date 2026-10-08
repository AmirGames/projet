import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const tables: Record<string, Record<string, any>> = {};
const transaction = jest.fn<(...args: any[]) => Promise<any>>();
const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (table === "$transaction") return transaction;
    if (!tables[table]) {
      const methodes: Record<string, any> = {};
      tables[table] = new Proxy(methodes, {
        get(_m, methode: string) {
          if (!methodes[methode]) methodes[methode] = jest.fn(async () => (methode === "findMany" ? [] : null));
          return methodes[methode];
        },
      }) as any;
    }
    return tables[table];
  },
});

const peutLire = jest.fn<(...args: any[]) => Promise<boolean>>();
const readPrivate = jest.fn<(...args: any[]) => Promise<Buffer>>();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../files/fichiers-prives.service", () => ({
  // Une adresse « /prive/x.pdf » est un fichier privé ; toute autre est externe.
  cheminRelatif: (url: unknown) => (typeof url === "string" && url.startsWith("/prive/") ? url.slice(1) : null),
  peutLire: (...args: any[]) => peutLire(...args),
}));
jest.mock("../../files/private-storage", () => ({ readPrivate: (...args: any[]) => readPrivate(...args) }));

import { collectExport, exportSummary, exportZip } from "../export.service";
import { actorHash } from "../audit";

const PROFIL = { id: "alice", email: "alice@exemple.test", name: "Alice", emailVerified: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") };

beforeEach(() => {
  for (const table of Object.values(tables)) for (const methode of Object.keys(table)) table[methode].mockReset();
  transaction.mockClear();
  transaction.mockImplementation(async (callback: any) => callback(db));
  for (const table of Object.keys(tables)) {
    for (const methode of Object.keys(tables[table])) {
      tables[table][methode].mockImplementation(async () => (methode === "findMany" ? [] : null));
    }
  }
  db.user.findUnique.mockResolvedValue(PROFIL);
  peutLire.mockResolvedValue(true);
  readPrivate.mockResolvedValue(Buffer.from("contenu-du-document"));
});

describe("collectExport : périmètre de l'exportation", () => {
  it("refuse une session dont le compte n'existe plus", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(collectExport("fantome")).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED" });
  });

  it("lit tout dans une même transaction cohérente (RepeatableRead)", async () => {
    await collectExport("alice");
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "RepeatableRead" }));
  });

  it("ne sélectionne jamais le hash du mot de passe ni les jetons du profil", async () => {
    await collectExport("alice");
    const { select } = db.user.findUnique.mock.calls[0][0];
    expect(select).toEqual({ id: true, email: true, name: true, emailVerified: true, createdAt: true, updatedAt: true });
  });

  it("filtre chaque dossier par l'identifiant du compte", async () => {
    await collectExport("alice");
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ id: "alice" });
    expect(db.courier.findUnique.mock.calls[0][0].where).toEqual({ userId: "alice" });
    expect(db.chauffeurDrive.findUnique.mock.calls[0][0].where).toEqual({ userId: "alice" });
    expect(db.courseDrive.findMany.mock.calls[0][0].where).toEqual({ passagerId: "alice" });
    expect(db.adresseFavoriteDrive.findMany.mock.calls[0][0].where).toEqual({ userId: "alice" });
    expect(db.contactConfianceDrive.findUnique.mock.calls[0][0].where).toEqual({ userId: "alice" });
    expect(db.alerteSosDrive.findMany.mock.calls[0][0].where).toEqual({ passagerId: "alice" });
    expect(db.membership.findMany.mock.calls[0][0].where).toEqual({ userId: "alice" });
    expect(db.societeDrive.findUnique.mock.calls[0][0].where).toEqual({ gerantId: "alice" });
    expect(db.ticketMessage.findMany.mock.calls[0][0].where).toEqual({ authorId: "alice" });
  });

  it("n'inclut que le journal de l'acteur, retrouvé par son empreinte", async () => {
    await collectExport("alice");
    expect(db.privacyAuditEvent.findMany.mock.calls[0][0].where).toEqual({ actor: actorHash("alice") });
    expect(db.privacyAuditEvent.findMany.mock.calls[0][0].select).toEqual({ action: true, target: true, outcome: true, createdAt: true });
  });

  it("adresse vérifiée : rattache aussi les fiches clients et notifications de cette adresse", async () => {
    await collectExport("alice");
    expect(db.customer.findMany.mock.calls[0][0].where.OR).toEqual([{ userId: "alice" }, { email: "alice@exemple.test", userId: null, deletedAt: null }]);
    expect(db.acceptationConditions.findMany.mock.calls[0][0].where.OR).toEqual([{ userId: "alice" }, { email: "alice@exemple.test" }]);
    expect(db.notification.findMany.mock.calls[0][0].where).toEqual({ recipientEmail: "alice@exemple.test" });
  });

  it("adresse NON vérifiée : aucune donnée n'est rattachée par e-mail (pas de capture du compte d'autrui)", async () => {
    db.user.findUnique.mockResolvedValue({ ...PROFIL, emailVerified: false });
    const data = await collectExport("alice");
    expect(db.customer.findMany.mock.calls[0][0].where.OR).toEqual([{ userId: "alice" }]);
    expect(db.acceptationConditions.findMany.mock.calls[0][0].where.OR).toEqual([{ userId: "alice" }]);
    expect(db.notification.findMany).not.toHaveBeenCalled();
    expect(data.notifications).toEqual([]);
  });

  it("les commandes ne sont lues que pour les fiches clientes du compte", async () => {
    db.customer.findMany.mockResolvedValue([{ id: "client-1", address: "Rue 1", city: "Namur", postalCode: "5000", savedAddresses: [], favorites: [], carts: [] }]);
    await collectExport("alice");
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({ customerId: { in: ["client-1"] } });
  });

  it("n'exporte que les organisations dont le compte est administrateur ET propriétaire déclaré", async () => {
    db.membership.findMany.mockResolvedValue([
      { orgId: "org-proprio", role: "ADMIN" }, { orgId: "org-employeur", role: "ADMIN" }, { orgId: "org-gerant", role: "STORE_MANAGER" },
    ]);
    db.organization.findMany.mockResolvedValue([
      { id: "org-proprio", ownerEmail: "alice@exemple.test", documents: [] },
      { id: "org-employeur", ownerEmail: "patron@exemple.test", documents: [] },
    ]);
    const data = await collectExport("alice");
    expect(db.organization.findMany.mock.calls[0][0].where).toEqual({ id: { in: ["org-proprio", "org-employeur"] } });
    expect(data.organizations.map((o: any) => o.id)).toEqual(["org-proprio"]);
  });

  it("retire récursivement les secrets (hash, jetons, codes, clés de paiement, abonnements push)", async () => {
    db.customer.findMany.mockResolvedValue([{ id: "client-1", name: "Alice", token: "t", pushSubscription: { endpoint: "e" }, favorites: [{ id: "f", codeHash: "h" }], carts: [], savedAddresses: [] }]);
    db.order.findMany.mockResolvedValue([{ id: "o1", total: 1200, trackingTokenHash: "th", deliveryCode: "1234", payments: [{ id: "p1", amount: 1200, stripeClientSecret: "pi_secret" }], items: [] }]);
    db.courier.findUnique.mockResolvedValue({ id: "c1", name: "Livreur", jtiHash: "j", integrity: "i", jetonCentralHash: "jc", documents: [], deliveries: [] });
    const data: any = await collectExport("alice");
    const texte = JSON.stringify(data);
    for (const secret of ["pi_secret", "\"th\"", "1234", "jtiHash", "jetonCentralHash", "pushSubscription", "codeHash", "trackingTokenHash", "stripeClientSecret", "deliveryCode", "integrity"]) {
      expect(texte).not.toContain(secret);
    }
    expect(data.orders[0].total).toBe(1200);
    expect(data.payments).toEqual([{ id: "p1", amount: 1200 }]);
    expect(data.customers[0].name).toBe("Alice");
  });

  it("refuse un export de plus de 50 Mo plutôt que de saturer le serveur", async () => {
    db.ticketMessage.findMany.mockResolvedValue([{ id: "m1", body: "x".repeat(51 * 1024 * 1024) }]);
    await expect(collectExport("alice")).rejects.toMatchObject({ statusCode: 413, code: "EXPORT_TOO_LARGE" });
  });

  it("le résumé PDF ne contient que des comptes, pas le détail des données", async () => {
    const data = await collectExport("alice");
    const pdf = exportSummary(data).toString();
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Commandes : 0");
    expect(pdf).toContain("alice@exemple.test");
  });
});

describe("exportZip : documents du compte", () => {
  const caller = { userId: "alice", compte: undefined };

  const donnees = async (surcharge: Record<string, any> = {}) => ({ ...(await collectExport("alice")), ...surcharge });
  const noms = (zip: Buffer) => [...zip.toString("latin1").matchAll(/(recapitulatif\.pdf|donnees\.json|documents\/[a-zA-Z0-9_.-]+)/g)].map(m => m[1]);
  const manifeste = (zip: Buffer) => {
    const texte = zip.toString("utf8");
    const debut = texte.indexOf("{\n  \"version\"");
    // Le JSON est la dernière entrée : il s'arrête où commence le répertoire central du ZIP.
    return JSON.parse(texte.slice(debut, texte.indexOf("PK\u0001\u0002", debut))).documents;
  };

  it("contient toujours le récapitulatif et les données", async () => {
    const zip = await exportZip(await donnees(), caller);
    expect(zip.subarray(0, 4).readUInt32LE()).toBe(0x04034b50);
    expect(noms(zip)).toEqual(expect.arrayContaining(["recapitulatif.pdf", "donnees.json"]));
  });

  it("inclut les pièces que l'appelant a le droit de lire, après contrôle d'accès", async () => {
    const data = await donnees({ courier: { documents: [{ id: "d1", documentUrl: "/prive/permis.pdf" }], deliveries: [] } });
    const zip = await exportZip(data as any, caller);
    expect(peutLire).toHaveBeenCalledWith(caller, "prive/permis.pdf");
    expect(readPrivate).toHaveBeenCalledWith("prive/permis.pdf");
    expect(noms(zip)).toContain("documents/d1.pdf");
    expect(zip.toString("utf8")).toContain("contenu-du-document");
    expect(manifeste(zip)).toEqual([{ id: "d1", status: "INCLUDED", file: "documents/d1.pdf" }]);
  });

  it("n'inclut pas une pièce que l'appelant n'a pas le droit de lire : lecture du fichier évitée", async () => {
    peutLire.mockResolvedValue(false);
    const data = await donnees({ courier: { documents: [{ id: "d1", documentUrl: "/prive/permis.pdf" }], deliveries: [] } });
    const zip = await exportZip(data as any, caller);
    expect(readPrivate).not.toHaveBeenCalled();
    expect(zip.toString("utf8")).not.toContain("contenu-du-document");
    expect(manifeste(zip)).toEqual([expect.objectContaining({ id: "d1", status: "UNAVAILABLE" })]);
  });

  it("signale sans fuite un document externe ou une adresse hors stockage privé", async () => {
    const data = await donnees({ courier: { documents: [{ id: "d1", documentUrl: "https://ailleurs.test/doc.pdf" }], deliveries: [] } });
    const zip = await exportZip(data as any, caller);
    expect(peutLire).not.toHaveBeenCalled();
    expect(readPrivate).not.toHaveBeenCalled();
    expect(manifeste(zip)[0]).toMatchObject({ id: "d1", status: "UNAVAILABLE" });
  });

  it("un fichier absent du disque n'interrompt pas l'export : il est listé indisponible", async () => {
    readPrivate.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const data = await donnees({ chauffeur: { documents: [{ id: "d9", url: "/prive/licence.pdf" }] } });
    const zip = await exportZip(data as any, caller);
    expect(manifeste(zip)).toEqual([expect.objectContaining({ id: "d9", status: "UNAVAILABLE", reason: expect.stringContaining("absent") })]);
  });

  it("plafonne le volume des pièces à 100 Mo", async () => {
    readPrivate.mockResolvedValue(Buffer.alloc(60 * 1024 * 1024));
    const data = await donnees({ courier: { documents: [{ id: "a", documentUrl: "/prive/a.pdf" }, { id: "b", documentUrl: "/prive/b.pdf" }], deliveries: [] } });
    await expect(exportZip(data as any, caller)).rejects.toMatchObject({ statusCode: 413, code: "EXPORT_TOO_LARGE" });
  });

  it("inclut les photos de preuve de livraison du livreur, pas celles d'autrui", async () => {
    const data = await donnees({ courier: { documents: [], deliveries: [{ id: "liv1", proofPhoto: "/prive/preuve.jpg" }, { id: "liv2", proofPhoto: null }] } });
    const zip = await exportZip(data as any, caller);
    expect(manifeste(zip)).toEqual([{ id: "liv1", status: "INCLUDED", file: "documents/liv1.jpg" }]);
  });
});
