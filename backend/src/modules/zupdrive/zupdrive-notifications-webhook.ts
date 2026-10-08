import { createHmac, timingSafeEqual } from "crypto";
import type { Request, RequestHandler } from "express";
import { z } from "zod";
import { getEnv } from "../../config/env";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";
import { ZupDriveNotificationsService } from "./zupdrive-notifications.service";

/** Écart maximal toléré entre l'horodatage signé et l'heure du serveur (rejeu). */
const TOLERANCE_SIGNATURE_SECONDES = 300;

const corpsSchema = z.object({
  notificationLogId: z.string().min(1).max(64),
  status: z.enum(["SENT", "FAILED", "BOUNCED"]),
  errorMessage: z.string().max(1000).optional(),
});

/** HMAC-SHA256 de `${horodatage}.${corps brut}`, en hexadécimal. */
export function signerAccuse(secret: string, horodatage: string, corpsBrut: string): string {
  return createHmac("sha256", secret).update(`${horodatage}.${corpsBrut}`).digest("hex");
}

/** Vérifie en temps constant la signature et la fraîcheur de l'horodatage. */
export function signatureValide(
  secret: string,
  horodatage: string | undefined,
  signature: string | undefined,
  corpsBrut: string,
  maintenant: number = Date.now()
): boolean {
  if (!horodatage || !signature || !/^\d{1,12}$/.test(horodatage)) return false;
  if (Math.abs(maintenant / 1000 - Number(horodatage)) > TOLERANCE_SIGNATURE_SECONDES) return false;
  const attendue = Buffer.from(signerAccuse(secret, horodatage, corpsBrut), "hex");
  const recue = Buffer.from(signature, "hex");
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}

/**
 * POST /api/zupdrive/notifications/webhooks/status
 *
 * Accusé du fournisseur d'envoi. Monté AVANT le lecteur JSON (comme le webhook
 * Stripe) : la signature porte sur le corps brut. Rien n'est lu du corps avant
 * que la signature soit vérifiée ; sans secret configuré, la route est fermée.
 */
export const webhookStatutNotification: RequestHandler = async (req: Request, res, next) => {
  try {
    const secret = getEnv().ZUPDRIVE_NOTIFICATIONS_WEBHOOK_SECRET;
    if (!secret) throw new ApiError(503, "Webhook de notifications non configuré", "WEBHOOK_NOT_CONFIGURED");

    const corpsBrut = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    const horodatage = req.header("x-zupdrive-timestamp");
    if (!signatureValide(secret, horodatage, req.header("x-zupdrive-signature"), corpsBrut)) {
      logger.warn("Webhook notifications ZupDrive : signature refusée");
      throw new ApiError(401, "Signature invalide", "INVALID_SIGNATURE");
    }

    let json: unknown;
    try {
      json = JSON.parse(corpsBrut);
    } catch {
      throw new ApiError(400, "Corps JSON invalide", "INVALID_BODY");
    }
    const { notificationLogId, status, errorMessage } = corpsSchema.parse(json);

    const resultat = await ZupDriveNotificationsService.updateNotificationStatus(notificationLogId, status, errorMessage);
    res.json({ success: true, applied: resultat.applied });
  } catch (error) {
    next(error);
  }
};
