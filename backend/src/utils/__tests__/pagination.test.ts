import { describe, expect, it } from "@jest/globals";
import { decalage, limiteBornee } from "../pagination";

describe("limiteBornee", () => {
  it("rend la valeur demandée quand elle est dans la plage", () => {
    expect(limiteBornee("30", 20, 100)).toBe(30);
  });
  it("plafonne une demande excessive", () => {
    expect(limiteBornee("1000000", 20, 100)).toBe(100);
  });
  it("refuse zéro et les valeurs négatives : au moins 1", () => {
    expect(limiteBornee("0", 20, 100)).toBe(1);
    expect(limiteBornee("-5", 20, 100)).toBe(1);
  });
  it("rend le défaut quand la valeur est absente ou illisible", () => {
    expect(limiteBornee(undefined, 20, 100)).toBe(20);
    expect(limiteBornee("abc", 20, 100)).toBe(20);
    expect(limiteBornee("", 20, 100)).toBe(20);
  });
  it("ne dépasse jamais le plafond, même avec un défaut plus grand", () => {
    expect(limiteBornee(undefined, 500, 100)).toBe(100);
  });
  it("lit la première valeur d'un paramètre répété (?limit=5&limit=900)", () => {
    expect(limiteBornee(["5", "900"], 20, 100)).toBe(5);
  });
});

describe("decalage", () => {
  it("rend un entier positif tel quel", () => {
    expect(decalage("40")).toBe(40);
  });
  it("rend 0 pour une valeur négative, absente ou illisible", () => {
    expect(decalage("-3")).toBe(0);
    expect(decalage(undefined)).toBe(0);
    expect(decalage("x")).toBe(0);
  });
});
