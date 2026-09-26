import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let n = 0;
const creer = () => jest.fn(async ({ data }: any) => ({ id: `new-${++n}`, ...data }));
const tx: any = {
  store: { update: jest.fn() },
  theme: { create: creer() },
  category: { create: creer() },
  product: { create: creer() },
  productImage: { createMany: jest.fn() },
  productMedia: { createMany: jest.fn() },
  productOption: { create: creer() },
  productVariant: { create: creer() },
  productSeo: { create: creer() },
  productTag: { createMany: jest.fn() },
  taxSetting: { createMany: jest.fn() },
  deliveryZone: { createMany: jest.fn() },
  promotion: { createMany: jest.fn() },
  paymentMethod: { createMany: jest.fn() },
};
const db: any = {
  membership: { findFirst: jest.fn() },
  store: { findFirst: jest.fn(), findUnique: jest.fn(), delete: jest.fn(async () => ({})) },
  $transaction: jest.fn(async (fn: any) => fn(tx)),
};
const create: any = jest.fn();
const verifierCreationBoutique: any = jest.fn();
const compteDuJeton: any = jest.fn();

jest.mock("../db", () => ({ db }));
jest.mock("../store.service", () => ({ StoreService: { create } }));
jest.mock("../plan.service", () => ({ PlanService: { verifierCreationBoutique } }));
jest.mock("../../middleware/auth", () => ({ compteDuJeton }));
jest.mock("../../config/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { StoreDuplicationService } from "../store-duplication.service";

const modele = {
  id: "src",
  orgId: "org-1",
  email: "shop@exemple.fr",
  description: "Ouvert la nuit",
  businessType: "grocery",
  cuisineType: null,
  settings: { currency: "EUR" },
  operatingHours: { MON: { closed: false } },
  pickupSlots: [],
  acceptsDelivery: true,
  acceptsPickup: true,
  deliveryCost: 2,
  minDeliveryAmount: 10,
  theme: null,
  categories: [{ id: "cat-a", name: "Boissons", displayOrder: 0, sortMode: "MANUAL" }],
  products: [
    {
      id: "p-a",
      sku: "COCA",
      name: "Coca",
      price: 2,
      categoryId: "cat-a",
      images: [{ url: "/u/coca.jpg", order: 0 }],
      media: [],
      options: [{ id: "opt-a", name: "Taille", choices: ["33cl"], isRequired: true, pricingType: "none" }],
      variants: [{ sku: "COCA-33", label: "33cl", combination: { "opt-a": "33cl" }, price: null, stock: 5, isAvailable: true }],
      seo: null,
    },
  ],
  tags: [],
  taxSettings: [{ name: "TVA", rate: 6, included: true, applicableTo: "categories", categoryIds: ["cat-a"], productIds: ["p-a"], status: "ACTIVE" }],
  deliveryZones: [],
  promotions: [],
  paymentMethods: [],
};

describe("Dupliquer une boutique", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    n = 0;
    db.store.findFirst.mockResolvedValue(modele);
    compteDuJeton.mockResolvedValue({ isSuperOwner: false, isSystemAdmin: false });
    db.membership.findFirst.mockResolvedValue({ id: "m-1" });
    create.mockResolvedValue({ id: "store-2", slug: "night-shop-02" });
  });

  it("recopie le catalogue sous le nouveau nom, la nouvelle adresse et le nouveau téléphone", async () => {
    await StoreDuplicationService.duplicate("user-1", "src", {
      name: "Night Shop 02",
      slug: "night-shop-02",
      address: "2 rue B",
      phone: "0102",
    });

    expect(verifierCreationBoutique).toHaveBeenCalledWith("org-1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", name: "Night Shop 02", address: "2 rue B", phone: "0102", businessType: "grocery" })
    );

    const categorie = await tx.category.create.mock.results[0].value;
    const produit = tx.product.create.mock.calls[0][0].data;
    expect(produit).toMatchObject({ storeId: "store-2", sku: "COCA", categoryId: categorie.id });

    const option = await tx.productOption.create.mock.results[0].value;
    expect(tx.productVariant.create.mock.calls[0][0].data.combination).toEqual({ [option.id]: "33cl" });

    const produitCree = await tx.product.create.mock.results[0].value;
    expect(tx.taxSetting.createMany.mock.calls[0][0].data[0]).toMatchObject({
      categoryIds: [categorie.id],
      productIds: [produitCree.id],
    });
  });

  it("efface la boutique à moitié copiée si la copie échoue", async () => {
    tx.category.create.mockRejectedValueOnce(new Error("boom"));

    await expect(StoreDuplicationService.duplicate("user-1", "src", { name: "X2", slug: "x2" })).rejects.toThrow("boom");
    expect(db.store.delete).toHaveBeenCalledWith({ where: { id: "store-2" } });
  });

  it("refuse de copier la boutique d'un autre commerçant", async () => {
    db.membership.findFirst.mockResolvedValue(null);

    await expect(
      StoreDuplicationService.duplicate("intrus", "src", { name: "Copie", slug: "copie" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(db.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "intrus", orgId: "org-1" } }));
    expect(create).not.toHaveBeenCalled();
  });
});
