import { z } from "zod";

const adresseFavoriteSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    kind: z.enum(["HOME", "WORK", "OTHER"]),
    name: z.string().trim().max(50).default(""),
    street: z.string().trim().min(3, "Indiquez le numéro et la rue").max(300),
    city: z.string().trim().min(1, "Indiquez la ville").max(100),
    postalCode: z.string().trim().min(1, "Indiquez le code postal").max(20),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
  })
  .superRefine((adresse, ctx) => {
    if (adresse.kind === "OTHER" && !adresse.name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Donnez un nom à ce favori",
      });
    }
    if ((adresse.latitude === null) !== (adresse.longitude === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["latitude"],
        message: "Coordonnées incomplètes",
      });
    }
  })
  .transform((adresse) => ({
    ...adresse,
    name:
      adresse.kind === "HOME"
        ? "Domicile"
        : adresse.kind === "WORK"
          ? "Travail"
          : adresse.name,
  }));

export const adressesFavoritesSchema = z
  .array(adresseFavoriteSchema)
  .max(20)
  .superRefine((adresses, ctx) => {
    const ids = new Set<string>();
    const types = new Set<string>();
    adresses.forEach((adresse, index) => {
      if (
        ids.has(adresse.id) ||
        (adresse.kind !== "OTHER" && types.has(adresse.kind))
      ) {
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: "Une seule adresse Domicile et Travail est autorisée",
        });
      }
      ids.add(adresse.id);
      types.add(adresse.kind);
    });
  });

export function lireAdressesFavorites(brut: unknown) {
  const resultat = adressesFavoritesSchema.safeParse(brut ?? []);
  return resultat.success ? resultat.data : [];
}
