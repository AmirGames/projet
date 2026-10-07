import { beforeEach, describe, expect, it, jest } from "@jest/globals";

/**
 * Les montants qui entrent dans le total d'une commande : la taxe de chaque
 * ligne et les suppléments choisis. Le serveur les recalcule seul ; ces
 * règles décident de ce que le client paie.
 */

const db: any = {
  taxSetting: { findMany: jest.fn() },
  product: { findMany: jest.fn() },
  productOption: { findMany: jest.fn() },
};
jest.mock("../../../services/db", () => ({ db }));
jest.mock("../../../config/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { TaxService } from "../tax.service";
import { SupplementService } from "../supplement.service";

const reglage = (surcharge: object = {}) => ({
  id: "t-tout",
  name: "TVA",
  rate: 12,
  included: true,
  applicableTo: "all",
  productIds: [] as string[],
  categoryIds: [] as string[],
  status: "ACTIVE",
  ...surcharge,
});

describe("TaxService.taxeDesLignes", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.product.findMany.mockResolvedValue([
      { id: "pizza", categoryId: "plats" },
      { id: "limonade", categoryId: "boissons" },
    ]);
  });

  it("sans réglage actif : aucune taxe", async () => {
    db.taxSetting.findMany.mockResolvedValue([]);
    const res = await TaxService.taxeDesLignes("s1", [{ productId: "pizza", montant: 10 }]);
    expect(res).toMatchObject({ total: 0, aAjouter: 0, taux: 0 });
    expect(res.parLigne).toEqual([{ taxRate: 0, taxAmount: 0 }]);
  });

  it("taxe comprise : la TVA s'extrait du prix (12 % dans 112 € = 12 €), rien ne s'ajoute", async () => {
    db.taxSetting.findMany.mockResolvedValue([reglage({ included: true })]);
    const res = await TaxService.taxeDesLignes("s1", [{ productId: "pizza", montant: 112 }]);
    expect(res.total).toBe(12);
    expect(res.aAjouter).toBe(0);
  });

  it("taxe non comprise : elle se calcule sur le prix et s'ajoute au total", async () => {
    db.taxSetting.findMany.mockResolvedValue([reglage({ included: false })]);
    const res = await TaxService.taxeDesLignes("s1", [{ productId: "pizza", montant: 100 }]);
    expect(res.total).toBe(12);
    expect(res.aAjouter).toBe(12);
  });

  it("des prix déjà TTC (prixTTC) : la taxe s'extrait même si le réglage est « non comprise »", async () => {
    db.taxSetting.findMany.mockResolvedValue([reglage({ included: false })]);
    const res = await TaxService.taxeDesLignes("s1", [{ productId: "pizza", montant: 112 }], { prixTTC: true });
    expect(res.total).toBe(12);
    expect(res.aAjouter).toBe(0);
  });

  it("une seule taxe par ligne, la plus précise : produit, puis catégorie, puis « tout »", async () => {
    db.taxSetting.findMany.mockResolvedValue([
      reglage({ id: "tout", name: "Tout", rate: 21, applicableTo: "all" }),
      reglage({ id: "cat", name: "Boissons", rate: 6, applicableTo: "categories", categoryIds: ["boissons"] }),
      reglage({ id: "prod", name: "Pizza", rate: 12, applicableTo: "products", productIds: ["pizza"] }),
    ]);
    const res = await TaxService.taxeDesLignes("s1", [
      { productId: "pizza", montant: 112 },
      { productId: "limonade", montant: 106 },
    ]);
    expect(res.parLigne).toEqual([
      { taxRate: 12, taxAmount: 12 },
      { taxRate: 6, taxAmount: 6 },
    ]);
    // Jamais cumulées : la limonade ne paie pas 6 % + 21 %.
    expect(res.total).toBe(18);
  });

  it("le taux retenu sur la commande est celui qui porte le plus gros montant", async () => {
    db.taxSetting.findMany.mockResolvedValue([
      reglage({ id: "cat", name: "Boissons", rate: 6, applicableTo: "categories", categoryIds: ["boissons"] }),
      reglage({ id: "tout", name: "Tout", rate: 12, applicableTo: "all" }),
    ]);
    const res = await TaxService.taxeDesLignes("s1", [
      { productId: "pizza", montant: 50 },
      { productId: "limonade", montant: 5 },
    ]);
    expect(res.taux).toBe(12);
    expect(res.detail.map((d) => d.nom).sort()).toEqual(["Boissons", "Tout"]);
  });

  it("aucune ligne : résultat vide sans interroger la base", async () => {
    expect(await TaxService.taxeDesLignes("s1", [])).toEqual({ total: 0, aAjouter: 0, taux: 0, detail: [], parLigne: [] });
    expect(db.taxSetting.findMany).not.toHaveBeenCalled();
  });
});

describe("SupplementService.tarifer", () => {
  const groupe = (surcharge: object = {}) => ({
    id: "g1",
    name: "Sauces",
    isRequired: false,
    maxChoices: null,
    displayOrder: 0,
    choices: [
      { id: "mayo", label: "Mayonnaise", price: 0.5, isAvailable: true },
      { id: "ketchup", label: "Ketchup", price: 0.5, isAvailable: true },
      { id: "andalouse", label: "Andalouse", price: 1, isAvailable: false },
    ],
    ...surcharge,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.productOption.findMany.mockResolvedValue([groupe()]);
  });

  it("additionne les suppléments choisis", async () => {
    const res = await SupplementService.tarifer("frites", "Frites", ["mayo", "ketchup"]);
    expect(res.montant).toBe(1);
    expect(res.retenus.map((s) => s.id)).toEqual(["mayo", "ketchup"]);
  });

  it("un même supplément envoyé deux fois ne compte qu'une fois", async () => {
    const res = await SupplementService.tarifer("frites", "Frites", ["mayo", "mayo"]);
    expect(res.montant).toBe(0.5);
  });

  it("ajoute la taxe à chaque supplément séparément quand la boutique saisit hors taxe", async () => {
    // 0,50 € HT + 21 % = 0,605 → 0,61 € ; deux suppléments = 1,22 €, pas 1,21 €.
    const res = await SupplementService.tarifer("frites", "Frites", ["mayo", "ketchup"], 21);
    expect(res.retenus.map((s) => s.price)).toEqual([0.61, 0.61]);
    expect(res.montant).toBe(1.22);
  });

  it("refuse un supplément indisponible, inconnu, ou demandé pour un plat qui n'en a pas", async () => {
    await expect(SupplementService.tarifer("frites", "Frites", ["andalouse"])).rejects.toMatchObject({ code: "SUPPLEMENT_UNAVAILABLE" });
    await expect(SupplementService.tarifer("frites", "Frites", ["fantome"])).rejects.toMatchObject({ code: "SUPPLEMENT_NOT_FOUND" });
    db.productOption.findMany.mockResolvedValue([]);
    await expect(SupplementService.tarifer("frites", "Frites", ["mayo"])).rejects.toMatchObject({ code: "SUPPLEMENT_NOT_FOUND" });
    expect(await SupplementService.tarifer("frites", "Frites", [])).toEqual({ montant: 0, retenus: [] });
  });

  it("un groupe obligatoire exige un choix ; un maximum est respecté", async () => {
    db.productOption.findMany.mockResolvedValue([groupe({ isRequired: true })]);
    await expect(SupplementService.tarifer("frites", "Frites", [])).rejects.toMatchObject({ code: "SUPPLEMENT_REQUIRED" });

    db.productOption.findMany.mockResolvedValue([groupe({ maxChoices: 1 })]);
    await expect(SupplementService.tarifer("frites", "Frites", ["mayo", "ketchup"])).rejects.toMatchObject({ code: "SUPPLEMENT_TOO_MANY" });
    expect((await SupplementService.tarifer("frites", "Frites", ["mayo"])).montant).toBe(0.5);
  });
});
