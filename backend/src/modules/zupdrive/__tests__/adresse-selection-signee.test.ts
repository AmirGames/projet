import { describe, expect, it } from "@jest/globals";
import {
  lireSelectionAdresseZupDrive,
  signerSelectionAdresseZupDrive,
  VALIDITE_SELECTION_ADRESSE_MS,
} from "../adresse-selection-signee";

const namur = {
  label: "Place d'Armes, 5000 Namur, Belgique",
  postalCode: "5000",
  countryCode: "be",
  latitude: 50.4632,
  longitude: 4.8665,
};

describe("preuve d'adresse géocodée ZupDrive", () => {
  it("retourne exactement les champs belges signés par le serveur", () => {
    const maintenant = 1_800_000_000_000;
    const preuve = signerSelectionAdresseZupDrive(namur, maintenant);

    expect(preuve).toBeTruthy();
    expect(lireSelectionAdresseZupDrive(preuve!, maintenant + 1)).toEqual({
      ok: true,
      adresse: {
        adresse: namur.label,
        codePostal: namur.postalCode,
        latitude: namur.latitude,
        longitude: namur.longitude,
      },
    });
  });

  it("refuse une preuve modifiée, un autre pays et les données incomplètes", () => {
    const preuve = signerSelectionAdresseZupDrive(namur)!;
    const modifiee = `${preuve.slice(0, -1)}${preuve.endsWith("a") ? "b" : "a"}`;

    expect(lireSelectionAdresseZupDrive(modifiee).ok).toBe(false);
    expect(signerSelectionAdresseZupDrive({ ...namur, countryCode: "fr" })).toBeNull();
    expect(signerSelectionAdresseZupDrive({ ...namur, latitude: null })).toBeNull();
  });

  it("expire après la fenêtre d'une demi-heure", () => {
    const maintenant = 1_800_000_000_000;
    const preuve = signerSelectionAdresseZupDrive(namur, maintenant)!;

    expect(lireSelectionAdresseZupDrive(preuve, maintenant + VALIDITE_SELECTION_ADRESSE_MS)).toEqual({
      ok: false,
      raison: "EXPIREE",
    });
  });
});
