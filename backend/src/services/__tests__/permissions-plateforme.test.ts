import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  platformRole: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.mock("../db", () => ({ db }));
jest.mock("../../config/logger", () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

import {
  exigerPermission,
  oublierRoles,
  sectionDeLaRoute,
  nettoyerPermissions,
} from "../permissions-plateforme.service";

const roles = [
  { code: "SUPER_ADMIN", label: "SuperAdmin", permissions: {} },
  { code: "ADMIN", label: "Administrateur", permissions: { billing: "write", organizations: "read" } },
  { code: "SUPPORT", label: "Support", permissions: { "support-tickets": "write", organizations: "read" } },
];

async function passer(routeur: any, compte: any, method: string, path: string) {
  let erreur: any;
  await exigerPermission(routeur)({ compte, method, path } as any, {} as any, (e?: any) => {
    erreur = e;
  });
  return erreur ? erreur.statusCode ?? 403 : 200;
}

const membre = (platformRole: string | null) => ({
  id: "u",
  isSuperOwner: false,
  isSystemAdmin: true,
  platformRole,
});

describe("permissions de l'équipe", () => {
  beforeEach(() => {
    oublierRoles();
    db.platformRole.findMany.mockResolvedValue(roles);
  });

  it("rattache chaque route à sa section", () => {
    expect(sectionDeLaRoute("superowner", "/organizations/o1/tier")).toBe("formules");
    expect(sectionDeLaRoute("superowner", "/organizations/o1/suspend")).toBe("organizations");
    expect(sectionDeLaRoute("admin", "/tickets/t1")).toBe("support-tickets");
    expect(sectionDeLaRoute("superowner", "/admins")).toBeNull();
    expect(sectionDeLaRoute("superowner", "/roles/ADMIN")).toBeNull();
  });

  it("laisse passer le superowner partout", async () => {
    const so = { id: "s", isSuperOwner: true, isSystemAdmin: true, platformRole: null };
    expect(await passer("superowner", so, "POST", "/admins")).toBe(200);
  });

  it("distingue lecture et modification", async () => {
    expect(await passer("superowner", membre("SUPPORT"), "GET", "/organizations")).toBe(200);
    expect(await passer("superowner", membre("SUPPORT"), "POST", "/organizations/o1/suspend")).toBe(403);
    expect(await passer("superowner", membre("SUPPORT"), "GET", "/billing")).toBe(403);
    expect(await passer("admin", membre("SUPPORT"), "PATCH", "/tickets/t1")).toBe(200);
    expect(await passer("superowner", membre("ADMIN"), "POST", "/orders/x/refund")).toBe(200);
  });

  it("réserve l'équipe et les rôles au superowner", async () => {
    expect(await passer("superowner", membre("SUPER_ADMIN"), "GET", "/admins")).toBe(403);
    expect(await passer("super-admin", membre("ADMIN"), "POST", "/admins")).toBe(403);
  });

  it("refuse un administrateur sans rôle", async () => {
    expect(await passer("superowner", membre(null), "GET", "/organizations")).toBe(403);
  });

  it("écarte les sections et niveaux inconnus", () => {
    expect(nettoyerPermissions({ billing: "write", inconnu: "read", stores: "tout" })).toEqual({
      billing: "write",
    });
  });
});
