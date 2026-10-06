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
  PERMISSIONS_PAR_DEFAUT,
} from "../permissions-plateforme.service";

const roles = [
  { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: {} },
  { code: "ADMIN", label: "Administrateur", permissions: { billing: "write", organizations: "read" } },
  { code: "SUPPORT", label: "Support", permissions: { "support-tickets": "write", organizations: "read" } },
  { code: "MODERATION", label: "Modération", permissions: { organizations: "write" } },
  { code: "FACTURATION", label: "Facturation", permissions: { billing: "write", payouts: "read" } },
  { code: "GESTION_ORG", label: "Gestion organisations", permissions: { organizations: "write" } },
  { code: "SUPPORT_LIVREURS", label: "Support livreurs", permissions: { "driver-support": "write" } },
  { code: "FORMULES", label: "Formules", permissions: { formules: "write" } },
];

const rolesDrive = [
  { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: { organizations: "write" } },
  { code: "ADMIN", label: "Administrateur", permissions: {} },
  { code: "SUPPORT", label: "Support", permissions: {} },
];

async function passer(routeur: any, compte: any, method: string, path: string, plateforme?: any) {
  let erreur: any;
  await exigerPermission(routeur, plateforme)({ compte, method, path } as any, { json: jest.fn() } as any, (e?: any) => {
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
    // Le dossier d'un incident (données personnelles) a sa propre section,
    // distincte du suivi des incidents par le support.
    expect(sectionDeLaRoute("superowner", "/delivery-incidents")).toBe("driver-support");
    expect(sectionDeLaRoute("superowner", "/delivery-incidents/i1/clore")).toBe("driver-support");
    expect(sectionDeLaRoute("superowner", "/delivery-incidents/i1/dossier")).toBe("incidents-export");
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

describe("export du dossier d'incident", () => {
  it("est ouvert par défaut au SuperAdmin et à l'Administrateur, pas au Support", () => {
    expect(PERMISSIONS_PAR_DEFAUT.SUPER_ADMIN["incidents-export"]).toBe("write");
    expect(PERMISSIONS_PAR_DEFAUT.ADMIN["incidents-export"]).toBe("write");
    expect(PERMISSIONS_PAR_DEFAUT.SUPPORT["incidents-export"]).toBeUndefined();
  });
});

describe("permissions indépendantes de la casse et du codage de l'URL", () => {
  beforeEach(() => {
    oublierRoles();
    db.platformRole.findMany.mockImplementation(async () => roles);
  });
  it.each(["close", "CLOSE", "%63lose", "ClOsE"])("fermeture %s exige le droit spécifique", async segment => {
    expect(sectionDeLaRoute("superowner", `/organizations/OrgAbC/${segment}`)).toBe("organizations-close");
    expect(await passer("superowner", membre("GESTION_ORG"), "POST", `/organizations/OrgAbC/${segment}`)).toBe(403);
  });
  it.each(["tier", "TIER", "%74ier", "commission-promo", "COMMISSION-PROMO", "conditions", "CONDITIONS"])("formule %s ne se modifie pas avec le seul droit organisation", async segment => {
    expect(await passer("superowner", membre("GESTION_ORG"), "PATCH", `/organizations/OrgAbC/${segment}`)).toBe(403);
  });
  it("le PATCH historique exige Formules, tandis que le GET conserve Organisations", async () => {
    expect(await passer("admin", membre("GESTION_ORG"), "PATCH", "/Merchants/OrgAbC")).toBe(403);
    expect(await passer("admin", membre("FORMULES"), "PATCH", "/Merchants/OrgAbC")).toBe(200);
    expect(await passer("admin", membre("GESTION_ORG"), "GET", "/Merchants/OrgAbC")).toBe(200);
    expect(await passer("superowner", membre("FORMULES"), "PATCH", "/Organizations/OrgAbC/Conditions")).toBe(200);
  });
  it.each(["dossier", "DOSSIER", "%64ossier"])("export %s n'est pas couvert par le support livreur", async segment => {
    expect(sectionDeLaRoute("superowner", `/delivery-incidents/incident/${segment}`)).toBe("incidents-export");
    expect(await passer("superowner", membre("SUPPORT_LIVREURS"), "GET", `/delivery-incidents/incident/${segment}`)).toBe(403);
  });
  it.each(["CLOSE", "RESTORE-FROM-BACKUP"])("route admin %s exige le droit de fermeture", async segment => {
    expect(await passer("admin", membre("GESTION_ORG"), "POST", `/merchants/OrgAbC/${segment}`)).toBe(403);
  });
  it.each(["/ADMINS", "/RoLeS", "/%72oles"])("la gestion d'équipe %s reste réservée au superowner", async path => {
    expect(await passer("superowner", membre("SUPER_ADMIN"), "PUT", path)).toBe(403);
  });
  it("un nom de route voisin n'hérite pas d'une permission", () => {
    expect(sectionDeLaRoute("superowner", "/organizations-autre")).toBeNull();
    expect(sectionDeLaRoute("superowner", "/api-keys-autre")).toBeNull();
    expect(sectionDeLaRoute("zupdrive", "/courses-autre")).toBeNull();
  });
  it("les opérations légitimes restent accessibles avec leur permission", async () => {
    expect(await passer("superowner", membre("GESTION_ORG"), "PATCH", "/Organizations/OrgAbC")).toBe(200);
    expect(await passer("superowner", membre("SUPPORT_LIVREURS"), "POST", "/DRIVER-SUPPORT/incident")).toBe(200);
    expect(await passer("superowner", membre("ADMIN"), "HEAD", "/ORGANIZATIONS/OrgAbC")).toBe(200);
  });
});
