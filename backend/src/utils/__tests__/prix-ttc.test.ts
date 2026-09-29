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
});
