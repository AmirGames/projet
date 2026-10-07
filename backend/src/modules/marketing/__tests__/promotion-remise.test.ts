import { describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../services/db", () => ({ db: {} }));
import { calculerRemise, totalDesLignesEligibles } from "../promotion.service";

const promo = (surcharge: object = {}) => ({
  type: "PERCENTAGE",
  discountValue: 20,
  applicableToAll: false,
  productIds: ["p-eligible"],
  categoryIds: [] as string[],
  ...surcharge,
});

const panier = [
  { productId: "p-eligible", categoryId: "c1", price: 10, quantity: 1 },
  { productId: "autre", categoryId: "c2", price: 90, quantity: 1 },
];

describe("remise limitée à certains produits", () => {
  it("20 % sur un article à 10 € dans un panier à 100 € = 2 €", () => {
    const base = totalDesLignesEligibles(promo(), panier);
    expect(base).toBe(10);
    expect(calculerRemise(promo(), base)).toBe(2);
  });

  it("une promotion pour tout le panier porte sur toutes les lignes", () => {
    const toutes = promo({ applicableToAll: true });
    expect(calculerRemise(toutes, totalDesLignesEligibles(toutes, panier))).toBe(20);
  });

  it("une catégorie choisie couvre ses lignes", () => {
    const parCategorie = promo({ productIds: [], categoryIds: ["c2"] });
    expect(totalDesLignesEligibles(parCategorie, panier)).toBe(90);
  });

  it("aucune ligne éligible : base nulle", () => {
    expect(totalDesLignesEligibles(promo({ productIds: ["inconnu"] }), panier)).toBe(0);
  });

  it("compte la quantité et les suppléments (prix de ligne)", () => {
    const lignes = [{ productId: "p-eligible", price: 10.5, quantity: 3 }];
    expect(totalDesLignesEligibles(promo(), lignes)).toBe(31.5);
  });

  it("montant fixe : plafonné à la base éligible", () => {
    expect(calculerRemise({ type: "FIXED", discountValue: 15 }, 10)).toBe(10);
    expect(calculerRemise({ type: "FIXED", discountValue: 5 }, 10)).toBe(5);
  });

  it("arrondit le pourcentage au centime, sans erreur flottante", () => {
    // 33,33 € × 15 % = 4,9995 → 5,00 € (arrondi au plus proche)
    expect(calculerRemise({ type: "PERCENTAGE", discountValue: 15 }, 33.33)).toBe(5);
    // 0,07 € × 50 % = 0,035 → 0,04 €, pas 0,03
    expect(calculerRemise({ type: "PERCENTAGE", discountValue: 50 }, 0.07)).toBe(0.04);
  });
});
