import { ApiError } from "../../middleware/api-error";

const NOTE_ATTESTATION = "Titre officiel vérifié par l'équipe ZupDrive.";

const TITRES_OFFICIELS = new Set(["licence", "certificat_capacite", "certificat_acces_profession"]);

export type PreuveVerificationTitre = {
  verificationAutorite?: boolean;
  referenceAutorite?: string;
  communeAutorisee?: string;
  typeServiceTaxi?: "RUE" | "STATION";
};

export const estTitreOfficiel = (type: string) => TITRES_OFFICIELS.has(type);

/** L'équipe atteste la vérification des titres officiels avant approbation. */
export function exigerVerificationTitreOfficiel(
  type: string,
  approuve: boolean,
  preuve: PreuveVerificationTitre = {}
): void {
  if (!TITRES_OFFICIELS.has(type) || !approuve) return;

  const reference = preuve.referenceAutorite?.trim();
  const commune = preuve.communeAutorisee?.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-BE");
  const communeRequise = type === "licence" || type === "certificat_capacite";
  const serviceValide = type !== "licence" || preuve.typeServiceTaxi === "RUE" || preuve.typeServiceTaxi === "STATION";

  if (
    !preuve.verificationAutorite ||
    !reference ||
    reference.length < 3 ||
    (communeRequise && commune !== "namur") ||
    !serviceValide
  ) {
    throw new ApiError(
      400,
      "Pour approuver ce titre, consignez la référence de vérification auprès de l'autorité et confirmez son périmètre Namur requis.",
      "OFFICIAL_LICENSE_NOT_VERIFIED"
    );
  }
}

/** Conserve une trace lisible de l'attestation dans la note et l'audit d'examen. */
export function noteAvecAttestationTitreOfficiel(note: string | undefined, preuve: PreuveVerificationTitre): string {
  const details = [
    preuve.referenceAutorite?.trim() ? `Référence consultée : ${preuve.referenceAutorite.trim()}.` : null,
    preuve.communeAutorisee?.trim() ? `Commune vérifiée : ${preuve.communeAutorisee.trim()}.` : null,
    preuve.typeServiceTaxi ? `Type de taxi vérifié : ${preuve.typeServiceTaxi === "RUE" ? "rue" : "station"}.` : null,
  ];
  return [NOTE_ATTESTATION, ...details, note?.trim()].filter(Boolean).join(" ");
}
