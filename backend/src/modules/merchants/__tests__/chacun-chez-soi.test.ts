import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("../../../services/db", () => ({ db: require("../../../test-support/base-locataires").db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../auth/security-event.service", () => ({ SecurityEventService: { record: jest.fn() } }));
// Seule la cryptographie du jeton est simulée : le jeton est le nom de l'utilisateur.
jest.mock("../../auth/auth.service", () => ({ AuthService: { verifyAccessToken: (jeton: string) => require("../../../test-support/base-locataires").verifierJetonFactice(jeton) } }));
jest.mock("../../auth/sso.service", () => ({ SsoService: { sessionActive: async () => true } }));
jest.mock("../../files/file-upload.middleware", () => ({ uploadMiddleware: { single: () => (_req: any, _res: any, next: any) => next() } }));
jest.mock("../merchant-profile.service", () => ({
  TYPES_DOCUMENT_COMMERCANT: ["KBIS", "ID_CARD"],
  libelleDuDocumentCommercant: (type: string) => type,
  MerchantProfileService: {
    profil: jest.fn(async () => ({ legalName: "Société A" })),
    enregistrer: jest.fn(async () => ({ legalName: "Société A" })),
    deposerPiece: jest.fn(async () => ({ id: "piece" })),
    retirerPiece: jest.fn(async () => undefined),
  },
}));
jest.mock("../merchant-approval.service", () => ({ MerchantApprovalService: { soumettre: jest.fn(async () => ({})) } }));

import organizationRouter from "../organization.routes";
import staffRouter from "../staff.routes";
import merchantProfileRouter from "../merchant-profile.routes";
import { MerchantProfileService } from "../merchant-profile.service";
import { cloisonnement } from "../../auth/cloisonnement.middleware";
import { errorHandler } from "../../../middleware/errorHandler";
import { ID, ecritures, reinitialiser } from "../../../test-support/base-locataires";

function application(avecVerrouGlobal: boolean) {
  const app = express();
  app.use(express.json());
  if (avecVerrouGlobal) app.use(cloisonnement);
  app.use("/api/organizations", organizationRouter);
  app.use("/api/staff", staffRouter);
  app.use("/api/merchant-profile", merchantProfileRouter);
  app.use(errorHandler);
  return app;
}
const AVEC_VERROU = application(true);
const SANS_VERROU = application(false);

const appeler = (app: express.Express, methode: string, chemin: string, corps?: unknown, qui?: string) => {
  const appel = (request(app) as any)[methode](chemin);
  if (qui) appel.set("Authorization", `Bearer ${qui}`);
  return corps === undefined ? appel : appel.send(corps);
};

type Operation = [string, string, unknown];

const NOUVEAU_PERSONNEL = { name: "Intrus", email: "intrus@exemple.test", role: "MANAGER" };

/** Le personnel de l'organisation A : boutique A1 (staffA1) et boutique A2 (staffA2). */
const PERSONNEL_DE_A: Operation[] = [
  ["get", `/api/staff/${ID.staffA1}`, undefined],
  ["put", `/api/staff/${ID.staffA1}`, { name: "Piraté" }],
  ["patch", `/api/staff/${ID.staffA1}/status`, { status: "SUSPENDED" }],
  ["delete", `/api/staff/${ID.staffA1}`, undefined],
  ["post", "/api/staff", { ...NOUVEAU_PERSONNEL, storeId: ID.storeA1 }],
];

/** Des listes : sans verrou global, la garde locale filtre au lieu de refuser — rien ne doit sortir. */
const LISTES_DU_PERSONNEL: Operation[] = [
  ["get", `/api/staff?storeId=${ID.storeA1}`, undefined],
  ["get", `/api/staff?orgId=${ID.orgA}`, undefined],
];

const ORGANISATION_A: Operation[] = [
  ["get", `/api/organizations/${ID.orgA}`, undefined],
  ["put", `/api/organizations/${ID.orgA}`, { name: "Piratée", tier: "PRO" }],
  ["delete", `/api/organizations/${ID.orgA}`, undefined],
];

const PROFIL_DE_A: Operation[] = [
  ["get", `/api/merchant-profile/${ID.orgA}`, undefined],
  ["put", `/api/merchant-profile/${ID.orgA}`, { legalName: "Piratée", iban: "BE68539007547034" }],
  ["post", `/api/merchant-profile/${ID.orgA}/documents`, { type: "KBIS", documentUrl: "https://exemple.test/kbis.pdf" }],
  ["post", `/api/merchant-profile/${ID.orgA}/documents/upload`, {}],
  ["delete", `/api/merchant-profile/${ID.orgA}/documents/piece-a`, undefined],
];

const REFUS = [403, 404];
const CODES_DE_REFUS = ["STORE_ACCESS_DENIED", "CROSS_TENANT_DENIED", "FORBIDDEN", "STAFF_NOT_FOUND"];

beforeEach(() => {
  reinitialiser();
  (MerchantProfileService.enregistrer as jest.Mock).mockClear();
});

describe.each([["avec le verrou global", AVEC_VERROU], ["routeur monté seul (garde locale)", SANS_VERROU]])(
  "personnel — Chacun chez soi, %s",
  (_nom, app) => {
    it.each(PERSONNEL_DE_A)("anonyme : %s %s → 401", async (methode, chemin, corps) => {
      expect((await appeler(app, methode, chemin, corps)).status).toBe(401);
      expect(ecritures).toEqual([]);
    });

    it.each(PERSONNEL_DE_A)("Bob (autre organisation) : %s %s → refusé, aucune écriture", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "bob");
      expect(REFUS).toContain(r.status);
      expect(CODES_DE_REFUS).toContain(r.body?.code);
      expect(ecritures).toEqual([]);
    });

    it.each(PERSONNEL_DE_A)("Erin (aucune organisation) : %s %s → refusé, aucune écriture", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "erin");
      expect(REFUS).toContain(r.status);
      expect(ecritures).toEqual([]);
    });

    it.each(PERSONNEL_DE_A)("Carol (employée) : %s %s → le personnel est réservé aux gérants", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "carol");
      expect(REFUS).toContain(r.status);
      expect(ecritures).toEqual([]);
    });

    it.each(LISTES_DU_PERSONNEL)("anonyme : %s %s → 401", async (methode, chemin) => {
      expect((await appeler(app, methode, chemin)).status).toBe(401);
    });

    it.each(["bob", "erin", "carol"])("%s ne lit aucun membre du personnel d'Alice (refus ou liste vide)", async qui => {
      for (const [methode, chemin] of LISTES_DU_PERSONNEL) {
        const r = await appeler(app, methode, chemin, undefined, qui);
        if (r.status === 200) expect(r.body.staff).toEqual([]);
        else expect(REFUS).toContain(r.status);
      }
    });

    it("Bob ne crée pas de personnel dans une boutique d'Alice, même en se déclarant dans la sienne", async () => {
      const r = await appeler(app, "post", "/api/staff", { ...NOUVEAU_PERSONNEL, storeId: ID.storeA1, orgId: ID.orgB }, "bob");
      expect(REFUS).toContain(r.status);
      expect(ecritures).toEqual([]);
    });

    it("Dave (gérant de A1) ne touche pas au personnel de A2", async () => {
      for (const [methode, chemin, corps] of [
        ["put", `/api/staff/${ID.staffA2}`, { name: "Piraté" }],
        ["patch", `/api/staff/${ID.staffA2}/status`, { status: "SUSPENDED" }],
        ["delete", `/api/staff/${ID.staffA2}`, undefined],
        ["post", "/api/staff", { ...NOUVEAU_PERSONNEL, storeId: ID.storeA2 }],
      ] as Operation[]) {
        const r = await appeler(app, methode, chemin, corps, "dave");
        expect(REFUS).toContain(r.status);
      }
      expect(ecritures).toEqual([]);
    });
  }
);

describe("personnel — le propriétaire reste servi", () => {
  it.each([["avec verrou", AVEC_VERROU], ["sans verrou", SANS_VERROU]])("Alice gère le personnel de ses deux boutiques : %s", async (_nom, app) => {
    expect((await appeler(app, "put", `/api/staff/${ID.staffA2}`, { name: "Renommé" }, "alice")).status).toBe(200);
    expect((await appeler(app, "patch", `/api/staff/${ID.staffA1}/status`, { status: "INACTIVE" }, "alice")).status).toBe(200);
    expect((await appeler(app, "post", "/api/staff", { ...NOUVEAU_PERSONNEL, storeId: ID.storeA2 }, "alice")).status).toBe(201);
    expect((await appeler(app, "delete", `/api/staff/${ID.staffA1}`, undefined, "alice")).status).toBe(200);
    expect(ecritures).toEqual(["staff.update", "staff.update", "staff.create", "staff.delete"]);
  });

  it("Dave gère le personnel de sa boutique A1", async () => {
    expect((await appeler(AVEC_VERROU, "put", `/api/staff/${ID.staffA1}`, { name: "Renommé" }, "dave")).status).toBe(200);
    expect(ecritures).toEqual(["staff.update"]);
  });

  it.each([["avec verrou", AVEC_VERROU], ["sans verrou", SANS_VERROU]])("Alice liste son personnel par boutique et par organisation : %s", async (_nom, app) => {
    const parBoutique = await appeler(app, "get", `/api/staff?storeId=${ID.storeA1}`, undefined, "alice");
    expect(parBoutique.body.staff.map((p: any) => p.id)).toEqual([ID.staffA1]);
    const parOrganisation = await appeler(app, "get", `/api/staff?orgId=${ID.orgA}`, undefined, "alice");
    expect(parOrganisation.body.staff.map((p: any) => p.id).sort()).toEqual([ID.staffA1, ID.staffA2].sort());
  });

  it("la création refuse un storeId qui n'est pas un identifiant de boutique valide", async () => {
    const r = await appeler(SANS_VERROU, "post", "/api/staff", { ...NOUVEAU_PERSONNEL, storeId: "n-importe-quoi" }, "alice");
    expect(r.status).toBe(400);
    expect(ecritures).toEqual([]);
  });
});

describe("organisations — Chacun chez soi (verrou global)", () => {
  it.each(ORGANISATION_A)("anonyme : %s %s → 401", async (methode, chemin, corps) => {
    expect((await appeler(AVEC_VERROU, methode, chemin, corps)).status).toBe(401);
    expect(ecritures).toEqual([]);
  });

  it.each(ORGANISATION_A)("Bob : %s %s → CROSS_TENANT_DENIED, aucune écriture", async (methode, chemin, corps) => {
    const r = await appeler(AVEC_VERROU, methode, chemin, corps, "bob");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CROSS_TENANT_DENIED");
    expect(ecritures).toEqual([]);
  });

  it.each(ORGANISATION_A)("Erin (sans organisation) : %s %s → refusé", async (methode, chemin, corps) => {
    const r = await appeler(AVEC_VERROU, methode, chemin, corps, "erin");
    expect(r.status).toBe(403);
    expect(ecritures).toEqual([]);
  });

  it.each(ORGANISATION_A)("Dave (gérant) et Carol (employée) : %s %s → réservé à l'administrateur", async (methode, chemin, corps) => {
    for (const qui of ["dave", "carol"]) {
      const r = await appeler(AVEC_VERROU, methode, chemin, corps, qui);
      expect(r.status).toBe(403);
    }
    expect(ecritures).toEqual([]);
  });

  it("Bob ne s'attribue pas la formule PRO de l'organisation d'Alice en visant son identifiant", async () => {
    const r = await appeler(AVEC_VERROU, "put", `/api/organizations/${ID.orgA}`, { tier: "PRO" }, "bob");
    expect(r.status).toBe(403);
    expect(ecritures).toEqual([]);
  });

  it("Alice, administratrice, modifie sa propre organisation", async () => {
    const r = await appeler(AVEC_VERROU, "put", `/api/organizations/${ID.orgA}`, { name: "Nouveau nom" }, "alice");
    expect(r.status).toBe(200);
    expect(ecritures).toEqual(["organization.update"]);
  });

  it("l'accès public par slug ne passe pas par le verrou et n'expose pas les membres", async () => {
    const r = await appeler(AVEC_VERROU, "get", "/api/organizations/slug/boulangerie");
    expect([200, 404]).toContain(r.status);
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });
});

describe("profil commerçant — Chacun chez soi", () => {
  describe.each([["avec le verrou global", AVEC_VERROU], ["routeur monté seul (garde locale)", SANS_VERROU]])("%s", (_nom, app) => {
    it.each(PROFIL_DE_A)("anonyme : %s %s → 401", async (methode, chemin, corps) => {
      expect((await appeler(app, methode, chemin, corps)).status).toBe(401);
    });

    it.each(PROFIL_DE_A)("Bob : %s %s → 403, le service n'est pas appelé", async (methode, chemin, corps) => {
      const r = await appeler(app, methode, chemin, corps, "bob");
      expect(r.status).toBe(403);
      expect(MerchantProfileService.profil).not.toHaveBeenCalled();
      expect(MerchantProfileService.enregistrer).not.toHaveBeenCalled();
      expect(MerchantProfileService.retirerPiece).not.toHaveBeenCalled();
      expect(ecritures).toEqual([]);
    });

    it.each(PROFIL_DE_A)("Erin : %s %s → 403", async (methode, chemin, corps) => {
      expect((await appeler(app, methode, chemin, corps, "erin")).status).toBe(403);
    });
  });

  it("Alice lit puis met à jour le profil de sa propre organisation", async () => {
    expect((await appeler(AVEC_VERROU, "get", `/api/merchant-profile/${ID.orgA}`, undefined, "alice")).status).toBe(200);
    expect((await appeler(AVEC_VERROU, "put", `/api/merchant-profile/${ID.orgA}`, { legalName: "Société A" }, "alice")).status).toBe(200);
    expect(MerchantProfileService.enregistrer).toHaveBeenCalledWith(ID.orgA, expect.objectContaining({ legalName: "Société A" }));
  });

  it("le corps ne peut pas injecter un champ hors schéma (statut, approbation)", async () => {
    const r = await appeler(SANS_VERROU, "put", `/api/merchant-profile/${ID.orgA}`, { legalName: "Société A", status: "ACTIVE", approvedAt: "2020-01-01" }, "alice");
    expect(r.status).toBe(400);
    expect(MerchantProfileService.enregistrer).not.toHaveBeenCalled();
  });

  it("le verrou refuse un orgId d'une autre organisation glissé dans le corps", async () => {
    const r = await appeler(AVEC_VERROU, "put", `/api/merchant-profile/${ID.orgA}`, { legalName: "Société A", orgId: ID.orgB }, "alice");
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("CROSS_TENANT_DENIED");
    expect(MerchantProfileService.enregistrer).not.toHaveBeenCalled();
  });

  it("un IBAN invalide est refusé avant tout enregistrement", async () => {
    const r = await appeler(AVEC_VERROU, "put", `/api/merchant-profile/${ID.orgA}`, { iban: "pas-un-iban" }, "alice");
    expect(r.status).toBe(400);
    expect(MerchantProfileService.enregistrer).not.toHaveBeenCalled();
  });
});
