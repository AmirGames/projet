/**
 * L'identifiant Peppol d'un participant : un schéma et une valeur.
 *
 * En Belgique, le schéma est `0208` et la valeur le numéro d'entreprise à dix
 * chiffres — le même que la partie numérique du numéro de TVA (BE0123456789).
 * Un commerçant qui n'a rien saisi de particulier est donc joignable à partir
 * de ce qu'on sait déjà de lui.
 */
export interface IdentifiantPeppol {
  schema: string;
  valeur: string;
}

export const SCHEMA_BCE = "0208";

/** « BE 0123.456.789 » → « BE0123456789 » ; null si ce n'est pas un numéro belge. */
export function tvaBelge(tva?: string | null): string | null {
  const brut = (tva || "").replace(/[\s.\-]/g, "").toUpperCase();
  return /^BE0\d{9}$/.test(brut) ? brut : null;
}

/** Les dix chiffres d'un numéro d'entreprise belge (BCE), ou null. */
export function numeroBce(numero?: string | null): string | null {
  const chiffres = (numero || "").replace(/\D/g, "");
  if (chiffres.length === 10 && chiffres.startsWith("0")) return chiffres;
  // Neuf chiffres saisis sans le zéro initial.
  if (chiffres.length === 9) return `0${chiffres}`;
  return null;
}

/**
 * L'identifiant à utiliser pour joindre un commerçant.
 *
 * Priorité : celui qu'il a saisi (« 0208:0123456789 »), puis son numéro de TVA
 * belge, puis son numéro d'entreprise. Null : aucun moyen de l'atteindre.
 */
export function identifiantPeppol(org: {
  peppolId?: string | null;
  vatNumber?: string | null;
  registrationNumber?: string | null;
}): IdentifiantPeppol | null {
  const saisi = (org.peppolId || "").trim();
  if (saisi) {
    const [schema, ...reste] = saisi.split(":");
    const valeur = reste.join(":").trim();
    if (/^\d{4}$/.test(schema) && valeur) return { schema, valeur };
    return null;
  }

  const tva = tvaBelge(org.vatNumber);
  if (tva) return { schema: SCHEMA_BCE, valeur: tva.slice(2) };

  const bce = numeroBce(org.registrationNumber);
  if (bce) return { schema: SCHEMA_BCE, valeur: bce };

  return null;
}
