import { describe, expect, it } from "@jest/globals";
import { avisARedemander, DELAI_RELANCE_JOURS } from "../avis-client.service";

const JOUR = 24 * 60 * 60 * 1000;
const maintenant = new Date("2026-09-24T12:00:00Z");
const ilYa = (jours: number) => new Date(maintenant.getTime() - jours * JOUR);

describe("avisARedemander", () => {
  it("n'invite pas avant que la commande soit terminée", () => {
    expect(avisARedemander({ status: "READY", createdAt: ilYa(1) }, null, maintenant)).toBe(false);
  });

  it("invite un client qui n'a jamais noté le restaurant", () => {
    expect(avisARedemander({ status: "COMPLETED", createdAt: ilYa(1) }, null, maintenant)).toBe(true);
  });

  it("ne relance pas un avis récent", () => {
    const avis = { updatedAt: ilYa(DELAI_RELANCE_JOURS - 1) };
    expect(avisARedemander({ status: "COMPLETED", createdAt: ilYa(0) }, avis, maintenant)).toBe(false);
  });

  it("relance un avis de plus de quinze jours sur une commande plus récente", () => {
    const avis = { updatedAt: ilYa(DELAI_RELANCE_JOURS + 1) };
    expect(avisARedemander({ status: "COMPLETED", createdAt: ilYa(1) }, avis, maintenant)).toBe(true);
  });

  it("ne relance pas sur une commande antérieure à l'avis", () => {
    const avis = { updatedAt: ilYa(30) };
    expect(avisARedemander({ status: "COMPLETED", createdAt: ilYa(40) }, avis, maintenant)).toBe(false);
  });
});
