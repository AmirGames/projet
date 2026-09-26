import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitWebhook } from "./webhook.service";
import { EmailService } from "./email.service";
import { DispatchService } from "./dispatch.service";
import { Notifier, enArrierePlan } from "./notifier.service";
import { paymentService } from "./payment.service";
import { emitOrderUpdate, emitNotification, emitMerchantEvent } from "../config/socket";
import { arriveeChezLeCommercant } from "../utils/commande-transmise";

/**
 * Accepter ou refuser une commande, comme sur les plateformes de livraison.
 *
 * Une commande passée n'est qu'une demande. Tant que le commerçant ne l'a pas
 * acceptée, le client n'est fixé sur rien : il pouvait se présenter à 11 h 30
 * devant une boutique fermée à 11 h 05 sur un imprévu. Désormais :
 *
 * - le commerçant accepte en annonçant son temps de préparation, et le client
 *   reçoit l'heure prévue ;
 * - ou il refuse avec un motif, et le client en est prévenu tout de suite ;
 * - s'il ne répond pas à temps, la commande est refusée d'elle-même.
 */

/** Les motifs de refus, tels que le client les lit. */
export const MOTIFS_DE_REFUS = {
  TOO_BUSY: "le restaurant est trop occupé pour le moment",
  PRODUCT_UNAVAILABLE: "un produit de votre commande n'est plus disponible",
  EXCEPTIONAL_CLOSURE: "le restaurant a dû fermer exceptionnellement",
  OTHER: "le restaurant ne peut pas honorer votre commande",
  NO_RESPONSE: "le restaurant n'a pas confirmé votre commande à temps",
} as const;

export type MotifDeRefus = keyof typeof MOTIFS_DE_REFUS;

/** Ceux que le commerçant peut choisir ; NO_RESPONSE est réservé au système. */
export const MOTIFS_DU_COMMERCANT = [
  "TOO_BUSY",
  "PRODUCT_UNAVAILABLE",
  "EXCEPTIONAL_CLOSURE",
  "OTHER",
] as const;

/** Le temps que le commerçant a pour répondre à une livraison. */
export const REPONSE_LIVRAISON_MIN = 10;
/** Un retrait programmé doit être accepté au plus tard ce temps avant le créneau. */
export const REPONSE_AVANT_RETRAIT_MIN = 20;
/** Le temps qu'il faut à un livreur pour rejoindre la boutique. */
export const APPROCHE_LIVREUR_MIN = 10;

const MINUTE = 60 * 1000;

/** Les états où la commande est encore à servir. */
const ETATS_EN_COURS = ["ACCEPTED", "PREPARING", "READY"] as const;

/**
 * L'heure limite à laquelle le commerçant doit avoir répondu.
 *
 * Une livraison part tout de suite : dix minutes. Un retrait programmé à midi
 * peut attendre l'ouverture, mais doit être accepté vingt minutes avant — et
 * jamais moins de dix minutes après avoir été passé.
 */
export function echeanceDeReponse(commande: {
  createdAt: Date;
  submittedAt?: Date | null;
  deliveryType: string;
  pickupTime: Date | null;
}): Date {
  // Le délai court depuis l'arrivée chez le commerçant : pour une commande
  // payée en ligne, l'encaissement, pas la création.
  const auPlusTot = arriveeChezLeCommercant(commande).getTime() + REPONSE_LIVRAISON_MIN * MINUTE;

  if (commande.deliveryType === "PICKUP" && commande.pickupTime) {
    return new Date(
      Math.max(auPlusTot, commande.pickupTime.getTime() - REPONSE_AVANT_RETRAIT_MIN * MINUTE)
    );
  }

  return new Date(auPlusTot);
}

/** « 12:20 », à l'heure de Paris : le serveur peut tourner en UTC. */
function heure(date: Date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

const euros = (montant: number) =>
  montant.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

/**
 * Vérifie un changement d'état fait par les boutons génériques.
 *
 * Accepter demande un temps de préparation, refuser un motif : les deux ont
 * leur propre route. Une commande en attente ne peut rien faire d'autre, et une
 * commande refusée ne repart pas.
 */
export function verifierTransition(avant: string, apres: string) {
  if (apres === "ACCEPTED" || apres === "REJECTED") {
    throw new ApiError(
      400,
      apres === "ACCEPTED"
        ? "Acceptez la commande en indiquant son temps de préparation."
        : "Refusez la commande en indiquant un motif.",
      "USE_ACCEPT_OR_REJECT"
    );
  }

  if (avant === "PENDING") {
    throw new ApiError(
      400,
      "Cette commande n'est pas encore acceptée : acceptez-la ou refusez-la d'abord.",
      "ORDER_NOT_ACCEPTED"
    );
  }

  if (avant === "REJECTED") {
    throw new ApiError(400, "Cette commande a été refusée.", "ORDER_REJECTED");
  }

  if (apres === "PENDING") {
    throw new ApiError(400, "Une commande acceptée ne repasse pas en attente.", "INVALID_TRANSITION");
  }
}

export class OrderAcceptanceService {
  /**
   * Prévient le client : dans l'application, en direct, et par e-mail.
   *
   * L'e-mail n'est pas un doublon : un client invité n'a pas de compte, et ne
   * verrait jamais la notification.
   */
  static async prevenirLeClient(
    commande: {
      id: string;
      storeId: string;
      status: string;
      customerName: string;
      customerEmail: string;
      totalAmount: unknown;
    },
    titre: string,
    message: string,
    options: { email?: boolean } = {}
  ) {
    emitOrderUpdate(commande.id, commande.status, { title: titre, message });

    if (!commande.customerEmail) return;

    try {
      await db.notification.create({
        data: {
          storeId: commande.storeId,
          type: "ORDER_PLACED",
          title: titre,
          message,
          recipientEmail: commande.customerEmail,
          link: `/client/orders/${commande.id}`,
          relatedOrderId: commande.id,
        },
      });

      emitNotification(commande.customerEmail, {
        type: "order_status_update",
        orderId: commande.id,
        status: commande.status,
        title: titre,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn("Notification client impossible", {
        orderId: commande.id,
        error: err instanceof Error ? err.message : err,
      });
    }

    // Le téléphone, même application fermée : l'heure annoncée ou le refus
    // n'attendent pas que le client rouvre son suivi.
    enArrierePlan(
      Notifier.pushClient(commande.customerEmail, {
        title: titre,
        body: message,
        data: { tag: "commande", orderId: commande.id, status: commande.status },
      })
    );

    if (options.email === false) return;

    try {
      await EmailService.sendOrderStatusUpdate(commande, { titre, message });
    } catch (err) {
      logger.warn("E-mail de suivi non envoyé", {
        orderId: commande.id,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  /** Le message d'acceptation, avec l'heure que le client doit retenir. */
  static messageDAcceptation(commande: {
    deliveryType: string;
    pickupTime: Date | null;
    estimatedReadyAt: Date | null;
  }) {
    if (commande.deliveryType === "PICKUP") {
      const retrait = commande.pickupTime ?? commande.estimatedReadyAt;
      return retrait
        ? `Votre commande est acceptée. Elle vous attendra à ${heure(retrait)}.`
        : "Votre commande est acceptée.";
    }

    return commande.estimatedReadyAt
      ? `Votre commande est acceptée. Elle sera prête vers ${heure(commande.estimatedReadyAt)}, puis livrée.`
      : "Votre commande est acceptée.";
  }

  /**
   * Accepte une commande en attente.
   *
   * Pour un retrait programmé, la commande est prête au créneau choisi ; pour
   * le reste, au bout du temps de préparation annoncé.
   */
  static async accepter(storeId: string, orderId: string, preparationMinutes: number) {
    if (!Number.isInteger(preparationMinutes) || preparationMinutes < 1 || preparationMinutes > 240) {
      throw new ApiError(400, "Temps de préparation invalide", "INVALID_PREPARATION_TIME");
    }

    const commande = await db.order.findUnique({ where: { id: orderId } });

    if (!commande || commande.storeId !== storeId || commande.deletedAt || !commande.submittedAt) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    if (commande.status !== "PENDING") {
      throw new ApiError(
        409,
        commande.status === "REJECTED"
          ? "Cette commande a déjà été refusée."
          : "Cette commande a déjà été acceptée.",
        "ORDER_ALREADY_HANDLED"
      );
    }

    const maintenant = new Date();
    const finDePreparation = new Date(maintenant.getTime() + preparationMinutes * MINUTE);
    const pret =
      commande.deliveryType === "PICKUP" && commande.pickupTime && commande.pickupTime > finDePreparation
        ? commande.pickupTime
        : finDePreparation;

    // La mise à jour ne vaut que si la commande est toujours en attente : le
    // refus automatique a pu passer entre-temps, ou un collègue répondre.
    const { count } = await db.order.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedAt: maintenant,
        preparationMinutes,
        estimatedReadyAt: pret,
      },
    });

    if (count === 0) {
      throw new ApiError(409, "Cette commande vient d'être traitée.", "ORDER_ALREADY_HANDLED");
    }

    const acceptee = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    emitWebhook("order.status_changed", {
      orderId,
      storeId,
      previousStatus: "PENDING",
      status: "ACCEPTED",
      totalAmount: Number(acceptee.totalAmount),
    });

    emitMerchantEvent(storeId, "commande-traitee", { orderId, storeId, status: "ACCEPTED" });

    await this.prevenirLeClient(acceptee, "Commande acceptée", this.messageDAcceptation(acceptee));

    // Le livreur de la plateforme est cherché pour arriver quand la commande
    // sera prête. Si c'est tout de suite, on n'attend pas le prochain passage.
    if (this.aUnLivreurAChercher(acceptee) && pret.getTime() - APPROCHE_LIVREUR_MIN * MINUTE <= Date.now()) {
      await this.chercherUnLivreur(orderId);
    }

    return acceptee;
  }

  /**
   * Refuse une commande, avec son motif.
   *
   * Possible tant qu'elle n'est pas remise — une fermeture imprévue peut
   * survenir après l'acceptation. Pas une fois qu'un livreur l'a prise en
   * charge : il faut alors passer par le support.
   */
  static async refuser(
    storeId: string | null,
    orderId: string,
    motif: MotifDeRefus,
    note?: string
  ) {
    const commande = await db.order.findUnique({
      where: { id: orderId },
      include: {
        delivery: { select: { id: true, driverId: true } },
        store: { select: { name: true, phone: true } },
      },
    });

    if (!commande || (storeId && commande.storeId !== storeId) || commande.deletedAt || !commande.submittedAt) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    if (commande.status === "REJECTED" || commande.status === "COMPLETED") {
      throw new ApiError(
        409,
        commande.status === "REJECTED" ? "Cette commande est déjà refusée." : "Cette commande est déjà remise.",
        "ORDER_ALREADY_HANDLED"
      );
    }

    if (commande.delivery?.driverId) {
      throw new ApiError(
        409,
        "Un livreur a déjà pris cette commande en charge : contactez le support pour l'annuler.",
        "DRIVER_ALREADY_ASSIGNED"
      );
    }

    const precision = note?.trim().slice(0, 300) || null;

    const { count } = await db.order.updateMany({
      where: { id: orderId, status: commande.status },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        rejectionReason: motif,
        rejectionNote: precision,
      },
    });

    if (count === 0) {
      throw new ApiError(409, "Cette commande vient d'être traitée.", "ORDER_ALREADY_HANDLED");
    }

    // Une course encore sans livreur s'arrête : plus personne ne doit la
    // recevoir.
    if (commande.delivery) {
      await db.deliveryOffer.updateMany({
        where: { deliveryId: commande.delivery.id, status: "PENDING" },
        data: { status: "CANCELLED", respondedAt: new Date() },
      });
      await db.orderDelivery.update({
        where: { id: commande.delivery.id },
        data: { status: "FAILED" },
      });
    }

    // Payée en ligne : l'argent repart tout de suite, sans attendre que le
    // commerçant y pense. Pas encore payée : l'intention est annulée. Un échec
    // chez Stripe n'annule pas le refus — il est noté, et le client prévenu
    // qu'il sera remboursé autrement.
    let rembourse: { amount: number } | null = null;
    let remboursementEchoue = false;
    try {
      rembourse = await paymentService.rembourserCommande(orderId, `Commande refusée : ${motif}`);
    } catch (err) {
      remboursementEchoue = true;
      logger.error("Remboursement impossible au refus de la commande", {
        orderId,
        error: (err as Error).message,
      });
    }

    const refusee = await db.order.findUniqueOrThrow({ where: { id: orderId } });

    emitWebhook("order.status_changed", {
      orderId,
      storeId: refusee.storeId,
      previousStatus: commande.status,
      status: "REJECTED",
      totalAmount: Number(refusee.totalAmount),
    });

    emitMerchantEvent(refusee.storeId, "commande-traitee", {
      orderId,
      storeId: refusee.storeId,
      status: "REJECTED",
    });

    let message = `Votre commande chez ${commande.store.name} est annulée : ${MOTIFS_DE_REFUS[motif]}.`;
    if (precision) message += ` Précision du restaurant : « ${precision} ».`;
    if (rembourse) {
      message += ` Vous avez payé en ligne : ${euros(rembourse.amount / 100)} vous sont remboursés, ils apparaîtront sur votre compte sous 5 à 10 jours.`;
    } else if (remboursementEchoue || refusee.paymentStatus === "SUCCEEDED") {
      message += ` Vous avez payé en ligne : vous serez remboursé, contactez le restaurant en cas de question${
        commande.store.phone ? ` (tél. ${commande.store.phone})` : ""
      }.`;
    }

    await this.prevenirLeClient(refusee, "Commande annulée", message);

    return refusee;
  }

  /** La commande attend-elle un livreur de la plateforme ? */
  static aUnLivreurAChercher(commande: { deliveryType: string; deliveryMode: string | null }) {
    return commande.deliveryType === "DELIVERY" && commande.deliveryMode === "PLATFORM";
  }

  /**
   * Le commerçant fait avancer la commande : la recherche du livreur suit.
   *
   * « En préparation » lance la recherche tout de suite, pour que le livreur
   * ait le temps de rejoindre la boutique pendant que la cuisine travaille.
   * « Prête » la lance aussi si elle ne l'a pas encore été — une commande
   * passée directement de « Acceptée » à « Prête » ne doit pas rester sans
   * livreur. Une course déjà créée n'est pas recréée.
   */
  static async surAvancement(commande: {
    id: string;
    status: string;
    deliveryType: string;
    deliveryMode: string | null;
  }) {
    if (commande.status !== "PREPARING" && commande.status !== "READY") return;
    if (!this.aUnLivreurAChercher(commande)) return;

    const course = await db.orderDelivery.findUnique({
      where: { orderId: commande.id },
      select: { id: true, driverId: true, status: true },
    });

    if (!course) {
      await this.chercherUnLivreur(commande.id);
      return;
    }

    // Prête, et un livreur est déjà en route : il peut venir la prendre.
    if (commande.status === "READY" && course.driverId && course.status === "ACCEPTED") {
      enArrierePlan(
        Notifier.pushLivreur(course.driverId, {
          title: "Commande prête",
          body: "Le commerce a terminé la commande : vous pouvez la prendre en charge.",
          url: `/driver/deliveries/${course.id}`,
          tag: `commande-prete-${course.id}`,
        })
      );
    }
  }

  /** Crée la course et la propose, sans faire échouer l'appelant. */
  static async chercherUnLivreur(orderId: string) {
    try {
      const course = await DispatchService.creerCourse(orderId);
      if (!course.driverId) await DispatchService.proposerAuSuivant(course.id);
    } catch (err) {
      // Personne en ligne, ou commande particulière : la relance des
      // recherches et le bouton du commerçant restent là.
      logger.warn("Recherche de livreur impossible à l'acceptation", {
        orderId,
        error: err instanceof Error ? err.message : err,
      });
    }
  }

  /**
   * Refuse les commandes restées sans réponse.
   *
   * Sans cela, un commerçant absent de son écran laissait le client attendre
   * une commande que personne n'avait vue.
   */
  static async refuserLesCommandesSansReponse() {
    const enAttente = await db.order.findMany({
      where: {
        status: "PENDING",
        deletedAt: null,
        submittedAt: { lt: new Date(Date.now() - REPONSE_LIVRAISON_MIN * MINUTE) },
      },
      select: { id: true, createdAt: true, submittedAt: true, deliveryType: true, pickupTime: true },
      take: 100,
    });

    let refusees = 0;
    const maintenant = Date.now();

    for (const commande of enAttente) {
      if (echeanceDeReponse(commande).getTime() > maintenant) continue;

      try {
        await this.refuser(null, commande.id, "NO_RESPONSE");
        refusees += 1;
      } catch (err) {
        // Acceptée entre-temps : rien à faire.
        if (err instanceof ApiError && err.statusCode === 409) continue;
        logger.warn("Refus automatique impossible", {
          orderId: commande.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    return refusees;
  }

  /**
   * Cherche un livreur pour les commandes bientôt prêtes.
   *
   * Le livreur est appelé pour arriver quand la commande sort de la cuisine,
   * pas au moment où elle est acceptée : quarante minutes d'attente au comptoir
   * lui feraient perdre d'autres courses.
   */
  static async lancerLesCoursesDues() {
    const dues = await db.order.findMany({
      where: {
        status: { in: [...ETATS_EN_COURS] },
        deliveryType: "DELIVERY",
        deletedAt: null,
        deliveryMode: "PLATFORM",
        delivery: { is: null },
        estimatedReadyAt: { lte: new Date(Date.now() + APPROCHE_LIVREUR_MIN * MINUTE) },
      },
      select: { id: true },
      take: 50,
    });

    for (const { id } of dues) {
      await this.chercherUnLivreur(id);
    }

    return dues.length;
  }
}
