import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitDriverEvent } from "../config/socket";
import { DispatchService } from "./dispatch.service";

/**
 * Pause temporaire d'un livreur.
 *
 * Se mettre hors ligne pour cinq minutes de pause obligeait à couper le
 * partage de position, puis à penser à se remettre en ligne. La pause garde le
 * livreur connecté et localisé, écarte seulement les nouvelles courses, et se
 * lève d'elle-même à l'heure dite.
 */

export const PAUSE_MIN_MINUTES = 5;
export const PAUSE_MAX_MINUTES = 240;

/** L'e-mail du salon temps réel : celui du compte, à défaut celui de la fiche. */
async function emailDuLivreur(driverId: string) {
  const livreur = await db.driver.findUnique({
    where: { id: driverId },
    select: { email: true, user: { select: { email: true } } },
  });
  return livreur?.user?.email || livreur?.email || null;
}

export class DriverAvailabilityService {
  /** Un livreur en pause à cet instant. */
  static estEnPause(livreur: { pausedUntil: Date | null }, maintenant = new Date()) {
    return Boolean(livreur.pausedUntil && livreur.pausedUntil > maintenant);
  }

  static async mettreEnPause(driverId: string, minutes: number, raison?: string) {
    if (!Number.isFinite(minutes) || minutes < PAUSE_MIN_MINUTES || minutes > PAUSE_MAX_MINUTES) {
      throw new ApiError(
        400,
        `La pause dure entre ${PAUSE_MIN_MINUTES} et ${PAUSE_MAX_MINUTES} minutes`,
        "INVALID_PAUSE"
      );
    }

    const livreur = await db.driver.findUnique({ where: { id: driverId } });
    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    if (!livreur.isOnline) {
      throw new ApiError(409, "Passez en ligne avant de vous mettre en pause", "DRIVER_OFFLINE");
    }

    // Une pause en pleine course laisserait un client sans sa commande.
    if (livreur.currentOrderId) {
      throw new ApiError(409, "Terminez votre course en cours avant de faire une pause", "DELIVERY_IN_PROGRESS");
    }

    const fin = new Date(Date.now() + minutes * 60000);

    const misAJour = await db.driver.update({
      where: { id: driverId },
      data: { pausedUntil: fin, pauseReason: raison?.trim() || null, isAvailable: false },
    });

    // Une course proposée juste avant la pause ne doit pas attendre la fin du
    // délai : elle part tout de suite au suivant.
    const ouvertes = await db.deliveryOffer.findMany({
      where: { driverId, status: "PENDING" },
      select: { id: true, deliveryId: true },
    });

    if (ouvertes.length > 0) {
      await db.deliveryOffer.updateMany({
        where: { id: { in: ouvertes.map((o) => o.id) } },
        data: { status: "DECLINED", respondedAt: new Date() },
      });

      for (const offre of ouvertes) {
        await DispatchService.proposerAuSuivant(offre.deliveryId).catch((err) =>
          logger.warn("Relance après pause impossible", {
            deliveryId: offre.deliveryId,
            error: err instanceof Error ? err.message : err,
          })
        );
      }
    }

    return misAJour;
  }

  /** Lève la pause : le livreur redevient disponible s'il est en ligne et libre. */
  static async reprendre(driverId: string) {
    const livreur = await db.driver.findUnique({ where: { id: driverId } });
    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    return db.driver.update({
      where: { id: driverId },
      data: {
        pausedUntil: null,
        pauseReason: null,
        isAvailable: livreur.isOnline && livreur.currentOrderId === null,
      },
    });
  }

  /**
   * Lève les pauses arrivées à échéance et prévient les livreurs concernés.
   * Appelé périodiquement.
   */
  static async leverPausesEchues() {
    const echues = await db.driver.findMany({
      where: { pausedUntil: { lte: new Date() } },
      select: { id: true },
    });

    for (const { id } of echues) {
      const livreur = await this.reprendre(id);
      const email = await emailDuLivreur(id);
      if (email) {
        emitDriverEvent(email, "pause-terminee", {
          isAvailable: livreur.isAvailable,
          isOnline: livreur.isOnline,
        });
      }
    }

    return echues.length;
  }
}
