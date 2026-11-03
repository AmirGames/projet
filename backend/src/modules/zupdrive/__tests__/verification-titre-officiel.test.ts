import { describe, expect, it } from "@jest/globals";
import { ApiError } from "../../../middleware/api-error";
import { exigerVerificationTitreOfficiel, noteAvecAttestationTitreOfficiel } from "../verification-titre-officiel";

describe("vérification humaine du titre officiel", () => {
  it("bloque l'approbation d'une licence sans attestation", () => {
    try {
      exigerVerificationTitreOfficiel("licence", true);
      throw new Error("La validation aurait dû être refusée");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ statusCode: 400, code: "OFFICIAL_LICENSE_NOT_VERIFIED" });
    }
  });

  it("exige une trace et le périmètre Namur avant une approbation", () => {
    expect(() => exigerVerificationTitreOfficiel("licence", true, {
      verificationAutorite: true,
      referenceAutorite: "Dossier 123",
      communeAutorisee: "Liège",
      typeServiceTaxi: "RUE",
    })).toThrow(expect.objectContaining({ code: "OFFICIAL_LICENSE_NOT_VERIFIED" }));
    expect(() => exigerVerificationTitreOfficiel("licence", true, {
      verificationAutorite: true,
      referenceAutorite: "Licence 123 vérifiée auprès de la commune",
      communeAutorisee: "Namur",
      typeServiceTaxi: "RUE",
    })).not.toThrow();
  });

  it("ne bloque pas un refus ni une autre pièce", () => {
    expect(() => exigerVerificationTitreOfficiel("licence", false)).not.toThrow();
    expect(() => exigerVerificationTitreOfficiel("assurance", true)).not.toThrow();
  });

  it("conserve l'attestation dans la note d'examen", () => {
    const preuve = { referenceAutorite: "Licence Namur 123", communeAutorisee: "Namur", typeServiceTaxi: "RUE" as const };
    expect(noteAvecAttestationTitreOfficiel("  Vérifié par téléphone.  ", preuve)).toBe(
      "Titre officiel vérifié par l'équipe ZupDrive. Référence consultée : Licence Namur 123. Commune vérifiée : Namur. Type de taxi vérifié : rue. Vérifié par téléphone."
    );
  });
});
