import { describe, expect, it } from "@jest/globals";
import { ttc } from "../prix-ttc";

describe("ttc", () => {
  it("passe un prix HT en TTC", () => {
    expect(ttc(10, 20)).toBe(12);
    expect(ttc("8.50", 6)).toBe(9.01);
  });

  it("arrondit au centime", () => {
    expect(ttc(9.99, 21)).toBe(12.09);
  });

  it("arrondit la moitié d'un centime vers le haut, sans l'erreur du flottant", () => {
    // 0,50 × 1,21 = 0,605 → 0,61 (le flottant donnait 0,60)
    expect(ttc(0.5, 21)).toBe(0.61);
    expect(ttc(1.15, 5)).toBe(1.21); // 1,2075 → 1,21
    expect(ttc(0.15, 10)).toBe(0.17); // 0,165 → 0,17 (le flottant donnait 0,16)
    expect(ttc(10.5, 5.5)).toBe(11.08); // 11,07750 → 11,08
  });

  it("garde un prix sans taxe, un taux décimal et un prix en texte", () => {
    expect(ttc(10, 0)).toBe(10);
    expect(ttc("19.90", 5.5)).toBe(20.99); // 20,9945
    expect(ttc(0, 21)).toBe(0);
  });

  it("jamais de résultat à plus de deux décimales", () => {
    for (const prix of [0.07, 3.33, 12.34, 99.99, 0.01]) {
      for (const taux of [6, 12, 21, 5.5]) {
        const t = ttc(prix, taux);
        expect(Math.round(t * 100) / 100).toBe(t);
      }
    }
  });
});

