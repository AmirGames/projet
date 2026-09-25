import type { Request } from "express";
import { z } from "zod";
import { db } from "./db";
import { PagesLegalesService } from "./pages-legales.service";

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
  // La version de chaque document au moment de l'acceptation, publiée depuis
  // l'espace superowner (Pages légales).
  const version = await PagesLegalesService.versionsDe(preuve.documents);
  return client.acceptationConditions.create({
    data: {
      ...preuve,
      version,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
}
