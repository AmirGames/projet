import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  platformRole: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import {
  exigerPermission,
  oublierRoles,
  sectionDeLaRoute,
  nettoyerPermissions,
  codeDuLibelle,
  voitLesFinances,
} from "../permissions-plateforme.service";

const roles = [
  { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: {} },
  { code: "ADMIN", label: "Administrateur", permissions: { billing: "write", organizations: "read" } },
  { code: "SUPPORT", label: "Support", permissions: { "support-tickets": "write", organizations: "read" } },
  { code: "MODERATION", label: "Modération", permissions: { organizations: "write" } },
  { code: "FACTURATION", label: "Facturation", permissions: { billing: "write", payouts: "read" } },
];

const rolesDrive = [
  { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: { organizations: "write" } },
  { code: "ADMIN", label: "Administrateur", permissions: {} },
  { code: "SUPPORT", label: "Support", permissions: {} },
];

async function passer(routeur: any, compte: any, method: string, path: string, plateforme?: any) {
  let erreur: any;
  await exigerPermission(routeur, plateforme)({ compte, method, path } as any, {} as any, (e?: any) => {
    erreur = e;
  });
  return erreur ? erreur.statusCode ?? 403 : 200;
}

const membre = (roleEat: string | null, roleDrive?: string) => ({
  id: "u",
  isSuperOwner: false,
  isSystemAdmin: true,
  acces: { ...(roleEat ? { EAT: roleEat } : {}), ...(roleDrive ? { DRIVE: roleDrive } : {}) },
});

describe("permissions de l'équipe", () => {
  beforeEach(() => {
    oublierRoles();
    db.platformRole.findMany.mockImplementation(async ({ where }: any) =>
      where?.plateforme === "DRIVE" ? rolesDrive : roles
    );
  });

  it("rattache chaque route à sa section", () => {
    expect(sectionDeLaRoute("superowner", "/organizations/o1/tier")).toBe("formules");
    expect(sectionDeLaRoute("superowner", "/organizations/o1/suspend")).toBe("organizations");
    expect(sectionDeLaRoute("admin", "/tickets/t1")).toBe("support-tickets");
    // Fermer et rouvrir un compte fermé : un droit à part de la suspension.
    expect(sectionDeLaRoute("admin", "/merchants/o1/suspend")).toBe("organizations");
    expect(sectionDeLaRoute("admin", "/merchants/o1/unsuspend")).toBe("organizations");
    expect(sectionDeLaRoute("admin", "/merchants/o1/close")).toBe("organizations-close");
    expect(sectionDeLaRoute("admin", "/merchants/o1/restore-from-backup")).toBe("organizations-close");
    expect(sectionDeLaRoute("superowner", "/organizations/o1/close")).toBe("organizations-close");
    expect(sectionDeLaRoute("superowner", "/admins")).toBeNull();
    expect(sectionDeLaRoute("superowner", "/roles/ADMIN")).toBeNull();
  });

  it("laisse passer le superowner partout", async () => {
    const so = { id: "s", isSuperOwner: true, isSystemAdmin: true, acces: {} };
    expect(await passer("superowner", so, "POST", "/admins")).toBe(200);
  });

  it("distingue lecture et modification", async () => {
    expect(await passer("superowner", membre("SUPPORT"), "GET", "/organizations")).toBe(200);
    expect(await passer("superowner", membre("SUPPORT"), "POST", "/organizations/o1/suspend")).toBe(403);
    expect(await passer("superowner", membre("SUPPORT"), "GET", "/billing")).toBe(403);
    expect(await passer("admin", membre("SUPPORT"), "PATCH", "/tickets/t1")).toBe(200);
    expect(await passer("superowner", membre("ADMIN"), "POST", "/orders/x/refund")).toBe(200);
  });

  it("laisse suspendre sans laisser fermer", async () => {
    expect(await passer("admin", membre("MODERATION"), "POST", "/merchants/o1/suspend")).toBe(200);
    expect(await passer("admin", membre("MODERATION"), "POST", "/merchants/o1/unsuspend")).toBe(200);
    expect(await passer("admin", membre("MODERATION"), "POST", "/merchants/o1/close")).toBe(403);
    expect(await passer("superowner", membre("MODERATION"), "POST", "/organizations/o1/close")).toBe(403);
  });

  it("réserve l'équipe et les rôles au superowner", async () => {
    expect(await passer("superowner", membre("SUPER_ADMIN"), "GET", "/admins")).toBe(403);
    expect(await passer("admin", membre("ADMIN"), "POST", "/admins")).toBe(403);
  });

  it("refuse un administrateur sans rôle", async () => {
    expect(await passer("superowner", membre(null), "GET", "/organizations")).toBe(403);
  });

  it("lit le rôle de la plateforme demandée, pas celui d'une autre", async () => {
    // Support sur ZupEat, SuperAdmin sur ZupDrive.
    const double = membre("SUPPORT", "SUPER_ADMIN");
    expect(await passer("superowner", double, "POST", "/organizations/o1/suspend")).toBe(403);
    expect(await passer("superowner", double, "POST", "/organizations/o1/suspend", "DRIVE")).toBe(200);
    // Aucun rôle sur ZupEat : les routes de ZupEat restent fermées.
    const driveSeul = membre(null, "SUPER_ADMIN");
    expect(await passer("superowner", driveSeul, "GET", "/organizations")).toBe(403);
  });

  it("applique les droits d'un rôle créé par le superowner", async () => {
    expect(await passer("superowner", membre("FACTURATION"), "POST", "/orders/x/refund")).toBe(200);
    expect(await passer("superowner", membre("FACTURATION"), "GET", "/payouts")).toBe(200);
    expect(await passer("superowner", membre("FACTURATION"), "POST", "/payouts/draw")).toBe(403);
    expect(await passer("superowner", membre("FACTURATION"), "GET", "/organizations")).toBe(403);
    expect(await passer("superowner", membre("SUPPRIME"), "GET", "/billing")).toBe(403);
  });

  it("ne montre les chiffres financiers qu'aux rôles qui ont Facturation", async () => {
    expect(await voitLesFinances({ id: "s", isSuperOwner: true, isSystemAdmin: true, acces: {} } as any)).toBe(true);
    expect(await voitLesFinances(membre("FACTURATION"))).toBe(true);
    expect(await voitLesFinances(membre("ADMIN"))).toBe(true);
    expect(await voitLesFinances(membre("SUPPORT"))).toBe(false);
    expect(await voitLesFinances(undefined)).toBe(false);
    // Facturation sur ZupEat n'ouvre pas les chiffres de ZupDrive.
    expect(await voitLesFinances(membre("FACTURATION"), "DRIVE")).toBe(false);
  });

  it("tire un code stable du nom du rôle", () => {
    expect(codeDuLibelle("Facturation & compta")).toBe("FACTURATION_COMPTA");
    expect(codeDuLibelle("  Équipe réseau ")).toBe("EQUIPE_RESEAU");
  });

  it("écarte les sections et niveaux inconnus", () => {
    expect(nettoyerPermissions({ billing: "write", inconnu: "read", stores: "tout" })).toEqual({
      billing: "write",
    });
  });
});
