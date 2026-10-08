import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Le devis d'un trajet ZupDrive, signé par le serveur.
 *
 * Un itinéraire réel change d'une minute à l'autre (circulation) : recalculer
 * le prix à la commande pouvait donner un autre montant que celui affiché. Le
 * devis est donc signé (HMAC) et rendu au passager ; la commande le reprend
 * tel quel. Le passager paie exactement ce qu'il a vu, et personne ne peut
 * fabriquer ou retoucher un devis : la signature, le compte et l'échéance
 * sont vérifiés.
 */

export const VALIDITE_DEVIS_MS = 10 * 60_000;

interface AdresseDevis {
  adresse: string;
  latitude: number;
  longitude: number;
  codePostal: string;
}

export interface ContenuDevis {
  passagerId: string;
  region: string;
  depart: AdresseDevis;
  arrivee: AdresseDevis;
  distanceMetres: number;
  dureeSecondes: number;
  prixCentimes: number;
  /** Majoration appliquée au prix ; absente des devis émis avant son enregistrement. */
  surgeFactor?: number;
  devise: "EUR";
  tarif: Record<string, number>;
  source: string;
  /** Échéance, en millisecondes depuis l'époque. */
  exp: number;
}

// Une clé propre aux devis, dérivée du secret des sessions : une signature de
// devis ne vaut ni jeton ni adresse de fichier. Sans secret (tests), une clé
// tirée au démarrage.
let cle: Buffer | null = null;
function cleDeSignature(): Buffer {
  if (!cle) {
    const secret = process.env.JWT_SECRET;
    cle = secret ? createHmac("sha256", secret).update("devis-zupdrive").digest() : randomBytes(32);
  }
  return cle;
}

const signature = (corps: string) => createHmac("sha256", cleDeSignature()).update(corps).digest("base64url");

export function signerDevis(contenu: ContenuDevis): string {
  const corps = Buffer.from(JSON.stringify({ v: 1, ...contenu })).toString("base64url");
  return `${corps}.${signature(corps)}`;
}

/** Le contenu d'un devis authentique ; sinon la raison du refus. */
export function lireDevis(
  jeton: string,
  maintenant = Date.now()
): { ok: true; contenu: ContenuDevis } | { ok: false; raison: "INVALIDE" | "EXPIRE" } {
  if (typeof jeton !== "string" || jeton.length > 8000) return { ok: false, raison: "INVALIDE" };
  const [corps, signe, ...reste] = jeton.split(".");
  if (!corps || !signe || reste.length) return { ok: false, raison: "INVALIDE" };

  const attendue = Buffer.from(signature(corps));
  const recue = Buffer.from(signe);
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return { ok: false, raison: "INVALIDE" };

  let contenu: ContenuDevis & { v?: number };
  try {
    contenu = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
  } catch {
    return { ok: false, raison: "INVALIDE" };
  }
  if (contenu.v !== 1) return { ok: false, raison: "INVALIDE" };
  if (!(contenu.exp > maintenant)) return { ok: false, raison: "EXPIRE" };
  return { ok: true, contenu };
}
