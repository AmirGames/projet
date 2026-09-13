import { z } from "zod";

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
