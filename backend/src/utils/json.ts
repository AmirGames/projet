import type { Prisma } from "@prisma/client";

/** Une valeur Json lue en base, vue comme un objet : `{}` si c'en est pas un. */
export function objetJson(valeur: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? valeur : {};
}

/** Une valeur Json lue en base, vue comme une liste : `[]` si c'en est pas une. */
export function listeJson(valeur: Prisma.JsonValue | null | undefined): Prisma.JsonArray {
  return Array.isArray(valeur) ? valeur : [];
}
