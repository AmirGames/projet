import type { Request } from "express";
import { getEnv } from "../../config/env";
import { ApiError } from "../../middleware/errorHandler";
import { db } from "../../services/db";
import { acceptationAJour, enregistrerAcceptation, type DocumentLegal } from "../legal/acceptation-conditions.service";
import { PagesLegalesService } from "../legal/pages-legales.service";

const DOCUMENTS_PAR_PARTICIPANT: Record<"CHAUFFEUR" | "SOCIETE", DocumentLegal[]> = {
  CHAUFFEUR: ["drive-cgu", "drive-conditions-chauffeurs", "drive-confidentialite"],
  SOCIETE: ["drive-cgu", "drive-conditions-societes", "drive-confidentialite"],
};

/** Enregistre la version des règles acceptées à l'ouverture d'un dossier. */
export async function accepterConditionsDossierDrive(req: Request, participant: "CHAUFFEUR" | "SOCIETE") {
  if (getEnv().NODE_ENV === "production") {
    await PagesLegalesService.verifierPrealablesZupDrive();
  }

  const userId = req.userId as string;
  const documents = DOCUMENTS_PAR_PARTICIPANT[participant];
  if (await acceptationAJour(userId, documents)) return;

  const compte = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!compte) throw new ApiError(401, "Session invalide", "UNAUTHENTICATED");

  await enregistrerAcceptation(req, { email: compte.email, userId, documents });
}
