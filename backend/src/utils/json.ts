import { Prisma } from "@prisma/client";

const PrismaJsonNull = Prisma.JsonNull;

/** Une valeur Json lue en base, vue comme un objet : `{}` si c'en est pas un. */
export function objetJson(valeur: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? valeur : {};
}

/** Une valeur Json lue en base, vue comme une liste : `[]` si c'en est pas une. */
export function listeJson(valeur: Prisma.JsonValue | null | undefined): Prisma.JsonArray {
  return Array.isArray(valeur) ? valeur : [];
}

/**
 * Une valeur Json lue en base, prête à être réécrite : Prisma refuse un `null`
 * brut sur une colonne Json et veut `Prisma.JsonNull`.
 */
export function entreeJson(valeur: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return valeur === null ? PrismaJsonNull : valeur;
}

/**
 * Une donnée quelconque (dates, décimaux…) réduite à ce que Prisma écrirait
 * dans une colonne Json : le même passage par JSON, rendu explicite.
 */
export function enJson(valeur: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valeur));
}
