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
          return { count: 0, id: "objet" };
        };
      },
    });
  },
});
const removePrivate = jest.fn<(...args: any[]) => Promise<void>>();
const oublierCompte = jest.fn();
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("bcrypt", () => ({ hash: async () => "mot-de-passe-efface" }));
jest.mock("../../auth/auth.middleware", () => ({ oublierCompte: (...args: any[]) => oublierCompte(...args) }));
jest.mock("../../files/private-storage", () => ({ removePrivate: (...args: any[]) => removePrivate(...args) }));
jest.mock("../../files/fichiers-prives.service", () => ({ cheminRelatif: (url: unknown) => (typeof url === "string" && url.startsWith("/prive/") ? url.slice(1) : null) }));

import { completeErasure, requestErasure } from "../erasure.service";

const IBAN_VALIDE = "BE68539007547034";
const utilisateur = (surcharge: Record<string, any> = {}) => ({
  id: "alice", email: "alice@exemple.test", emailVerified: true, isSuperOwner: false,
  driver: null, chauffeurDrive: null, societeDrive: null, memberships: [], ...surcharge,
});
const de = (table: string, methode: string) => appels.filter(a => a.table === table && a.methode === methode);

beforeEach(() => {
  appels.length = 0;
  for (const cle of Object.keys(resultats)) delete resultats[cle];
  transaction.mockReset();
  transaction.mockImplementation(async (callback: any) => callback(db));
  removePrivate.mockReset();
  oublierCompte.mockReset();
  resultats["user.findUnique"] = utilisateur();
});

describe("requestErasure : garde-fous avant toute écriture", () => {
  const rienEcrit = () => {
    expect(transaction).not.toHaveBeenCalled();
    expect(appels.filter(a => /^(create|update|upsert|delete)/.test(a.methode))).toEqual([]);
  };

  it("refuse une session dont le compte n'existe plus", async () => {
    resultats["user.findUnique"] = null;
    await expect(requestErasure("fantome")).rejects.toMatchObject({ statusCode: 401 });
    rienEcrit();
  });

  it("le superowner doit d'abord transférer sa fonction", async () => {
    resultats["user.findUnique"] = utilisateur({ isSuperOwner: true });
    await expect(requestErasure("alice")).rejects.toMatchObject({ statusCode: 409, code: "TRANSFER_OWNERSHIP_REQUIRED" });
    rienEcrit();
  });

  it.each([
    ["commande client en cours", "order.count"],
    ["course ZupDrive en cours", "courseDrive.count"],
  ])("refuse tant qu'une %s existe", async (_nom, cle) => {
    resultats[cle] = 1;
    await expect(requestErasure("alice")).rejects.toMatchObject({ statusCode: 409, code: "ACTIVITY_IN_PROGRESS" });
    rienEcrit();
  });

  it("refuse tant qu'un livreur a une livraison acceptée ou récupérée", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", iban: IBAN_VALIDE, accountHolder: "Alice" } });
    resultats["orderDelivery.count"] = (args: any) => (args.where.status?.in ? 1 : 0);
    await expect(requestErasure("alice")).rejects.toMatchObject({ code: "ACTIVITY_IN_PROGRESS" });
    rienEcrit();
  });

  it.each([
    ["sans IBAN", { iban: null, accountHolder: "Alice" }],
    ["avec un IBAN invalide", { iban: "BE00 0000", accountHolder: "Alice" }],
    ["sans titulaire de compte", { iban: IBAN_VALIDE, accountHolder: null }],
  ])("un livreur payé à venir %s ne peut pas être effacé : le dernier versement serait perdu", async (_nom, banque) => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", ...banque } });
    resultats["orderDelivery.count"] = (args: any) => (args.where.status === "DELIVERED" ? 2 : 0);
    await expect(requestErasure("alice")).rejects.toMatchObject({ statusCode: 409, code: "FINAL_PAYMENT_BANK_REQUIRED" });
    rienEcrit();
  });

  it("un livreur avec un compte bancaire valide peut demander l'effacement malgré un versement dû", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "L", documents: [], iban: IBAN_VALIDE, accountHolder: "Alice" } });
    resultats["orderDelivery.count"] = (args: any) => (args.where.status === "DELIVERED" ? 2 : 0);
    resultats["courierPayout.count"] = 1;
    await expect(requestErasure("alice")).resolves.toEqual({ status: "WAITING_FINAL_PAYMENT" });
  });
});

describe("requestErasure : révocation immédiate de l'accès", () => {
  it("passe le compte en attente de suppression, coupe sessions, appareils et rôles d'équipe", async () => {
    await requestErasure("alice");
    expect(de("privacyErasureRequest", "upsert")[0].args).toMatchObject({ where: { userId: "alice" }, create: { userId: "alice" } });
    const premiereMiseAJour = de("user", "update")[0].args;
    expect(premiereMiseAJour).toEqual({ where: { id: "alice" }, data: { status: "DELETION_PENDING", resetTokenHash: null, emailTokenHash: null } });
    expect(de("sessionConnexion", "deleteMany")[0].args).toEqual({ where: { userId: "alice" } });
    expect(de("mfaFactor", "deleteMany")[0].args).toEqual({ where: { userId: "alice" } });
    expect(de("pushDevice", "deleteMany")[0].args).toEqual({ where: { userId: "alice" } });
    expect(de("accesEquipe", "deleteMany")[0].args).toEqual({ where: { userId: "alice" } });
    expect(oublierCompte).toHaveBeenCalledWith("alice");
  });

  it("met hors ligne le livreur et le chauffeur, efface leur position", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "L", documents: [], iban: IBAN_VALIDE, accountHolder: "Alice" }, chauffeurDrive: { id: "chauffeur-1", documents: [] } });
    await requestErasure("alice");
    expect(de("courier", "update")[0].args.data).toMatchObject({ status: "INACTIVE", isOnline: false, isAvailable: false, latitude: null, longitude: null });
    expect(de("chauffeurDrive", "update")[0].args.data).toMatchObject({ enLigne: false, latitude: null, longitude: null, statut: "SUSPENDU" });
  });

  it("enchaîne sur l'effacement et le rapporte", async () => {
    await expect(requestErasure("alice")).resolves.toEqual({ status: "COMPLETED" });
  });
});

describe("completeErasure : anonymisation sans perte comptable", () => {
  it("est idempotent : un compte déjà introuvable est considéré effacé, sans écriture", async () => {
    resultats["user.findUnique"] = null;
    await expect(completeErasure("alice")).resolves.toEqual({ status: "COMPLETED" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("anonymise le compte : adresse, nom, mot de passe, jetons et rôle d'administration", async () => {
    await completeErasure("alice");
    const { where, data } = de("user", "update").at(-1)!.args;
    expect(where).toEqual({ id: "alice" });
    expect(data).toMatchObject({
      email: "supprime-alice@zupeat.invalid", name: null, status: "DELETED", isSystemAdmin: false, emailVerified: false,
      resetTokenHash: null, resetTokenExpiresAt: null, emailTokenHash: null, emailTokenExpiresAt: null,
    });
    expect(data.passwordHash).toBe("mot-de-passe-efface");
    expect(de("mfaFactor", "deleteMany")[0].args).toEqual({ where: { userId: "alice" } });
    expect(JSON.stringify(data)).not.toContain("alice@exemple.test");
  });

  it("conserve les commandes sous identifiant opaque au lieu de les supprimer", async () => {
    resultats["customer.findMany"] = [{ id: "client-1" }];
    resultats["order.findMany"] = [{ id: "commande-1" }];
    await completeErasure("alice");
    const anonymisation = de("order", "updateMany")[0].args;
    expect(anonymisation.where).toEqual({ customerId: "client-1" });
    expect(anonymisation.data).toMatchObject({ customerId: null, customerName: "Client supprimé", customerEmail: "supprime@zupeat.invalid", customerPhone: "", deliveryAddress: null, trackingTokenHash: null });
    expect(de("orderTrackingToken", "deleteMany")[0].args.where).toEqual({ orderId: { in: ["commande-1"] } });
    expect(de("customer", "update")[0].args.data).toMatchObject({ userId: null, name: "Client supprimé", email: "supprime-client-1@zupeat.invalid", phone: null, address: null, savedAddresses: [], status: "INACTIVE" });
  });

  it.each(["payment", "invoice", "order", "orderDelivery", "platformInvoice", "courierPayout", "merchantPayout", "payoutBatch", "orderItem"])(
    "ne supprime jamais la table financière « %s » (traçabilité comptable)",
    async table => {
      resultats["customer.findMany"] = [{ id: "client-1" }];
      resultats["order.findMany"] = [{ id: "commande-1" }];
      resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "L", documents: [] } });
      await completeErasure("alice");
      expect(appels.filter(a => a.table === table && /^delete/.test(a.methode))).toEqual([]);
    }
  );

  it("garde la copie du nom du livreur dans ses versements avant d'effacer son identité", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "Léo Livreur", documents: [] } });
    await completeErasure("alice");
    expect(de("courierPayout", "updateMany")[0].args).toEqual({ where: { driverId: "livreur-1" }, data: { beneficiaryJson: { name: "Léo Livreur" } } });
    expect(de("courier", "update")[0].args.data).toMatchObject({ name: "Livreur supprimé", email: "supprime-livreur-1@zupeat.invalid", userId: null, iban: null, bic: null, accountHolder: null });
  });

  it("un dernier versement en attente garde l'IBAN et laisse la demande en attente", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "Léo", documents: [] } });
    resultats["courierPayout.count"] = 1;
    await expect(completeErasure("alice")).resolves.toEqual({ status: "WAITING_FINAL_PAYMENT" });
    const courier = de("courier", "update")[0].args.data;
    expect(courier.userId).toBe("alice");
    expect(courier).not.toHaveProperty("iban");
    expect(de("user", "update").at(-1)!.args.data.status).toBe("DELETION_PENDING");
    expect(de("privacyErasureRequest", "update")[0].args.data).toEqual({ status: "PENDING" });
  });

  it("une fois tout réglé, la demande est marquée terminée", async () => {
    await expect(completeErasure("alice")).resolves.toEqual({ status: "COMPLETED" });
    expect(de("privacyErasureRequest", "update")[0].args.data).toMatchObject({ status: "COMPLETED", completedAt: expect.any(Date) });
    expect(de("erasureRecord", "upsert").map(a => a.args.where.subjectId_scope)).toContainEqual({ subjectId: "alice", scope: "USER" });
  });

  it("un pourboire payé non versé retarde aussi l'effacement final", async () => {
    resultats["user.findUnique"] = utilisateur({ driver: { id: "livreur-1", email: "l@x.test", name: "Léo", documents: [] } });
    resultats["courierTip.count"] = 1;
    await expect(completeErasure("alice")).resolves.toEqual({ status: "WAITING_FINAL_PAYMENT" });
  });

  it("une organisation à régler (versement commerçant en attente) retarde l'effacement et garde son IBAN", async () => {
    resultats["organization.findMany"] = [{ id: "org-1", ownerEmail: "alice@exemple.test", documents: [] }];
    resultats["merchantPayout.count"] = 1;
    await expect(completeErasure("alice")).resolves.toEqual({ status: "WAITING_FINAL_PAYMENT" });
    const organisation = de("organization", "update")[0].args.data;
    expect(organisation).toMatchObject({ status: "CLOSED", ownerEmail: null, ownerFirstName: null, ownerPhone: null });
    expect(organisation).not.toHaveProperty("iban");
  });

  it("n'efface pas une organisation dont le compte est administrateur sans en être le propriétaire déclaré", async () => {
    resultats["organization.findMany"] = [{ id: "org-employeur", ownerEmail: "patron@exemple.test", documents: [{ id: "doc-patron", documentUrl: "/prive/kbis.pdf" }] }];
    await completeErasure("alice");
    expect(de("organization", "update")).toEqual([]);
    expect(de("organizationDocument", "deleteMany")).toEqual([]);
    expect(removePrivate).not.toHaveBeenCalled();
  });

  it("ferme l'organisation possédée : boutiques fermées, pièces et propriétaire effacés", async () => {
    resultats["organization.findMany"] = [{ id: "org-1", ownerEmail: "alice@exemple.test", documents: [{ id: "doc-1", documentUrl: "/prive/kbis.pdf" }] }];
    await completeErasure("alice");
    expect(de("store", "updateMany")[0].args).toEqual({ where: { orgId: "org-1" }, data: { isOpen: false } });
    expect(de("organization", "update")[0].args.data).toMatchObject({ status: "CLOSED", ownerEmail: null, iban: null, bic: null, accountHolder: null });
    expect(removePrivate).toHaveBeenCalledWith("prive/kbis.pdf");
  });

  it("sans adresse vérifiée, aucune fiche client n'est rattachée par e-mail", async () => {
    resultats["user.findUnique"] = utilisateur({ emailVerified: false });
    await completeErasure("alice");
    expect(de("customer", "findMany")[0].args.where.OR).toEqual([{ userId: "alice" }]);
  });

  it("efface les traces ZupDrive du passager sans toucher aux courses elles-mêmes", async () => {
    await completeErasure("alice");
    expect(de("courseDrive", "updateMany")[0].args).toMatchObject({ where: { passagerId: "alice" }, data: { passagerId: null, departAdresse: "Effacé", arriveeAdresse: "Effacé", departLatitude: 0, arriveeLongitude: 0 } });
    expect(de("courseDrive", "deleteMany")).toEqual([]);
    expect(de("alerteSosDrive", "updateMany")[0].args.data).toMatchObject({ passagerId: null, latitude: null, longitude: null });
    expect(de("adresseFavoriteDrive", "deleteMany")[0].args.where).toEqual({ userId: "alice" });
  });
});

describe("completeErasure : gel légal (legal hold)", () => {
  beforeEach(() => {
    resultats["privacyLegalHold.findMany"] = [{ model: "CourierDocument", recordId: "doc-gele" }, { model: "DocumentChauffeurDrive", recordId: "licence-gelee" }];
  });

  it("conserve le fichier et la ligne d'une pièce de livreur sous gel, supprime les autres", async () => {
    resultats["user.findUnique"] = utilisateur({
      driver: { id: "livreur-1", email: "l@x.test", name: "L", documents: [{ id: "doc-gele", documentUrl: "/prive/gele.pdf" }, { id: "doc-libre", documentUrl: "/prive/libre.pdf" }] },
    });
    await completeErasure("alice");
    expect(removePrivate).toHaveBeenCalledTimes(1);
    expect(removePrivate).toHaveBeenCalledWith("prive/libre.pdf");
    expect(de("courierDocument", "deleteMany")[0].args.where).toEqual({ driverId: "livreur-1", id: { notIn: ["doc-gele"] } });
  });

  it("conserve la licence de chauffeur sous gel", async () => {
    resultats["user.findUnique"] = utilisateur({
      chauffeurDrive: { id: "chauffeur-1", documents: [{ id: "licence-gelee", url: "/prive/licence.pdf" }, { id: "assurance", url: "/prive/assurance.pdf" }] },
    });
    await completeErasure("alice");
    expect(removePrivate.mock.calls.map(c => c[0])).toEqual(["prive/assurance.pdf"]);
    expect(de("documentChauffeurDrive", "deleteMany")[0].args.where).toEqual({ chauffeurId: "chauffeur-1", id: { notIn: ["licence-gelee"] } });
  });

  it("ignore un gel expiré : seuls les gels en cours protègent une pièce", async () => {
    await completeErasure("alice");
    expect(de("privacyLegalHold", "findMany")[0].args.where).toEqual({ expiresAt: { gt: expect.any(Date) } });
  });
});
