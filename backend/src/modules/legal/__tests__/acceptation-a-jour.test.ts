import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  acceptationConditions: { findMany: jest.fn() },
  pageLegaleVersion: { findFirst: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));

import { acceptationAJour } from "../acceptation-conditions.service";

const versions = (cgv: string, conf: string) => {
  db.pageLegaleVersion.findFirst.mockImplementation(async ({ where }: any) =>
    where.slug === "cgv"
      ? { slug: "cgv", version: cgv, titre: "", contenu: "", publieLe: new Date() }
      : { slug: "confidentialite", version: conf, titre: "", contenu: "", publieLe: new Date() }
  );
};

beforeEach(() => {
  db.acceptationConditions.findMany.mockReset();
  versions("v1", "v1");
});

describe("acceptationAJour", () => {
  it("est faux sans compte connecté, sans interroger la base", async () => {
    expect(await acceptationAJour(undefined)).toBe(false);
    expect(db.acceptationConditions.findMany).not.toHaveBeenCalled();
  });

  it("est vrai quand les versions acceptées sont les versions en vigueur", async () => {
    db.acceptationConditions.findMany.mockResolvedValue([{ version: "cgu@v1 cgv@v1 confidentialite@v1" }]);
    expect(await acceptationAJour("u1")).toBe(true);
  });

  it("redevient faux dès qu'un document est republié", async () => {
    db.acceptationConditions.findMany.mockResolvedValue([{ version: "cgu@v1 cgv@v1 confidentialite@v1" }]);
    versions("v2", "v1");
    expect(await acceptationAJour("u1")).toBe(false);
  });

  it("est faux sans aucune preuve enregistrée", async () => {
    db.acceptationConditions.findMany.mockResolvedValue([]);
    expect(await acceptationAJour("u1")).toBe(false);
  });
});
