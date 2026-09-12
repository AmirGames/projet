import { z } from "zod";

export const signupSchema = z
  .object({
    email: z.string().email("Email invalide"),
    name: z.string().min(2, "Nom minimum 2 caractères"),
    password: z.string().min(8, "Mot de passe minimum 8 caractères"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token requis"),
});

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}