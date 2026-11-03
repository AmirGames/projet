import { describe, expect, it } from "@jest/globals";
import limiteNamur from "../data/limite-commune-namur.json";
import { coordonneesDansCommuneNamur } from "../zone-commune-namur";
import { adresseDansZonePiloteNamur } from "../zone-commune-namur";

describe("frontière communale du pilote Namur", () => {
  it("accepte le centre de Namur et un point de la frontière incluse", () => {
    expect(coordonneesDansCommuneNamur(50.4632, 4.8665)).toBe(true);
    const [longitude, latitude] = limiteNamur.features[0].geometry.coordinates[0][0];
    expect(coordonneesDansCommuneNamur(latitude, longitude)).toBe(true);
  });

  it("distingue deux points distants d'environ 20 m de part et d'autre du bord nord-ouest", () => {
    // Points fixes à environ 10 m de part et d'autre d'un segment du polygone AGDP.
    expect(coordonneesDansCommuneNamur(50.48708125827622, 4.8256600948808925)).toBe(true);
    expect(coordonneesDansCommuneNamur(50.487202799006724, 4.825452245200416)).toBe(false);
  });

  it("refuse les coordonnées extérieures et les nombres invalides", () => {
    expect(coordonneesDansCommuneNamur(50.8467, 4.3525)).toBe(false);
    expect(coordonneesDansCommuneNamur(0, 0)).toBe(false);
    expect(coordonneesDansCommuneNamur(Number.NaN, 4.8665)).toBe(false);
    expect(coordonneesDansCommuneNamur(91, 4.8665)).toBe(false);
  });

  it("exige à la fois code postal Namur et coordonnées dans la commune", () => {
    expect(adresseDansZonePiloteNamur({ codePostal: "5000", latitude: 50.4632, longitude: 4.8665 })).toBe(true);
    expect(adresseDansZonePiloteNamur({ codePostal: "5000", latitude: 50.8467, longitude: 4.3525 })).toBe(false);
    expect(adresseDansZonePiloteNamur({ codePostal: "1300", latitude: 50.4632, longitude: 4.8665 })).toBe(false);
  });
});
