import type { Request } from "express";
import { z } from "zod";
import { db } from "./db";

/**
 * Version des textes en vigueur. À changer à chaque modification des pages
 * légales (frontend/app/(legal)) : on sait alors qui a accepté quelle version.
 */
export const VERSION_CONDITIONS = "2026-09-25";

export type DocumentLegal = "cgu" | "cgv" | "conditions-commercants" | "conditions-livreurs" | "confidentialite";

/** Champ à ajouter aux schémas : la case doit avoir été cochée. */
export const champAcceptation = {
  conditionsAcceptees: z.literal(true, {
    message: "Vous devez accepter les conditions pour continuer",
  }),
};

/** Enregistre la preuve d'acceptation. `client` accepte une transaction Prisma. */
export async function enregistrerAcceptation(
  req: Request,
  preuve: { email: string; documents: DocumentLegal[]; userId?: string; orderId?: string },
  client: Pick<typeof db, "acceptationConditions"> = db
) {
  return client.acceptationConditions.create({
    data: {
      ...preuve,
      version: VERSION_CONDITIONS,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
}
