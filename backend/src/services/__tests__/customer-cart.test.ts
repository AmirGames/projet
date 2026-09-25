import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const db: any = {
  store: { findUnique: jest.fn() },
  customerCart: { findMany: jest.fn(), deleteMany: jest.fn(), upsert: jest.fn() },
};
const emitUserEvent = jest.fn();

jest.mock("../db", () => ({ db }));
jest.mock("../../config/socket", () => ({ emitUserEvent }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CustomerCartService, panierSchema } from "../customer-cart.service";

const client = { id: "client-1", email: "client@exemple.fr" };
const ligne = { productId: "p1", name: "Margherita", price: 9.5, quantity: 2 };

describe("Paniers du client, d'un appareil à l'autre", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.store.findUnique.mockResolvedValue({ id: "store-1", name: "Pizzeria", slug: "pizzeria", deletedAt: null });
    db.customerCart.upsert.mockImplementation(async ({ create }: any) => ({
      ...create,
      storeLogo: create.storeLogo ?? null,
      updatedAt: new Date("2026-09-25T12:00:00Z"),
    }));
    db.customerCart.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("enregistre le panier et l'annonce aux autres appareils du compte", async () => {
    const panier = await CustomerCartService.enregistrer(client, "store-1", {
      lignes: [ligne],
      appareil: "telephone-1",
    });

    expect(panier).toMatchObject({ storeId: "store-1", storeName: "Pizzeria", storeSlug: "pizzeria", lignes: [ligne] });
    expect(emitUserEvent).toHaveBeenCalledWith(
      "client@exemple.fr",
      "panier-modifie",
      expect.objectContaining({ storeId: "store-1", appareil: "telephone-1", majA: "2026-09-25T12:00:00.000Z" })
    );
  });

  it("garde un panier vidé comme trace, sans articles", async () => {
    const panier = await CustomerCartService.enregistrer(client, "store-1", { lignes: [] });
    expect(panier.lignes).toEqual([]);
    expect(db.customerCart.upsert).toHaveBeenCalled();
  });

  it("refuse un commerce qui n'existe pas", async () => {
    db.store.findUnique.mockResolvedValue(null);
    await expect(CustomerCartService.enregistrer(client, "inconnu", { lignes: [ligne] })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(emitUserEvent).not.toHaveBeenCalled();
  });

  it("oublie les paniers vidés depuis plus d'un mois", async () => {
    const vieux = { id: "a", storeId: "s1", storeName: "", storeSlug: null, storeLogo: null, lines: [], updatedAt: new Date(Date.now() - 40 * 86400000) };
    const vivant = { id: "b", storeId: "s2", storeName: "", storeSlug: null, storeLogo: null, lines: [ligne], updatedAt: new Date() };
    db.customerCart.findMany.mockResolvedValue([vivant, vieux]);

    const paniers = await CustomerCartService.lister("client-1");

    expect(paniers.map((p) => p.storeId)).toEqual(["s2"]);
    expect(db.customerCart.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } } });
  });

  it("refuse une quantité hors limites", () => {
    expect(() => panierSchema.parse({ lignes: [{ ...ligne, quantity: 0 }] })).toThrow();
  });
});
