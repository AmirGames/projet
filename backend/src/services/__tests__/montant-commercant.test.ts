import { describe, expect, it } from "@jest/globals";
import { montantCommercant, totalCommercant } from "../delivery-mode.service";

describe("montantCommercant", () => {
  it("ne garde que les articles : ni livraison, ni frais de service", () => {
    // 15 € d'articles + 5 € de livraison + 0,25 € de frais de service.
    expect(
      montantCommercant({ totalAmount: "20.25", feesAmount: "5.00", serviceFeeAmount: "0.25" })
    ).toBe(15);
  });

  it("déduit la remise, déjà retirée du total payé", () => {
    // 15 € d'articles − 2 € de remise + 5 € + 0,25 €.
    expect(montantCommercant({ totalAmount: 18.25, feesAmount: 5, serviceFeeAmount: 0.25 })).toBe(13);
  });

  it("vaut le total quand il n'y a ni livraison ni frais", () => {
    expect(montantCommercant({ totalAmount: 12.5 })).toBe(12.5);
  });

  it("additionne au centime près", () => {
    expect(
      totalCommercant([
        { totalAmount: "20.25", feesAmount: "5", serviceFeeAmount: "0.25" },
        { totalAmount: "10.35", feesAmount: "0", serviceFeeAmount: "0.25" },
      ])
    ).toBe(25.1);
  });
});
