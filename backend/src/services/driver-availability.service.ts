import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitDeliveryUpdate, emitDriverEvent, emitNotification } from "../config/socket";
import { DispatchService } from "./dispatch.service";
import { Notifier, enArrierePlan } from "./notifier.service";

/**
 * Pause temporaire d'un livreur.
 *
 * Se mettre hors ligne pour cinq minutes de pause obligeait à couper le
 * partage de position, puis à penser à se remettre en ligne. La pause garde le
 * livreur connecté et localisé, écarte seulement les nouvelles courses, et se
 * lève d'elle-même à l'heure dite.
 */

export const PAUSE_MIN_MINUTES = 5;

/** Sans position depuis ce délai, le signal GPS est considéré perdu. La
 *  position part toutes les 15 s : deux minutes, c'est huit envois manqués. */
export const GPS_PERDU_APRES_MS = 2 * 60000;
/** Sans course et sans signal depuis ce délai, le livreur est mis hors ligne :
 *  il a sans doute fermé l'application sans se déconnecter. */
export const HORS_LIGNE_APRES_MS = 10 * 60000;
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
      enArrierePlan(
        Notifier.pushLivreur(id, {
          title: "Fin de la pause",
          body: "Vous pouvez de nouveau recevoir des courses.",
          url: "/driver",
          tag: "pause",
        })
      );
    }

    return echues.length;
  }

  /**
   * Repère les livreurs en ligne qui n'envoient plus leur position.
   *
   * Un téléphone sans réseau ou sans GPS n'envoie justement plus rien : rien
   * ne se passait, le livreur restait « disponible » à une position vieille
   * d'une heure et recevait des courses qu'il ne voyait pas, et le client
   * regardait une pastille immobile sans savoir pourquoi.
   */
  static async surveillerGps(maintenant = new Date()) {
    const limite = new Date(maintenant.getTime() - GPS_PERDU_APRES_MS);

    // updatedAt couvre le livreur qui vient de se mettre en ligne et n'a pas
    // encore eu le temps d'envoyer sa première position.
    const perdus = await db.driver.findMany({
      where: {
        isOnline: true,
        gpsLostAt: null,
        updatedAt: { lt: limite },
        OR: [{ lastLocationUpdate: null }, { lastLocationUpdate: { lt: limite } }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        currentOrderId: true,
        lastLocationUpdate: true,
        user: { select: { email: true } },
      },
    });

    for (const livreur of perdus) {
      await db.driver.update({ where: { id: livreur.id }, data: { gpsLostAt: maintenant } });

      const email = livreur.user?.email || livreur.email;
      emitDriverEvent(email, "gps-perdu", { depuis: livreur.lastLocationUpdate });
      enArrierePlan(
        Notifier.pushLivreur(livreur.id, {
          title: "Signal GPS perdu",
          body: "Votre position n'est plus transmise. Vérifiez la localisation et le réseau.",
          url: livreur.currentOrderId ? `/driver/deliveries/${livreur.currentOrderId}` : "/driver",
          tag: "gps",
        })
      );

      if (livreur.currentOrderId) {
        await this.prevenirGpsPerduPendantCourse(livreur.currentOrderId, livreur.name, livreur.lastLocationUpdate);
      }

      logger.warn("Signal GPS perdu", { driverId: livreur.id, enCourse: Boolean(livreur.currentOrderId) });
    }

    // Sans course, un signal perdu depuis longtemps : le livreur a quitté
    // l'application. Le laisser en ligne fausserait la liste des disponibles.
    const limiteHorsLigne = new Date(maintenant.getTime() - HORS_LIGNE_APRES_MS);
    const abandonnes = await db.driver.findMany({
      where: { isOnline: true, currentOrderId: null, gpsLostAt: { lt: limiteHorsLigne } },
      select: { id: true, email: true, user: { select: { email: true } } },
    });

    for (const livreur of abandonnes) {
      await db.driver.update({
        where: { id: livreur.id },
        data: { isOnline: false, isAvailable: false, pausedUntil: null, pauseReason: null },
      });
      emitDriverEvent(livreur.user?.email || livreur.email, "mis-hors-ligne", {
        raison: "Aucune position reçue depuis 10 minutes",
      });
      logger.info("Livreur mis hors ligne faute de signal", { driverId: livreur.id });
    }

    return { perdus: perdus.length, misHorsLigne: abandonnes.length };
  }

  /** Le client et le commerce voient que la position ne bouge plus, et pourquoi. */
  private static async prevenirGpsPerduPendantCourse(
    deliveryId: string,
    nomLivreur: string,
    derniere: Date | null
  ) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        orderId: true,
        order: { select: { storeId: true, store: { select: { orgId: true } } } },
      },
    });
    if (!course) return;

    emitDeliveryUpdate(course.orderId, { gpsLost: true, lastSeenAt: derniere });

    const membres = await db.membership.findMany({
      where: { orgId: course.order.store.orgId },
      select: { user: { select: { email: true } } },
    });

    for (const membre of membres) {
      const notification = await db.notification.create({
        data: {
          storeId: course.order.storeId,
          type: "DRIVER_GPS_LOST",
          title: "Position du livreur perdue",
          message: `${nomLivreur} n'envoie plus sa position depuis 2 minutes (réseau ou GPS coupé).`,
          recipientEmail: membre.user.email,
          relatedOrderId: course.orderId,
          priority: "HIGH",
        },
      });
      emitNotification(membre.user.email, notification);
    }
  }

  /** Une position arrive : le signal est rétabli s'il avait été perdu. */
  static async signalRetabli(driverId: string, gpsLostAt: Date | null, deliveryId: string | null) {
    if (!gpsLostAt) return;

    await db.driver.update({ where: { id: driverId }, data: { gpsLostAt: null } });

    if (deliveryId) {
      const course = await db.orderDelivery.findUnique({
        where: { id: deliveryId },
        select: { orderId: true },
      });
      if (course) emitDeliveryUpdate(course.orderId, { gpsLost: false });
    }

    const email = await emailDuLivreur(driverId);
    if (email) emitDriverEvent(email, "gps-retabli", {});
  }
}
