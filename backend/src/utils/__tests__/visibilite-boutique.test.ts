import { boutiqueVisible, livreVraiment } from "../visibilite-boutique";

const RETRAIT = 10;
const zones = (livrable: boolean) => ({ livrable, forfaitBoutique: false });
const forfait = { livrable: true, forfaitBoutique: true };

describe("visibilité d'une boutique selon l'adresse du client", () => {
  it("montre une boutique lointaine dont les zones couvrent l'adresse", () => {
    expect(boutiqueVisible(zones(true), 14, RETRAIT)).toBe(true);
    expect(livreVraiment(zones(true), 14, RETRAIT)).toBe(true);
  });

  it("cache une boutique lointaine qui ne livre pas là", () => {
    expect(boutiqueVisible(zones(false), 14, RETRAIT)).toBe(false);
  });

  it("garde une boutique proche qui ne livre pas, pour le retrait", () => {
    expect(boutiqueVisible(zones(false), 8, RETRAIT)).toBe(true);
    expect(livreVraiment(zones(false), 8, RETRAIT)).toBe(false);
  });

  it("ne prend le forfait « partout » au mot que dans le rayon de retrait", () => {
    expect(livreVraiment(forfait, 6, RETRAIT)).toBe(true);
    expect(boutiqueVisible(forfait, 300, RETRAIT)).toBe(false);
  });

  it("sans verdict, ne se fie qu'à la distance", () => {
    expect(boutiqueVisible(null, 4, RETRAIT)).toBe(true);
    expect(boutiqueVisible(null, 40, RETRAIT)).toBe(false);
  });
});
