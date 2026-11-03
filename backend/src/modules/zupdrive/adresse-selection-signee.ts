import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../middleware/api-error";

/** Champs de l'adresse retournée par le fournisseur, conservés à l'identique. */
export interface AdresseGeocodeeZupDrive {
  adresse: string;
  latitude: number;
  longitude: number;
  codePostal: string;
}

interface ContenuAdresseSignee extends AdresseGeocodeeZupDrive {
  exp: number;
}

export const VALIDITE_SELECTION_ADRESSE_MS = 30 * 60_000;

let cle: Buffer | null = null;
function cleDeSignature(): Buffer {
  if (!cle) {
    const secret = process.env.JWT_SECRET;
    // L'environnement de production exige JWT_SECRET au démarrage. Le repli
    // aléatoire ne sert qu'aux tests unitaires qui n'amorcent pas toute la config.
    cle = secret
      ? createHmac("sha256", secret).update("selection-adresse-zupdrive").digest()
      : randomBytes(32);
  }
  return cle;
}

const signature = (corps: string) => createHmac("sha256", cleDeSignature()).update(corps).digest("base64url");

/** Signe une suggestion belge produite par le géocodeur serveur. */
export function signerSelectionAdresseZupDrive(suggestion: {
  label: string;
  postalCode: string;
  countryCode: string;
  latitude: number | null;
  longitude: number | null;
}, maintenant = Date.now()): string | null {
  if (suggestion.countryCode.toLowerCase() !== "be"
    || !suggestion.label.trim()
    || !suggestion.postalCode.trim()
    || suggestion.latitude === null
    || suggestion.longitude === null
    || !Number.isFinite(suggestion.latitude)
    || !Number.isFinite(suggestion.longitude)
    || suggestion.latitude < -90 || suggestion.latitude > 90
    || suggestion.longitude < -180 || suggestion.longitude > 180) {
    return null;
  }

  const contenu: ContenuAdresseSignee = {
    adresse: suggestion.label.trim(),
    codePostal: suggestion.postalCode.trim(),
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
    exp: maintenant + VALIDITE_SELECTION_ADRESSE_MS,
  };
  const corps = Buffer.from(JSON.stringify({ v: 1, ...contenu })).toString("base64url");
  return `${corps}.${signature(corps)}`;
}

export type LectureAdresseSignee =
  | { ok: true; adresse: AdresseGeocodeeZupDrive }
  | { ok: false; raison: "INVALIDE" | "EXPIREE" };

/** Lit une preuve sans jamais faire confiance aux champs d'adresse du client. */
export function lireSelectionAdresseZupDrive(jeton: string, maintenant = Date.now()): LectureAdresseSignee {
  if (typeof jeton !== "string" || jeton.length > 4000) return { ok: false, raison: "INVALIDE" };
  const [corps, signe, ...reste] = jeton.split(".");
  if (!corps || !signe || reste.length) return { ok: false, raison: "INVALIDE" };

  const attendue = Buffer.from(signature(corps));
  const recue = Buffer.from(signe);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return { ok: false, raison: "INVALIDE" };

  let valeur: unknown;
  try {
    valeur = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
  } catch {
    return { ok: false, raison: "INVALIDE" };
  }
  if (!valeur || typeof valeur !== "object") return { ok: false, raison: "INVALIDE" };
  const contenu = valeur as Partial<ContenuAdresseSignee> & { v?: unknown };
  if (contenu.v !== 1
    || typeof contenu.adresse !== "string" || contenu.adresse.trim().length < 3 || contenu.adresse.length > 300
    || typeof contenu.codePostal !== "string" || !/^\d{4}$/.test(contenu.codePostal)
    || typeof contenu.latitude !== "number" || !Number.isFinite(contenu.latitude) || Math.abs(contenu.latitude) > 90
    || typeof contenu.longitude !== "number" || !Number.isFinite(contenu.longitude) || Math.abs(contenu.longitude) > 180
    || typeof contenu.exp !== "number" || !Number.isSafeInteger(contenu.exp)) {
    return { ok: false, raison: "INVALIDE" };
  }
  if (contenu.exp <= maintenant) return { ok: false, raison: "EXPIREE" };

  return {
    ok: true,
    adresse: {
      adresse: contenu.adresse,
      codePostal: contenu.codePostal,
      latitude: contenu.latitude,
      longitude: contenu.longitude,
    },
  };
}

/** Convertit une preuve absente, falsifiée ou expirée en refus API explicite. */
export function exigerAdresseZupDriveSignee(jeton: string): AdresseGeocodeeZupDrive {
  const resultat = lireSelectionAdresseZupDrive(jeton);
  if (!resultat.ok) {
    throw new ApiError(
      400,
      resultat.raison === "EXPIREE"
        ? "Cette sélection d'adresse a expiré. Choisissez à nouveau l'adresse."
        : "Choisissez une adresse proposée par la recherche d'adresses.",
      resultat.raison === "EXPIREE" ? "ADDRESS_PROOF_EXPIRED" : "INVALID_ADDRESS_PROOF",
    );
  }
  return resultat.adresse;
}
