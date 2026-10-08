import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type Appel = { table: string; methode: string; args: any };
const appels: Appel[] = [];
const resultats: Record<string, any> = {};
const transaction = jest.fn<(...args: any[]) => Promise<any>>();
const db: any = new Proxy({}, {
  get(_cible, table: string) {
    if (table === "$transaction") return transaction;
    return new Proxy({}, {
      get(_m, methode: string) {
        return async (args: any) => {
          appels.push({ table, methode, args });
          const cle = `${table}.${methode}`;
          if (cle in resultats) {
            const valeur = resultats[cle];
            return typeof valeur === "function" ? valeur(args) : valeur;
          }
          if (methode === "findMany") return [];
          if (methode === "count") return 0;
          if (methode === "findUnique" || methode === "findFirst") return null;
          return { count: 0 };
        };
      },
    });
  },
});
const removePrivate = jest.fn<(...args: any[]) => Promise<void>>();
const completeErasure = jest.fn<(...args: any[]) => Promise<any>>();
const retirerSauvegarde = jest.fn<(...args: any[]) => Promise<void>>();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("node:fs/promises", () => ({
  __esModule: true,
  default: { readdir: async () => { throw Object.assign(new Error("absent"), { code: "ENOENT" }); }, lstat: jest.fn() },
}));
jest.mock("../../files/private-storage", () => ({ privateRoot: () => "/tmp/prive-inexistant", removePrivate: (...a: any[]) => removePrivate(...a) }));
jest.mock("../../files/fichiers-prives.service", () => ({
  DOSSIERS_PRIVES: ["livreurs", "commercants"],
  cheminRelatif: (url: unknown) => (typeof url === "string" && url.startsWith("/prive/") ? url.slice(1) : null),
}));
jest.mock("../erasure.service", () => ({ completeErasure: (...a: any[]) => completeErasure(...a) }));
jest.mock("../../monitoring/backup.service", () => ({ BackupService: { remove: (...a: any[]) => retirerSauvegarde(...a) } }));

import { runRetention } from "../retention.service";

const MAINTENANT = new Date("2026-10-08T12:00:00.000Z");
const JOUR = 86400000;
const avant = (jours: number) => new Date(MAINTENANT.getTime() - jours * JOUR);
const de = (table: string, methode: string) => appels.filter(a => a.table === table && a.methode === methode);

beforeEach(() => {
  appels.length = 0;
  for (const cle of Object.keys(resultats)) delete resultats[cle];
  transaction.mockReset();
  transaction.mockImplementation(async (callback: any) => callback(db));
  removePrivate.mockReset();
  completeErasure.mockReset();
  retirerSauvegarde.mockReset();
});

describe("rétention : durées de conservation", () => {
  it("efface les positions GPS au bout d'un jour, jamais plus tôt", async () => {
    await runRetention(MAINTENANT);
    expect(de("courier", "updateMany")[0].args).toEqual({ where: { lastLocationUpdate: { lt: avant(1) } }, data: { latitude: null, longitude: null } });
    expect(de("chauffeurDrive", "updateMany")[0].args.where).toEqual({ positionLe: { lt: avant(1) } });
  });

  it("ne touche aux positions d'une livraison que lorsqu'elle est terminée", async () => {
    await runRetention(MAINTENANT);
    expect(de("orderDelivery", "updateMany")[0].args.where).toEqual({ status: { in: ["DELIVERED", "FAILED", "CANCELLED"] }, updatedAt: { lt: avant(1) } });
  });

  it("anonymise les coordonnées des commandes closes après 90 jours et jamais celles d'une commande en cours", async () => {
    await runRetention(MAINTENANT);
    const { where, data } = de("order", "updateMany")[0].args;
    expect(where.status).toEqual({ in: ["COMPLETED", "REJECTED"] });
    expect(where.createdAt).toEqual({ lt: avant(90) });
    expect(where.customerEmail).toEqual({ notIn: ["archive@zupeat.invalid", "supprime@zupeat.invalid"] });
    expect(data).toMatchObject({ customerName: "Client archivé", customerEmail: "archive@zupeat.invalid", deliveryAddress: null, trackingTokenHash: null });
  });

  it.each([
    ["securityEvent", 90],
    ["systemAuditLog", 180],
    ["privacyAuditEvent", 181],
  ])("journal %s : conservé %s jours", async (table, jours) => {
    await runRetention(MAINTENANT);
    expect(de(table, "deleteMany")[0].args.where).toEqual({ createdAt: { lt: avant(jours as number) } });
  });

  it("ne supprime que les tickets résolus ou fermés après deux ans", async () => {
    await runRetention(MAINTENANT);
    const where = de("merchantTicket", "deleteMany")[0].args.where;
    expect(where.status).toEqual({ in: ["RESOLVED", "CLOSED"] });
    expect(where.OR).toEqual([{ resolvedAt: { lt: avant(730) } }, { resolvedAt: null, updatedAt: { lt: avant(730) } }]);
  });

  it("vide la clé secrète Stripe des paiements terminés, pas des paiements en cours", async () => {
    await runRetention(MAINTENANT);
    expect(de("payment", "updateMany")[0].args).toEqual({ where: { status: { in: ["SUCCEEDED", "FAILED", "REFUNDED"] } }, data: { stripeClientSecret: null } });
  });

  it("retire les sauvegardes de plus de 14 jours, une par une", async () => {
    resultats["backup.findMany"] = [{ id: "sauvegarde-1" }, { id: "sauvegarde-2" }];
    const resultat = await runRetention(MAINTENANT);
    expect(de("backup", "findMany")[0].args.where).toEqual({ createdAt: { lt: avant(14) } });
    expect(retirerSauvegarde.mock.calls.map(c => c[0])).toEqual(["sauvegarde-1", "sauvegarde-2"]);
    expect(resultat.backups).toBe(2);
  });

  it("supprime les gels légaux échus", async () => {
    await runRetention(MAINTENANT);
    expect(de("privacyLegalHold", "deleteMany")[0].args.where).toEqual({ expiresAt: { lt: MAINTENANT } });
  });
});

describe("rétention : pièces comptables conservées dix ans", () => {
  it("ne supprime les commandes qu'après 3653 jours, terminées et sans versement en attente", async () => {
    await runRetention(MAINTENANT);
    const where = de("order", "findMany")[0].args.where;
    expect(where.createdAt).toEqual({ lt: avant(3653) });
    expect(where.status).toEqual({ in: ["COMPLETED", "REJECTED"] });
    expect(where.OR[1].delivery.payout).toEqual({ status: "PAID" });
    expect(where.OR[1].delivery.payoutHold).toBeNull();
  });

  it.each([
    ["platformInvoice", { issuedAt: { lt: avant(3653) } }],
    ["courierPayout", { status: { in: ["PAID", "CANCELLED"] }, periodEnd: { lt: avant(3653) } }],
    ["merchantPayout", { status: { in: ["PAID", "CANCELLED", "CARRIED"] }, periodEnd: { lt: avant(3653) } }],
    ["payoutBatch", { status: { in: ["CONFIRMED", "REJECTED", "CANCELLED"] }, closedAt: { lt: avant(3653) } }],
  ])("%s : jamais supprimé avant dix ans, jamais en cours de traitement", async (table, attendu) => {
    await runRetention(MAINTENANT);
    const where = de(table, "deleteMany")[0].args.where;
    expect(where).toMatchObject(attendu);
    expect(where.id.notIn).toEqual([]);
  });

  it("supprime factures et commandes dans une seule transaction", async () => {
    resultats["order.findMany"] = (args: any) => (args.select?.id && args.take === 500 ? [{ id: "ancienne-1" }, { id: "ancienne-2" }] : []);
    const resultat = await runRetention(MAINTENANT);
    expect(transaction).toHaveBeenCalled();
    expect(de("invoice", "deleteMany")[0].args.where).toEqual({ orderId: { in: ["ancienne-1", "ancienne-2"] } });
    expect(de("order", "deleteMany")[0].args.where).toEqual({ id: { in: ["ancienne-1", "ancienne-2"] } });
    expect(resultat.accounting).toBe(2);
  });

  it("consigne l'effacement des commandes dans la même transaction que les factures", async () => {
    resultats["order.findMany"] = (args: any) => (args.take === 500 ? [{ id: "ancienne-1" }] : []);
    transaction.mockImplementation(async (callback: any) => {
      const avantTransaction = appels.length;
      await callback(db);
      const dedans = appels.slice(avantTransaction).map(a => `${a.table}.${a.methode}`);
      expect(dedans).toEqual(expect.arrayContaining(["invoice.deleteMany", "order.deleteMany", "courierPayout.deleteMany", "merchantPayout.deleteMany"]));
    });
    await runRetention(MAINTENANT);
  });
});

describe("rétention : gels légaux et enquêtes en cours", () => {
  it("épargne ce qui est sous gel légal", async () => {
    resultats["privacyLegalHold.findMany"] = [
      { model: "MerchantTicket", recordId: "ticket-gele" },
      { model: "CourierSupportMessage", recordId: "message-gele" },
      { model: "AcceptationConditions", recordId: "accord-gele" },
      { model: "CourseDrive", recordId: "course-gelee" },
      { model: "PlatformInvoice", recordId: "facture-gelee" },
    ];
    await runRetention(MAINTENANT);
    expect(de("merchantTicket", "deleteMany")[0].args.where.id).toEqual({ notIn: ["ticket-gele"] });
    expect(de("courierSupportMessage", "deleteMany")[0].args.where.id).toEqual({ notIn: ["message-gele"] });
    expect(de("acceptationConditions", "deleteMany")[0].args.where.id).toEqual({ notIn: ["accord-gele"] });
    expect(de("courseDrive", "updateMany")[0].args.where.id).toEqual({ notIn: ["course-gelee"] });
    expect(de("courseDrive", "deleteMany")[0].args.where.id).toEqual({ notIn: ["course-gelee"] });
    expect(de("platformInvoice", "deleteMany")[0].args.where.id).toEqual({ notIn: ["facture-gelee"] });
  });

  it("ne lit que les gels non échus", async () => {
    await runRetention(MAINTENANT);
    expect(de("privacyLegalHold", "findMany")[0].args.where).toEqual({ expiresAt: { gt: MAINTENANT } });
  });

  it("garde la preuve d'une livraison visée par un incident ouvert ou un gel", async () => {
    resultats["deliveryIncident.findMany"] = [{ deliveryId: "livraison-incident" }];
    resultats["privacyLegalHold.findMany"] = [{ model: "OrderDelivery", recordId: "livraison-gelee" }];
    await runRetention(MAINTENANT);
    expect(de("deliveryIncident", "findMany")[0].args.where).toEqual({ closedAt: null });
    const where = de("orderDelivery", "findMany")[0].args.where;
    expect(where.id).toEqual({ notIn: ["livraison-incident", "livraison-gelee"] });
    expect(where.status).toEqual({ in: ["DELIVERED", "FAILED", "CANCELLED"] });
    expect(where.proofAt).toEqual({ lt: avant(90) });
    expect(where.OR).toEqual([{ payoutHold: null }, { payoutHold: { not: "REVIEW" } }]);
  });

  it("supprime le fichier puis efface les champs de preuve, et compte les preuves purgées", async () => {
    resultats["orderDelivery.findMany"] = (args: any) => (args.take === 500 ? [{ id: "l1", proofPhoto: "/prive/preuve1.jpg" }, { id: "l2", proofPhoto: null }] : []);
    const resultat = await runRetention(MAINTENANT);
    expect(removePrivate).toHaveBeenCalledTimes(1);
    expect(removePrivate).toHaveBeenCalledWith("prive/preuve1.jpg");
    const miseAJour = de("orderDelivery", "update");
    expect(miseAJour.map(a => a.args.where.id)).toEqual(["l1", "l2"]);
    expect(miseAJour[0].args.data).toMatchObject({ proofPhoto: null, proofLat: null, deliveryCode: null, deliveryLat: null });
    expect(resultat.proofs).toBe(2);
  });

  it("supprime les pièces refusées depuis plus de 30 jours, sauf sous gel", async () => {
    resultats["privacyLegalHold.findMany"] = [{ model: "OrganizationDocument", recordId: "piece-gelee" }];
    resultats["organizationDocument.findMany"] = [{ id: "piece-refusee", documentUrl: "/prive/kbis.pdf" }];
    await runRetention(MAINTENANT);
    const where = de("organizationDocument", "findMany")[0].args.where;
    expect(where).toMatchObject({ id: { notIn: ["piece-gelee"] }, status: "REJECTED", reviewedAt: { lt: avant(30) } });
    expect(removePrivate).toHaveBeenCalledWith("prive/kbis.pdf");
    expect(de("organizationDocument", "delete")[0].args.where).toEqual({ id: "piece-refusee" });
  });
});

describe("rétention : demandes d'effacement et idempotence", () => {
  it("termine les effacements en attente, un par demande", async () => {
    resultats["privacyErasureRequest.findMany"] = [{ userId: "alice" }, { userId: "bob" }];
    completeErasure.mockResolvedValue({ status: "COMPLETED" });
    await runRetention(MAINTENANT);
    expect(de("privacyErasureRequest", "findMany")[0].args).toMatchObject({ where: { status: "PENDING" }, take: 100 });
    expect(completeErasure.mock.calls.map(c => c[0])).toEqual(["alice", "bob"]);
  });

  it("purge les demandes terminées depuis plus de 30 jours", async () => {
    await runRetention(MAINTENANT);
    expect(de("privacyErasureRequest", "deleteMany")[0].args.where).toEqual({ status: "COMPLETED", completedAt: { lt: avant(30) } });
  });

  it("n'anonymise pas un livreur qui a encore un versement ou un pourboire à recevoir", async () => {
    resultats["courier.findMany"] = [{ id: "livreur-1", name: "Léo", documents: [] }];
    resultats["courierPayout.count"] = 1;
    await runRetention(MAINTENANT);
    expect(de("courier", "update")).toEqual([]);
    expect(de("erasureRecord", "upsert")).toEqual([]);
  });

  it("anonymise un livreur dont tout est réglé et efface son compte bancaire", async () => {
    resultats["courier.findMany"] = [{ id: "livreur-1", name: "Léo", documents: [{ id: "d1", documentUrl: "/prive/permis.pdf" }] }];
    await runRetention(MAINTENANT);
    expect(removePrivate).toHaveBeenCalledWith("prive/permis.pdf");
    expect(de("courier", "update")[0].args.data).toMatchObject({ name: "Livreur supprimé", email: "supprime-livreur-1@zupeat.invalid", iban: null, bic: null, accountHolder: null, userId: null });
    expect(de("courierPayout", "updateMany").at(-1)!.args.data).toEqual({ beneficiaryJson: { name: "Léo" } });
  });

  it("s'exécute deux fois de suite sans erreur et rend les mêmes compteurs", async () => {
    const premier = await runRetention(MAINTENANT);
    const second = await runRetention(MAINTENANT);
    expect(second).toEqual(premier);
    expect(Object.values(premier).every(valeur => valeur === 0)).toBe(true);
  });

  it("une base inaccessible fait échouer la purge au lieu de la déclarer réussie", async () => {
    resultats["courier.updateMany"] = () => { throw new Error("connexion perdue"); };
    await expect(runRetention(MAINTENANT)).rejects.toThrow("connexion perdue");
  });
});
