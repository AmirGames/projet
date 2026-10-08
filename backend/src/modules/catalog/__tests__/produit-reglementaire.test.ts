import { z } from "zod";

// Même contrat que `champsReglementaires` de product.routes.ts.
const ALLERGENES = ["GLUTEN", "MILK", "SESAME"] as const;
const schema = z.object({
  allergens: z.array(z.enum(ALLERGENES)).optional().transform((a) => (a ? [...new Set(a)] : a)),
});

describe("allergènes d'un produit", () => {
  it("dédoublonne et conserve la liste vide (aucun allergène)", () => {
    expect(schema.parse({ allergens: ["MILK", "MILK"] }).allergens).toEqual(["MILK"]);
    expect(schema.parse({ allergens: [] }).allergens).toEqual([]);
    expect(schema.parse({}).allergens).toBeUndefined();
  });
  it("refuse un allergène inconnu", () => {
    expect(() => schema.parse({ allergens: ["POMME"] })).toThrow();
  });
});
