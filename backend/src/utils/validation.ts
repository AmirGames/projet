import { z } from "zod";

/**
 * Un e-mail facultatif, tel qu'un formulaire l'envoie quand il est vide.
 *
 * `z.string().email().optional()` refuse la chaîne vide : un champ facultatif
 * laissé vide arrive comme `""`, et le formulaire était refusé avec « Invalid
 * email address » sans même nommer le champ. Une boutique sans adresse de
 * contact ne pouvait donc ni être créée, ni voir le moindre de ses réglages
 * enregistré.
 */
export const emailFacultatif = z
  .string()
  .email("Adresse e-mail invalide")
  .optional()
  .or(z.literal(""));

export const ValidationSchemas = {
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
  }),

  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Minimum 6 caractères"),
  authInput: z.object({
    email: z.string().email("Email invalide"),
    password: z.string().min(6, "Minimum 6 caractères"),
  }),

  signupSchema: z.object({
    email: z.string().email("Email invalide"),
    password: z.string().min(6, "Minimum 6 caractères"),
    // « Nom requis » laissait croire à un champ vide, y compris pour une seule
    // lettre. Le champ est nommé par le gestionnaire d'erreurs.
    name: z.string().min(2, "Minimum 2 caractères"),
  }),

  loginSchema: z.object({
    email: z.string().email("Email invalide"),
    password: z.string().min(6, "Minimum 6 caractères"),
  }),

  refreshTokenSchema: z.object({
    refreshToken: z.string().min(1, "Token requis"),
  }),

  productInput: z.object({
    name: z.string().min(1, "Nom requis"),
    description: z.string().optional(),
    price: z.number().positive("Prix doit être positif"),
    sku: z.string().min(1, "SKU requis"),
    categoryId: z.string().min(1, "Catégorie requise"),
  }),

  orderInput: z.object({
    items: z.array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().positive(),
      })
    ).min(1, "Au moins 1 article requis"),
    deliveryAddress: z.string().min(5, "Adresse requise"),
    phone: z.string().min(10, "Téléphone invalide"),
  }),

  storeInput: z.object({
    name: z.string().min(1, "Nom requis"),
    slug: z.string().min(1, "Slug requis"),
    address: z.string().optional(),
  }),
};

export const validatePagination = (req: any) => {
  return ValidationSchemas.pagination.parse({
    page: req.query.page,
    limit: req.query.limit,
  });
};

export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
};

export const signupSchema = ValidationSchemas.signupSchema;
export const loginSchema = ValidationSchemas.loginSchema;
export const refreshTokenSchema = ValidationSchemas.refreshTokenSchema;
