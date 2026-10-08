import type { Request } from "express";
import { z } from "zod";
import { db } from "../../services/db";
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

/** Les documents à accepter pour commander. */
const DOCUMENTS_COMMANDE: DocumentLegal[] = ["cgv", "confidentialite"];

/** Les versions en vigueur, « cgv@v1 confidentialite@v2 ». */
export function versionsEnVigueur(documents: DocumentLegal[] = DOCUMENTS_COMMANDE) {
  return PagesLegalesService.versionsDe(documents);
}

/**
 * Ce compte a-t-il déjà accepté les versions en vigueur de ces documents ?
 * Vrai : inutile de redemander la case. Dès qu'une page légale est republiée,
 * la version change et la case réapparaît. Seul un compte connecté est
 * reconnu ; une adresse e-mail saisie ne prouve rien.
 */
export async function acceptationAJour(
  userId: string | undefined,
  documents: DocumentLegal[] = DOCUMENTS_COMMANDE
): Promise<boolean> {
  if (!userId) return false;
  const attendues = (await PagesLegalesService.versionsDe(documents)).split(" ");
  const preuves = await db.acceptationConditions.findMany({
    where: { userId, documents: { hasEvery: documents } },
    orderBy: { acceptedAt: "desc" },
    take: 20,
    select: { version: true },
  });
  return preuves.some((p) => {
    const acceptees = p.version.split(" ");
    return attendues.every((v) => acceptees.includes(v));
  });
}
