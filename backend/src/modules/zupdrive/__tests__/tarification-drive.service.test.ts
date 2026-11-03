import { describe, expect, it } from "@jest/globals";
import { estDansZonePiloteNamur, TarificationDriveService } from "../tarification-drive.service";

describe("zone pilote ZupDrive de Namur", () => {
  it("accepte les codes postaux des sections de la commune", () => {
    for (const codePostal of ["5000", "5001", "5002", "5003", "5004", "5020", "5021", "5022", "5024", "5100", "5101"]) {
      expect(estDansZonePiloteNamur(codePostal)).toBe(true);
    }
  });

  it("refuse les codes voisins et les valeurs mal formées", () => {
    for (const codePostal of ["1300", "5030", "5090", "5102", "50000", "", null, undefined]) {
      expect(estDansZonePiloteNamur(codePostal)).toBe(false);
    }
  });
});

describe("tarif réglementaire du pilote Namur", () => {
  it("refuse un tarif Standard différent du tarif plateforme namurois", async () => {
    await expect(TarificationDriveService.definir("WALLONIE", {
      priseEnChargeCentimes: 0, parKmCentimes: 189, parMinuteCentimes: 0, minimumCentimes: 820, actif: true,
    })).rejects.toMatchObject({ code: "NAMUR_REGULATED_TARIFF" });
    await expect(TarificationDriveService.definir("WALLONIE", {
      priseEnChargeCentimes: 250, parKmCentimes: 190, parMinuteCentimes: 30, minimumCentimes: 819, actif: true,
    })).rejects.toMatchObject({ code: "NAMUR_REGULATED_TARIFF" });
  });

  it("applique le même tarif réglementaire au tarif XL", async () => {
    await expect(TarificationDriveService.definirXL("WALLONIE", {
      priseEnChargeCentimes: 0, parKmCentimes: 190, parMinuteCentimes: 0, minimumCentimes: 819, actif: true,
    })).rejects.toMatchObject({ code: "NAMUR_REGULATED_TARIFF" });
  });
});
