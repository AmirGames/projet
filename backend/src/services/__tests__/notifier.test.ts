import { describe, expect, it } from "@jest/globals";
import { numeroInternational } from "../notifier.service";

describe("numeroInternational", () => {
  it("convertit un numéro français saisi avec des espaces", () => {
    expect(numeroInternational("06 12 34 56 78")).toBe("+33612345678");
  });

  it("garde un numéro déjà international", () => {
    expect(numeroInternational("+32 470 12 34 56")).toBe("+32470123456");
  });

  it("remplace le préfixe 00 par +", () => {
    expect(numeroInternational("0033612345678")).toBe("+33612345678");
  });

  it("applique l'indicatif demandé", () => {
    expect(numeroInternational("0470123456", "32")).toBe("+32470123456");
  });
});
