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

/**
 * L'adresse e-mail d'une personne, telle qu'on la compare et l'enregistre.
 *
 * Tous les fournisseurs livrent « TeST@test.com » dans la même boîte que
 * « test@test.com », mais la base, elle, les distinguait : une même personne
 * pouvait ouvrir deux comptes, ou ne plus retrouver le sien en tapant une
 * majuscule. L'adresse est donc ramenée en minuscules, sans espaces autour,
 * avant d'être validée.
 */
export const champEmail = (message = "Email invalide") =>
  z.string().trim().toLowerCase().email(message);

/**
 * Le mot de passe d'un compte, tel qu'on l'accepte à sa création ou à son
 * changement.
 *
 * Six caractères quelconques suffisaient : « aaaaaa » ou « 123456 » ouvraient
 * un compte qui encaisse de l'argent. Il faut désormais 8 caractères, dont un
 * chiffre, une minuscule et une majuscule ; les caractères spéciaux sont
 * permis sans être exigés. La connexion, elle, n'applique pas cette règle :
 * les comptes créés avant elle doivent pouvoir entrer.
 *
 * Chaque manque a son message, pour que l'écran dise quoi corriger.
 */
export const REGLE_MOT_DE_PASSE =
  "8 caractères minimum, avec au moins un chiffre, une minuscule et une majuscule";

/**
 * bcrypt ne lit que les 72 premiers octets d'un mot de passe : au-delà, deux
 * mots de passe différents donneraient la même empreinte. La limite porte sur
 * les octets UTF-8 (un caractère accentué en compte 2), pas sur les caractères.
 */
const OCTETS_MOT_DE_PASSE_MAX = 72;

export const champMotDePasse = () =>
  z
    .string()
    .min(8, "8 caractères minimum")
    .refine((valeur) => Buffer.byteLength(valeur, "utf8") <= OCTETS_MOT_DE_PASSE_MAX, {
      message: `72 octets au plus (un caractère accentué ou un emoji en compte plusieurs)`,
    })
    .regex(/[0-9]/, "au moins un chiffre")
    .regex(/[a-z]/, "au moins une lettre minuscule")
    .regex(/[A-Z]/, "au moins une lettre majuscule");

const ValidationSchemas = {
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
  }),

  email: champEmail(),
  password: z.string().min(6, "Minimum 6 caractères"),
  authInput: z.object({
    email: champEmail(),
    password: z.string().min(6, "Minimum 6 caractères"),
  }),

  signupSchema: z.object({
    email: champEmail(),
    password: champMotDePasse(),
    // « Nom requis » laissait croire à un champ vide, y compris pour une seule
    // lettre. Le champ est nommé par le gestionnaire d'erreurs.
    name: z.string().min(2, "Minimum 2 caractères"),
  }),

  loginSchema: z.object({
    email: champEmail(),
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

export const validatePagination = (req: { query: Record<string, unknown> }) => {
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
