import { z } from "zod";
import { ApiError } from "../../middleware/errorHandler";

const schema = z.array(z.object({ id: z.string().min(1), displayOrder: z.number().int().min(0).max(2147483647) })).max(1000);

export function validerOrdre(value: unknown) {
  const ordering = schema.parse(value);
  if (new Set(ordering.map(item => item.id)).size !== ordering.length) {
    throw new ApiError(400, "Identifiants en double", "INVALID_ORDERING");
  }
  return ordering;
}

export function exigerLotComplet(expected: number, actual: number) {
  if (expected !== actual) throw new ApiError(400, "Un objet du lot est hors du périmètre autorisé", "INVALID_ORDERING");
}
