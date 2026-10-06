import { describe, expect, it } from "@jest/globals";
import bcrypt from "bcrypt";
import { champMotDePasse } from "../validation";

describe("mot de passe : limite de 72 octets (bcrypt)", () => {
  const regle = champMotDePasse();
  const base = "Aa1" + "x".repeat(69); // 72 octets exactement

  it("accepte 72 octets", () => {
    expect(Buffer.byteLength(base)).toBe(72);
    expect(regle.safeParse(base).success).toBe(true);
  });

  it("refuse 73 octets : deux mots de passe au même préfixe ne sont plus acceptés", () => {
    expect(regle.safeParse(base + "y").success).toBe(false);
    expect(regle.safeParse(base + "z").success).toBe(false);
  });

  it("compte les octets, pas les caractères : 40 « é » font 80 octets", () => {
    const accentue = "Aa1" + "é".repeat(40);
    expect(accentue.length).toBeLessThan(72);
    expect(regle.safeParse(accentue).success).toBe(false);
    expect(regle.safeParse("Aa1" + "é".repeat(34)).success).toBe(true); // 71 octets
  });

  it("garde les règles existantes", () => {
    expect(regle.safeParse("court1A").success).toBe(false);
    expect(regle.safeParse("sansmajuscule1").success).toBe(false);
  });

  it("justification : bcrypt ignore bien ce qui dépasse 72 octets", async () => {
    const hash = await bcrypt.hash(base + "y", 4);
    expect(await bcrypt.compare(base + "z", hash)).toBe(true);
  });
});
