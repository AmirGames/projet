import Stripe from "stripe";
import { db } from "./db";
import { stripe, STRIPE_CONFIG } from "../config/stripe";
import { logger } from "../config/logger";
import { ApiError } from "../middleware/errorHandler";

/** Les états d'une intention Stripe qui attendent encore le client. */
const INTENTION_EN_COURS = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

/** Euros → centimes, l'unité que Stripe attend. */
const enCentimes = (euros: number) => Math.round(euros * 100);

const idIntention = (intention: string | Stripe.PaymentIntent | null) =>
  typeof intention === "string" ? intention : intention?.id ?? null;

export const paymentService = {
  /**
   * L'intention de paiement d'une commande.
   *
   * Le montant est celui de la commande, lu en base : il arrivait du
   * navigateur, qui pouvait donc payer ce qu'il voulait. L'intention est
   * enregistrée sur la commande — sans ce lien, le webhook ne saurait pas
   * quelle commande marquer payée. Une intention encore ouverte est reprise
   * plutôt que doublée : deux onglets ne doivent pas pouvoir débiter deux fois.
   */
  async createPaymentIntent(orderId: string) {
    const commande = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!commande || commande.deletedAt) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }
    if (commande.status === "REJECTED") {
      throw new ApiError(409, "Cette commande a été refusée.", "ORDER_REJECTED");
    }
    if (commande.paymentStatus === "SUCCEEDED" || commande.paymentStatus === "REFUNDED") {
      throw new ApiError(409, "Cette commande est déjà payée.", "ORDER_ALREADY_PAID");
    }

    const montant = enCentimes(Number(commande.totalAmount));
    const existant = commande.payments[0];

    if (existant?.stripePaymentIntentId) {
      const ouverte = await stripe.paymentIntents.retrieve(existant.stripePaymentIntentId);
      if (INTENTION_EN_COURS.has(ouverte.status) && ouverte.amount === montant) {
        return ouverte;
      }
    }

    const intention = await stripe.paymentIntents.create({
      amount: montant,
      currency: STRIPE_CONFIG.currency,
      receipt_email: commande.customerEmail || undefined,
      metadata: { orderId: commande.id, storeId: commande.storeId },
      payment_method_types: ["card"],
    });

    await db.payment.upsert({
      where: { orderId: commande.id },
      create: {
        orderId: commande.id,
        amount: commande.totalAmount,
        status: "PENDING",
        stripePaymentIntentId: intention.id,
        stripeClientSecret: intention.client_secret,
        stripeStatus: intention.status,
      },
      update: {
        amount: commande.totalAmount,
        status: "PENDING",
        stripePaymentIntentId: intention.id,
        stripeClientSecret: intention.client_secret,
        stripeStatus: intention.status,
      },
    });

    await db.order.update({
      where: { id: commande.id },
      data: { paymentId: intention.id, paymentStatus: "PENDING" },
    });

    return intention;
  },

  /**
   * L'état d'une intention, relu chez Stripe — et reporté sur la commande.
   *
   * Le webhook reste la source qui fait foi, mais il peut arriver après que
   * le client a vu « paiement réussi » : ce relevé évite que la commande
   * s'affiche encore « en attente » dans l'intervalle.
   */
  async confirmPayment(paymentIntentId: string) {
    const intention = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intention.status === "succeeded") {
      await this.marquerPaye(intention);
    }
    return intention;
  },

  /**
   * Le webhook Stripe.
   *
   * La signature est vérifiée sur le corps brut, tel que Stripe l'a envoyé :
   * sans elle, n'importe qui pourrait déclarer une commande payée. Chaque
   * traitement est rejouable sans effet de bord : Stripe renvoie un événement
   * tant qu'il n'a pas reçu de 2xx, et parfois deux fois de suite.
   */
  async handleWebhook(corpsBrut: Buffer | string, signature: string | undefined) {
    if (!STRIPE_CONFIG.webhookSecret) {
      throw new ApiError(503, "Webhook Stripe non configuré", "STRIPE_WEBHOOK_NOT_CONFIGURED");
    }
    if (!signature) {
      throw new ApiError(400, "Signature Stripe absente", "STRIPE_SIGNATURE_MISSING");
    }

    let evenement: Stripe.Event;
    try {
      evenement = stripe.webhooks.constructEvent(corpsBrut, signature, STRIPE_CONFIG.webhookSecret);
    } catch (err) {
      logger.warn("Webhook Stripe : signature invalide", { error: (err as Error).message });
      throw new ApiError(400, "Signature Stripe invalide", "STRIPE_SIGNATURE_INVALID");
    }

    switch (evenement.type) {
      case "payment_intent.succeeded":
        await this.marquerPaye(evenement.data.object);
        break;
      case "payment_intent.payment_failed":
        await this.marquerEchec(evenement.data.object);
        break;
      case "payment_intent.canceled":
        await db.payment.updateMany({
          where: { stripePaymentIntentId: evenement.data.object.id },
          data: { stripeStatus: evenement.data.object.status },
        });
        break;
      case "charge.refunded":
        await this.marquerRembourse(evenement.data.object);
        break;
      case "refund.failed":
      case "refund.updated":
        if (evenement.data.object.status === "failed") {
          await this.remboursementEchoue(evenement.data.object);
        }
        break;
      default:
        logger.debug("Webhook Stripe ignoré", { type: evenement.type });
    }

    return evenement;
  },

  /** La commande de cette intention : par sa métadonnée, sinon par le paiement enregistré. */
  async commandeDeLIntention(intention: Stripe.PaymentIntent) {
    const orderId =
      intention.metadata?.orderId ||
      (await db.payment.findFirst({
        where: { stripePaymentIntentId: intention.id },
        select: { orderId: true },
      }))?.orderId;

    if (!orderId) return null;
    return db.order.findUnique({ where: { id: orderId } });
  },

  async marquerPaye(intention: Stripe.PaymentIntent) {
    const commande = await this.commandeDeLIntention(intention);
    if (!commande) {
      logger.warn("Paiement Stripe sans commande", { paymentIntentId: intention.id });
      return null;
    }

    // Déjà remboursée : un événement « payé » en retard ne la fait pas revenir.
    if (commande.paymentStatus === "REFUNDED") return commande;

    const recu = intention.amount_received ?? intention.amount;
    if (recu !== enCentimes(Number(commande.totalAmount))) {
      logger.error("Montant encaissé différent du total de la commande", {
        orderId: commande.id,
        paymentIntentId: intention.id,
        recu,
        attendu: enCentimes(Number(commande.totalAmount)),
      });
    }

    const paidAt = new Date();
    await db.payment.upsert({
      where: { orderId: commande.id },
      create: {
        orderId: commande.id,
        amount: recu / 100,
        status: "SUCCEEDED",
        stripePaymentIntentId: intention.id,
        stripeStatus: intention.status,
        paidAt,
      },
      update: {
        status: "SUCCEEDED",
        stripePaymentIntentId: intention.id,
        stripeStatus: intention.status,
        paidAt,
      },
    });

    await db.order.update({
      where: { id: commande.id },
      data: { paymentStatus: "SUCCEEDED", paymentId: intention.id },
    });

    logger.info("Commande payée", { orderId: commande.id, paymentIntentId: intention.id });

    // Payée alors qu'elle venait d'être refusée, ou abandonnée : l'argent
    // repart aussitôt.
    if (commande.status === "REJECTED" || commande.deletedAt) {
      try {
        await this.rembourserCommande(commande.id, "Paiement reçu après le refus de la commande");
      } catch (err) {
        logger.error("Remboursement impossible d'une commande payée après son refus", {
          orderId: commande.id,
          error: (err as Error).message,
        });
      }
    }

    await this.transmettreAuCommercant(commande.id);

    return commande;
  },

  /**
   * La commande payée en ligne part enfin au commerçant : elle entre dans
   * ses listes, sa boutique sonne, et son délai de réponse commence. Une seule
   * fois — le webhook et `/confirm` peuvent arriver tous les deux.
   */
  async transmettreAuCommercant(orderId: string) {
    const { count } = await db.order.updateMany({
      where: { id: orderId, submittedAt: null, status: "PENDING", deletedAt: null },
      data: { submittedAt: new Date() },
    });
    if (count === 0) return false;

    const commande = await db.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: { include: { category: { select: { name: true } } } }, variant: true },
        },
      },
    });
    if (!commande) return false;

    // Import tardif : le service des commandes dépend déjà de celui-ci.
    const { OrderService } = await import("./order.service");
    await OrderService.annoncerAuCommercant(commande);

    logger.info("Commande transmise au commerçant après encaissement", { orderId });
    return true;
  },

  /**
   * Les paiements en ligne jamais aboutis.
   *
   * Le client a fermé l'onglet, ou sa banque a refusé : la commande n'est
   * jamais partie au commerçant et ne partira plus. Elle est retirée, et son
   * intention annulée pour qu'un paiement tardif ne la ressuscite pas. Si
   * l'encaissement a eu lieu sans que le webhook soit passé, elle est
   * transmise au lieu d'être retirée.
   */
  async abandonnerLesPaiementsNonAboutis(delaiMinutes = 30) {
    const abandonnees = await db.order.findMany({
      where: {
        submittedAt: null,
        deletedAt: null,
        status: "PENDING",
        paymentStatus: { in: ["PENDING", "FAILED"] },
        createdAt: { lt: new Date(Date.now() - delaiMinutes * 60 * 1000) },
      },
      select: { id: true, paymentId: true },
      take: 50,
    });

    let retirees = 0;
    for (const commande of abandonnees) {
      try {
        if (commande.paymentId) {
          const intention = await stripe.paymentIntents.retrieve(commande.paymentId);
          if (intention.status === "succeeded") {
            await this.marquerPaye(intention);
            continue;
          }
          await this.annulerIntention(commande.paymentId);
        }

        await db.order.updateMany({
          where: { id: commande.id, submittedAt: null },
          data: { deletedAt: new Date() },
        });
        retirees += 1;
      } catch (err) {
        logger.warn("Commande non payée impossible à retirer", {
          orderId: commande.id,
          error: (err as Error).message,
        });
      }
    }

    return retirees;
  },

  async marquerEchec(intention: Stripe.PaymentIntent) {
    const commande = await this.commandeDeLIntention(intention);
    if (!commande) return null;

    await db.payment.updateMany({
      where: { orderId: commande.id, status: "PENDING" },
      data: { status: "FAILED", stripeStatus: intention.status },
    });
    // Un échec suivi d'une nouvelle tentative réussie ne doit pas écraser le succès.
    await db.order.updateMany({
      where: { id: commande.id, paymentStatus: "PENDING" },
      data: { paymentStatus: "FAILED" },
    });

    logger.info("Paiement refusé par la banque", {
      orderId: commande.id,
      paymentIntentId: intention.id,
      raison: intention.last_payment_error?.message,
    });
    return commande;
  },

  /** Un remboursement fait depuis le tableau de bord Stripe arrive aussi par ici. */
  async marquerRembourse(charge: Stripe.Charge) {
    const paymentIntentId = idIntention(charge.payment_intent);
    if (!paymentIntentId) return null;

    const paiement = await db.payment.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!paiement) {
      logger.warn("Remboursement Stripe sans paiement connu", { paymentIntentId });
      return null;
    }

    // Un remboursement partiel laisse la commande payée : seul le montant rendu est noté.
    const total = charge.amount_refunded >= charge.amount;
    await db.payment.update({
      where: { id: paiement.id },
      data: {
        refundedAmount: charge.amount_refunded / 100,
        refundedAt: paiement.refundedAt ?? new Date(),
        ...(total ? { status: "REFUNDED" as const } : {}),
      },
    });
    if (total) {
      await db.order.update({
        where: { id: paiement.orderId },
        data: { paymentStatus: "REFUNDED" },
      });
    }
    return paiement;
  },

  /**
   * Stripe n'a pas pu rendre l'argent (carte expirée, compte clos). La
   * commande redevient « payée » : quelqu'un doit rembourser autrement.
   */
  async remboursementEchoue(remboursement: Stripe.Refund) {
    const paymentIntentId = idIntention(remboursement.payment_intent);
    if (!paymentIntentId) return null;

    const paiement = await db.payment.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!paiement) return null;

    await db.payment.update({
      where: { id: paiement.id },
      data: { status: "SUCCEEDED", refundedAt: null, refundedAmount: null },
    });
    await db.order.update({
      where: { id: paiement.orderId },
      data: { paymentStatus: "SUCCEEDED" },
    });

    logger.error("Remboursement Stripe échoué : à rembourser à la main", {
      orderId: paiement.orderId,
      refundId: remboursement.id,
      raison: remboursement.failure_reason,
    });
    return paiement;
  },

  /**
   * Rend l'argent d'une commande refusée ou annulée.
   *
   * Payée : remboursée en entier. Pas encore payée : l'intention est annulée,
   * pour que le client ne puisse plus régler une commande qui n'existe plus.
   * La clé d'idempotence empêche un second remboursement si l'appel est rejoué.
   *
   * Renvoie le remboursement créé, ou null s'il n'y avait rien à rendre.
   */
  async rembourserCommande(orderId: string, raison: string) {
    const commande = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!commande) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    const paiement = commande.payments[0];
    const paymentIntentId = paiement?.stripePaymentIntentId || commande.paymentId;
    if (!paymentIntentId) return null;

    if (commande.paymentStatus !== "SUCCEEDED") {
      if (commande.paymentStatus === "PENDING" || commande.paymentStatus === "FAILED") {
        await this.annulerIntention(paymentIntentId);
      }
      return null;
    }

    const remboursement = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        reason: "requested_by_customer",
        metadata: { orderId, raison: raison.slice(0, 500) },
      },
      { idempotencyKey: `remboursement-${orderId}` }
    );

    const refundedAt = new Date();
    await db.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        amount: commande.totalAmount,
        status: "REFUNDED",
        stripePaymentIntentId: paymentIntentId,
        stripeRefundId: remboursement.id,
        refundedAmount: remboursement.amount / 100,
        refundedAt,
      },
      update: {
        status: "REFUNDED",
        stripeRefundId: remboursement.id,
        refundedAmount: remboursement.amount / 100,
        refundedAt,
      },
    });
    await db.order.update({
      where: { id: orderId },
      data: { paymentStatus: "REFUNDED" },
    });

    logger.info("Commande remboursée", {
      orderId,
      refundId: remboursement.id,
      montant: remboursement.amount / 100,
      raison,
    });
    return remboursement;
  },

  async annulerIntention(paymentIntentId: string) {
    try {
      const intention = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (INTENTION_EN_COURS.has(intention.status) || intention.status === "requires_capture") {
        await stripe.paymentIntents.cancel(paymentIntentId);
      }
    } catch (err) {
      logger.warn("Intention de paiement non annulée", {
        paymentIntentId,
        error: (err as Error).message,
      });
    }
  },

  async savePaymentMethod(customerId: string, paymentMethodId: string, storeId: string, isDefault = false) {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    const saved = await db.paymentMethod.create({
      data: {
        storeId,
        userId: customerId,
        type: paymentMethod.type as any,
        name: paymentMethod.card?.brand || "Card",
        stripePaymentMethodId: paymentMethodId,
        config: {
          last4: paymentMethod.card?.last4,
          brand: paymentMethod.card?.brand,
        },
        isDefault,
      },
    });

    if (isDefault) {
      await db.paymentMethod.updateMany({
        where: { userId: customerId, id: { not: saved.id } },
        data: { isDefault: false },
      });
    }

    return saved;
  },

  async getUserPaymentMethods(userId: string) {
    return db.paymentMethod.findMany({
      where: { userId },
      orderBy: { isDefault: "desc" },
    });
  },

  async deletePaymentMethod(paymentMethodId: string) {
    await stripe.paymentMethods.detach(paymentMethodId);
    return db.paymentMethod.delete({
      where: { stripePaymentMethodId: paymentMethodId },
    });
  },
};
