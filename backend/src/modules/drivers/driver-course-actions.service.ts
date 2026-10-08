import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { emitDeliveryUpdate, emitNotification } from "../realtime/socket";
import { DispatchService, STATUTS_EN_COURSE } from "./dispatch.service";
import {
  DeliveryProofService,
  exigerAttenteTerminee,
  exigerPresenceChezClient,
  finAttente,
  lirePositionDepot,
} from "./delivery-proof.service";
import { FileUploadService } from "../files/file-upload.service";
import { GPS_PERDU_APRES_MS } from "./driver-availability.service";
import { SurveillanceCoursesService } from "./surveillance-courses.service";
import { Notifier, enArrierePlan } from "../notifications/notifier.service";
import { adresseDepot, adresseSignee, cheminRelatif } from "../files/fichiers-prives.service";
import { courseDuLivreur } from "./driver-ownership.service";

/** Ce que l'application envoie à chaque étape d'une course (corps non fiable, lu champ par champ). */
export type EtapeCourse = {
  effectueLe?: unknown;
  code?: string;
  photoUrl?: string;
  note?: string;
  positionDepot?: unknown;
};

/**
 * Actions du livreur sur une course qui lui est attribuée : changer d'étape,
 * annuler, photographier le dépôt, lancer l'attente du client, envoyer sa
 * position. Chacune vérifie d'abord l'appartenance de la course.
 */
export const DriverCourseActionsService = {
  /** Fait passer la course à l'étape `status` (récupérée, livrée, échouée…). */
  async changerStatut(userId: string, deliveryId: string, status: string, etape: EtapeCourse | undefined) {
    const { livreur, course } = await courseDuLivreur(userId, deliveryId);

    if (course.driverId !== livreur.id) {
      throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
    }

    /**
     * Une course terminée ne revient pas en arrière.
     *
     * L'application renvoie au retour du réseau les étapes faites sans lui ;
     * une prise en charge partie en double après la remise ne doit pas
     * rouvrir une course livrée.
     */
    if ((course.status === "DELIVERED" || course.status === "FAILED") && status !== course.status) {
      throw new ApiError(409, "Cette course est déjà terminée", "DELIVERY_FINISHED");
    }

    /**
     * L'heure où l'étape a vraiment eu lieu.
     *
     * Faite sans réseau, elle n'arrive qu'au retour de celui-ci, parfois
     * vingt minutes plus tard : l'historique et les statistiques doivent
     * garder l'heure réelle. Retenue seulement si elle est plausible (dans
     * les six dernières heures, pas dans le futur, pas avant l'attribution) ;
     * sinon, l'heure de réception.
     */
    const maintenant = new Date();
    const declaree = typeof etape?.effectueLe === "string" ? new Date(etape.effectueLe) : null;
    const effectueLe =
      declaree &&
      !Number.isNaN(declaree.getTime()) &&
      declaree.getTime() <= maintenant.getTime() + 60_000 &&
      declaree.getTime() >= maintenant.getTime() - 6 * 3600_000 &&
      (!course.assignedAt || declaree.getTime() >= course.assignedAt.getTime())
        ? new Date(Math.min(declaree.getTime(), maintenant.getTime()))
        : maintenant;

    /**
     * La commande ne quitte le commerce qu'une fois prête.
     *
     * Le livreur est appelé dès « En préparation » pour avoir le temps
     * d'arriver : il attend alors que le commerçant la déclare prête.
     */
    if (status === "PICKED_UP" && course.status !== "PICKED_UP") {
      const commande = await db.order.findUnique({
        where: { id: course.orderId },
        select: { status: true },
      });
      if (commande && commande.status !== "READY") {
        throw new ApiError(
          409,
          "La commande est encore en préparation : attendez que le commerçant la déclare prête.",
          "ORDER_NOT_READY"
        );
      }
    }

    /**
     * Clore une course demande une preuve.
     *
     * Elle passait à DELIVERED sur simple clic : rien ne distinguait un repas
     * remis en main propre d'un repas jamais sorti du sac. Le code du client
     * le prouve ; à défaut, la photo du dépôt.
     */
    let preuve: string | null = null;
    if (status === "DELIVERED" && course.status !== "DELIVERED") {
      // Tournée : on ne remet qu'à son tour, toutes les commandes en main.
      await DispatchService.exigerTourAtteint(livreur.id, deliveryId);
      preuve = await DeliveryProofService.verifier(deliveryId, {
        code: etape?.code,
        photoUrl: etape?.photoUrl,
        note: etape?.note,
        // Où le téléphone était quand la photo a été prise (indice, voir
        // photoPriseLoinDuClient).
        position: lirePositionDepot(etape?.positionDepot),
      });
    }

    const delivery = await db.orderDelivery.update({
      where: { id: deliveryId },
      data: {
        status: status,
        ...(status === "DELIVERED" && course.status !== "DELIVERED" && { deliveryTime: effectueLe }),
        // L'heure de récupération sert à l'historique et aux statistiques.
        ...(status === "PICKED_UP" && course.status !== "PICKED_UP" && { pickupTime: effectueLe })
      },
      include: { order: { select: { feesAmount: true, tipAmount: true } } }
    });

    // Un retrait de plus : l'ordre des remises se recalcule, depuis le
    // dernier commerce, une fois toutes les commandes en main.
    if (status === "PICKED_UP" && course.status !== "PICKED_UP") {
      await db.orderDelivery.updateMany({
        where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } },
        data: { ordreRemise: null },
      });
    }

    // Une course livrée alimente les compteurs du livreur. On paie ce qui a
    // été annoncé à l'attribution, pas les frais facturés au client : une
    // course longue doit être payée comme telle même si le commerçant offre
    // la livraison.
    if (status === "DELIVERED" && course.status !== "DELIVERED") {
      const remuneration = Number(delivery.driverPayout ?? delivery.order?.feesAmount ?? 0);

      // Mettre à jour le statut de la commande à COMPLETED quand la livraison est DELIVERED
      await db.order.update({
        where: { id: delivery.orderId },
        data: { status: "COMPLETED" },
      });

      await db.courier.update({
        where: { id: livreur.id },
        data: {
          totalDeliveries: { increment: 1 },
          totalEarnings: { increment: remuneration },
        },
      });
      // Le livreur redevient disponible pour la course suivante, sauf s'il
      // lui en reste d'autres dans sa tournée.
      await DispatchService.liberer(livreur.id);

      // Le pourboire laissé en commandant lui est acquis à la remise : on
      // le lui dit, comme pour celui laissé après la livraison.
      const pourboire = Number(delivery.order?.tipAmount ?? 0);
      if (pourboire > 0) {
        try {
          const notification = await db.notification.create({
            data: {
              type: "PLATFORM_ANNOUNCEMENT",
              title: "Vous avez reçu un pourboire 🎉",
              message: `${pourboire.toFixed(2).replace(".", ",")} € laissés par le client pour cette course. Ils sont compris dans votre gain.`,
              recipientEmail: livreur.email,
              link: "/driver/earnings",
              relatedOrderId: delivery.orderId,
            },
          });
          emitNotification(livreur.email, notification);
        } catch (err) {
          logger.warn("Pourboire : notification du livreur impossible", { error: (err as Error).message });
        }
      }

      // Notifier le client que la commande est livrée avec succès
      const order = await db.order.findUnique({
        where: { id: delivery.orderId },
        select: { customerEmail: true },
      });

      if (order?.customerEmail) {
        // Créer une notification pour le client
        await db.notification.create({
          data: {
            type: "ORDER_DELIVERED",
            title: "Commande livrée avec succès",
            message: "Votre commande a été livrée. Merci pour votre achat !",
            recipientEmail: order.customerEmail,
            link: `/client/orders/${delivery.orderId}`,
            relatedOrderId: delivery.orderId,
          },
        });

        // Notifier en temps réel via Socket.IO
        const { emitOrderUpdate } = await import("../realtime/socket");
        emitOrderUpdate(delivery.orderId, "COMPLETED", {
          message: "Votre commande a été livrée. Merci pour votre achat !",
          title: "Commande livrée avec succès",
        });
        emitNotification(order.customerEmail, {
          type: "order_delivered",
          orderId: delivery.orderId,
          status: "COMPLETED",
          title: "Commande livrée avec succès",
          message: "Votre commande a été livrée. Merci pour votre achat !",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Un dépôt en photo fait pendant un incident de livraison n'est pas payé
    // sans examen de la plateforme. Un échec ici n'annule pas la remise.
    if (preuve === "PHOTO") {
      try {
        await SurveillanceCoursesService.apresDepotPhoto(deliveryId);
      } catch (err) {
        logger.error("Dépôt en photo : examen impossible", {
          deliveryId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    // Une course abandonnée doit libérer le livreur, sans quoi il ne reçoit
    // plus rien.
    if (status === "FAILED" && course.status !== "FAILED") {
      await DispatchService.liberer(livreur.id);
    }

    emitDeliveryUpdate(delivery.orderId, { status });

    // Le client est prévenu hors de l'application des étapes qui comptent.
    if ((status === "PICKED_UP" || status === "DELIVERED") && course.status !== status) {
      enArrierePlan(Notifier.etapeLivraisonClient(delivery.orderId, status));
    }

    return delivery;
  },

  /**
   * La photo du dépôt, prise sur place.
   *
   * Le livreur devait coller un lien vers une photo hébergée ailleurs : personne
   * ne le faisait. La photo part maintenant de l'appareil du téléphone et reste
   * chez nous, où le client la voit. Elle n'est retenue comme preuve qu'à la
   * clôture de la course (PATCH /deliveries/:id avec `photoUrl`).
   */
  async deposerPhoto(userId: string, deliveryId: string, fichier: Express.Multer.File | undefined) {
    const { livreur, course } = await courseDuLivreur(userId, deliveryId);

    if (course.driverId !== livreur.id) {
      throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
    }
    if (course.status !== "PICKED_UP") {
      throw new ApiError(400, "La photo se prend au moment du dépôt", "NOT_PICKED_UP");
    }
    await DispatchService.exigerTourAtteint(livreur.id, deliveryId);
    // Le dépôt ne se photographie qu'au terme de l'attente du client.
    exigerAttenteTerminee(course);
    if (!fichier) {
      throw new ApiError(400, "Aucune photo reçue", "NO_FILE");
    }
    if (!fichier.mimetype.startsWith("image/")) {
      throw new ApiError(400, "Le dépôt se prouve par une photo", "INVALID_FILE_TYPE");
    }

    const { url } = await FileUploadService.uploadDocument(
      fichier.buffer,
      fichier.originalname || "depot.jpg",
      "deliveries",
      fichier.mimetype
    );

    // photoUrl est l'adresse à transmettre à la remise ; apercuUrl, signée
    // et valable cinq minutes, s'affiche tout de suite dans une balise <img>
    // (la pièce n'est pas encore rattachée à la course).
    const relatif = cheminRelatif(url);
    return { photoUrl: adresseDepot(url, deliveryId), apercuUrl: relatif ? adresseSignee(relatif) : url };
  },

  /**
   * Le client ne répond pas : l'attente commence.
   *
   * Le livreur est à la porte, il a appelé sans réponse. Six minutes commencent,
   * que le client voit sur son suivi et reçoit par notification ; à leur terme
   * seulement, le livreur peut déposer la commande en lieu sûr et la
   * photographier. Relancer ne remet pas le compteur à zéro.
   */
  async lancerAttente(userId: string, deliveryId: string) {
    const { livreur, course } = await courseDuLivreur(userId, deliveryId);

    if (course.driverId !== livreur.id) {
      throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
    }
    if (course.status !== "PICKED_UP") {
      throw new ApiError(409, "L'attente commence une fois la commande récupérée, chez le client", "NOT_PICKED_UP");
    }
    // Tournée : on n'attend un client qu'à son tour.
    await DispatchService.exigerTourAtteint(livreur.id, deliveryId);

    // Devant chez le client, et pas ailleurs : l'attente ouvre le dépôt en
    // photo (voir exigerPresenceChezClient). Un second appui sur une attente
    // déjà lancée n'est pas contrôlé de nouveau.
    if (!course.customerWaitStartedAt) {
      const fraiche =
        !livreur.gpsLostAt &&
        livreur.lastLocationUpdate &&
        Date.now() - livreur.lastLocationUpdate.getTime() <= GPS_PERDU_APRES_MS;
      const position =
        fraiche && livreur.latitude != null && livreur.longitude != null
          ? { latitude: livreur.latitude, longitude: livreur.longitude }
          : null;
      exigerPresenceChezClient(position, course);
    }

    // Une seule attente par course, même si le bouton est touché deux fois.
    const lancee = await db.orderDelivery.updateMany({
      where: { id: deliveryId, customerWaitStartedAt: null },
      data: { customerWaitStartedAt: new Date() },
    });
    const aJour = await db.orderDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      select: { orderId: true, customerWaitStartedAt: true },
    });
    const fin = finAttente(aJour);

    if (lancee.count > 0 && fin) {
      // Le suivi du client affiche aussitôt le compte à rebours.
      emitDeliveryUpdate(aJour.orderId, { status: "PICKED_UP", attenteFinLe: fin, maintenant: new Date() });
      enArrierePlan(Notifier.attenteClient(aJour.orderId, fin));
      logger.info("Customer wait started", { deliveryId, driverId: livreur.id });
    }

    return { attenteDebutLe: aJour.customerWaitStartedAt, attenteFinLe: fin, maintenant: new Date() };
  },

  /** Position envoyée pendant une course : le livreur doit être celui de la course. */
  async enregistrerPositionDeCourse(userId: string, deliveryId: string, position: { latitude: number; longitude: number }) {
    const { livreur } = await courseDuLivreur(userId, deliveryId);

    // Écrire ici dans deliveryLat/Lng effaçait l'adresse de livraison du
    // client à chaque envoi de position. La position du livreur a désormais
    // ses propres colonnes.
    await DispatchService.enregistrerPosition(livreur.id, position);
  },

  /** Annule une course acceptée : elle repart vers un autre livreur. */
  async annuler(userId: string, deliveryId: string, reason: string) {
    const { livreur, course } = await courseDuLivreur(userId, deliveryId);

    if (course.status !== "ACCEPTED") {
      throw new ApiError(
        409,
        "Seule une course acceptée peut être annulée",
        "INVALID_STATUS"
      );
    }

    // Annuler la course
    await db.orderDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "FAILED",
        driverId: null,
        assignedAt: null,
        cancelledBy: "DRIVER",
        cancellationReason: reason.trim(),
      },
    });

    // Libérer le livreur, s'il n'a pas d'autre course dans sa tournée.
    await DispatchService.liberer(livreur.id);

    // Remettre la commande en READY pour permettre au restaurant de proposer à un autre livreur
    const order = await db.order.update({
      where: { id: course.orderId },
      data: { status: "READY" },
      select: { customerEmail: true },
    });

    // Notifier le client et le restaurant
    if (order.customerEmail) {
      await db.notification.create({
        data: {
          type: "DELIVERY_CANCELLED",
          title: "Livraison annulée",
          message: `Votre livraison a été annulée. Un autre livreur sera assigné sous peu.`,
          recipientEmail: order.customerEmail,
          link: `/client/orders/${course.orderId}`,
          relatedOrderId: course.orderId,
        },
      });

      const { emitNotification } = await import("../realtime/socket");
      emitNotification(order.customerEmail, {
        type: "delivery_cancelled",
        orderId: course.orderId,
        reason,
        title: "Livraison annulée",
        message: "Un autre livreur sera assigné.",
      });
    }

    return { deliveryId, orderId: course.orderId };
  },
};
