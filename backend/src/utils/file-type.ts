/**
 * Le vrai type d'un fichier, lu dans ses premiers octets.
 *
 * Le type annoncé par le client (Content-Type, nom du fichier) se forge : il ne
 * prouve rien. Seul le contenu fait foi.
 */

export type TypeFichier = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Nombre d'octets nécessaires pour reconnaître tous les types ci-dessous. */
export const OCTETS_DE_SIGNATURE = 12;

const EXTENSIONS: Record<TypeFichier, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function detecterType(debut: Buffer): TypeFichier | null {
  if (debut.length >= 4 && debut.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (debut.length >= 4 && debut[0] === 0x89 && debut.subarray(1, 4).toString("latin1") === "PNG") return "image/png";
  if (debut.length >= 3 && debut[0] === 0xff && debut[1] === 0xd8 && debut[2] === 0xff) return "image/jpeg";
  if (
    debut.length >= 12 &&
    debut.subarray(0, 4).toString("latin1") === "RIFF" &&
    debut.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function extensionDuType(type: TypeFichier): string {
  return EXTENSIONS[type];
}

/** `image/jpg` n'existe pas, mais des clients l'envoient : même type que image/jpeg. */
export function normaliserTypeAnnonce(type: string | undefined): string {
  const t = (type || "").toLowerCase().split(";")[0].trim();
  return t === "image/jpg" ? "image/jpeg" : t;
}
