import Stripe from "stripe";
import { montantAEncaisser } from "../delivery/delivery-mode.service";
import { PourboireService } from "../orders/pourboire.service";
import { db } from "../../services/db";
import { stripe, STRIPE_CONFIG } from "./stripe";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { Outbox } from "../jobs/outbox.service";
import { TYPE_ANNONCE_COMMANDE } from "../notifications/outbox-handlers";

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

    // La commande et le pourboire du livreur, encaissés ensemble.
    const montant = enCentimes(montantAEncaisser(commande));
    const existant = commande.payments[0];

    if (existant?.stripePaymentIntentId) {
      const ouverte = await stripe.paymentIntents.retrieve(existant.stripePaymentIntentId);
      // Un paiement en traitement ou déjà encaissé ne doit jamais être doublé
      // pendant que le webhook n'a pas encore mis la base à jour.
      if (ouverte.status !== "canceled") {
        if (ouverte.amount !== montant) {
          throw new ApiError(409, "Le montant du paiement existant diffère de la commande.", "PAYMENT_AMOUNT_MISMATCH");
        }
        return ouverte;
      }
    }

    const intention = await stripe.paymentIntents.create({
      amount: montant,
      currency: STRIPE_CONFIG.currency,
      receipt_email: commande.customerEmail || undefined,
      metadata: { orderId: commande.id, storeId: commande.storeId },
      payment_method_types: ["card"],
    }, { idempotencyKey: `commande-${commande.id}-${existant?.stripePaymentIntentId || "initial"}` });

    await db.payment.upsert({
      where: { orderId: commande.id },
      create: {
        orderId: commande.id,
        amount: montantAEncaisser(commande),
        status: "PENDING",
        stripePaymentIntentId: intention.id,
        stripeClientSecret: intention.client_secret,
        stripeStatus: intention.status,
      },
      update: {
        amount: montantAEncaisser(commande),
        stripePaymentIntentId: intention.id,
        stripeClientSecret: intention.client_secret,
        stripeStatus: intention.status,
      },
    });

    await db.order.updateMany({
      where: { id: commande.id, paymentStatus: { in: ['PENDING', 'FAILED'] } },
      data: { paymentId: intention.id, paymentStatus: "PENDING" },
    });

    return intention;
  },

  /**
   * L'intention appartient-elle à cette commande ? Celle du paiement de la
   * commande, ou celle du pourboire laissé après la livraison — enregistrées
   * en base à leur création. Un identifiant quelconque ne suffit pas.
   */
  async intentionDeLaCommande(orderId: string, paymentIntentId: string) {
    const [paiement, pourboire] = await Promise.all([
      db.payment.findFirst({ where: { orderId, stripePaymentIntentId: paymentIntentId }, select: { id: true } }),
      db.courierTip.findFirst({ where: { orderId, stripePaymentIntentId: paymentIntentId }, select: { id: true } }),
    ]);
    return Boolean(paiement || pourboire);
  },

  /**
   * L'état d'une intention de cette commande, relu chez Stripe.
   *
   * Le webhook est la source qui fait foi. Le rattrapage (reporter le succès
   * sur la commande) n'a lieu que là où aucun webhook n'est configuré, et il
   * est idempotent : `marquerPaye` ne transmet la commande qu'une fois. Une
   * intention d'une autre commande répond 404, sans appel à Stripe.
   */
  async confirmPayment(orderId: string, paymentIntentId: string) {
    if (!(await this.intentionDeLaCommande(orderId, paymentIntentId))) {
      throw new ApiError(404, "Paiement introuvable", "PAYMENT_NOT_FOUND");
    }

    const intention = await stripe.paymentIntents.retrieve(paymentIntentId);
    // La métadonnée posée par le serveur doit dire la même chose que la base.
    if (intention.metadata?.orderId && intention.metadata.orderId !== orderId) {
      throw new ApiError(404, "Paiement introuvable", "PAYMENT_NOT_FOUND");
    }

    if (intention.status === "succeeded" && !STRIPE_CONFIG.webhookSecret) {
      if (PourboireService.estUnPourboire(intention)) await PourboireService.marquerPaye(intention);
      else await this.marquerPaye(intention);
    }
    return intention;
  },

  /**
   * Inscrit l'événement au journal. L'identifiant Stripe est la clé : le
   * second passage d'un même événement le retrouve. Un événement dont le
   * traitement a échoué est repris (Stripe le renvoie) ; un événement traité
   * ne l'est pas deux fois.
   */
  async journaliserEvenement(evenement: Stripe.Event): Promise<"nouveau" | "deja_traite" | "a_reprendre"> {
    const objet: any = evenement.data?.object ?? {};
    try {
      await db.stripeEvent.create({
        data: {
          id: evenement.id,
          type: evenement.type,
          objectId: typeof objet.id === "string" ? objet.id : null,
          orderId: typeof objet.metadata?.orderId === "string" ? objet.metadata.orderId : null,
        },
      });
      return "nouveau";
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
    const existant = await db.stripeEvent.findUnique({ where: { id: evenement.id }, select: { processedAt: true } });
    if (existant?.processedAt) return "deja_traite";
    await db.stripeEvent.update({ where: { id: evenement.id }, data: { attempts: { increment: 1 } } });
    return "a_reprendre";
  },

  async traiterEvenement(evenement: Stripe.Event) {
    switch (evenement.type) {
      // Un pourboire laissé après la livraison porte aussi l'orderId : il
      // passe à part, sans quoi il serait pris pour le paiement de la commande.
      case "payment_intent.succeeded":
        if (PourboireService.estUnPourboire(evenement.data.object)) {
          await PourboireService.marquerPaye(evenement.data.object);
        } else {
          await this.marquerPaye(evenement.data.object);
        }
        break;
      case "payment_intent.payment_failed":
        if (PourboireService.estUnPourboire(evenement.data.object)) {
          await PourboireService.marquerEchec(evenement.data.object);
        } else {
          await this.marquerEchec(evenement.data.object);
        }
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
        } else {
          // « pending » → « succeeded » (ou « canceled ») : l'état de la
          // commande suit ce que Stripe a réellement rendu.
          await this.remboursementMisAJour(evenement.data.object);
        }
        break;
      case "charge.dispute.created":
        await this.noterLitige(evenement.data.object, evenement.id, true);
        break;
      case "charge.dispute.closed":
        await this.noterLitige(evenement.data.object, evenement.id, false);
        break;
      default:
        logger.debug("Webhook Stripe ignoré", { type: evenement.type });
    }

  },

  /**
   * Un litige carte (opposition du client auprès de sa banque) : la plateforme
   * peut être débitée du montant et des frais. Aucun effet automatique sur la
   * commande ni sur les reversements — décision humaine — mais le litige est
   * inscrit au journal et signalé dans les logs.
   */
  async noterLitige(litige: Stripe.Dispute, evenementId: string, ouvert: boolean) {
    const intentionId = idIntention(litige.payment_intent as any);
    const paiement = intentionId
      ? await db.payment.findFirst({ where: { stripePaymentIntentId: intentionId }, select: { orderId: true } })
      : null;
    await db.stripeEvent.update({
      where: { id: evenementId },
      data: {
        objectId: litige.id,
        orderId: paiement?.orderId ?? null,
        detail: { montant: litige.amount, devise: litige.currency, motif: litige.reason, statut: litige.status },
      },
    });
    (ouvert ? logger.error : logger.info)("Litige carte Stripe", {
      litigeId: litige.id,
      orderId: paiement?.orderId,
      statut: litige.status,
      motif: litige.reason,
    });
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

    // Un événement déjà traité (rejeu, doublon de livraison) n'a aucun effet.
    const etat = await this.journaliserEvenement(evenement);
    if (etat === "deja_traite") {
      logger.info("Webhook Stripe déjà traité", { id: evenement.id, type: evenement.type });
      return evenement;
    }

    try {
      await this.traiterEvenement(evenement);
    } catch (err) {
      // Le journal ne doit pas masquer l'erreur d'origine.
      try {
        await db.stripeEvent.update({
          where: { id: evenement.id },
          data: { lastError: (err as Error).message?.slice(0, 500) },
        });
      } catch (erreurJournal) {
        logger.warn("Journal Stripe : erreur non inscrite", { id: evenement.id, error: (erreurJournal as Error).message });
      }
      throw err;
    }
    await db.stripeEvent.update({
      where: { id: evenement.id },
      data: { processedAt: new Date(), lastError: null },
    });

    return evenement;
  },

  /** La commande de cette intention : par sa métadonnée, sinon par le paiement enregistré. */
  async commandeDeLIntention(intention: Stripe.PaymentIntent) {
    const orderId = (await db.payment.findFirst({
      where: { stripePaymentIntentId: intention.id },
      select: { orderId: true },
    }))?.orderId;

    if (!orderId) return null;
    if (intention.metadata?.orderId && intention.metadata.orderId !== orderId) {
      throw new ApiError(409, "Paiement associé à une autre commande.", "PAYMENT_ORDER_MISMATCH");
    }
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
    if (intention.status !== "succeeded" || intention.currency !== STRIPE_CONFIG.currency) {
      throw new ApiError(409, "État ou devise du paiement incorrect.", "PAYMENT_INVALID");
    }
    if (recu !== enCentimes(montantAEncaisser(commande))) {
      logger.error("Montant encaissé différent du total de la commande", {
        orderId: commande.id,
        paymentIntentId: intention.id,
        recu,
        attendu: enCentimes(montantAEncaisser(commande)),
      });
      throw new ApiError(409, "Montant encaissé incorrect.", "PAYMENT_AMOUNT_MISMATCH");
    }

    const paidAt = new Date();
    const enregistre = await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: commande.id, paymentStatus: { not: 'REFUNDED' } },
        data: { paymentStatus: 'SUCCEEDED', paymentId: intention.id },
      });
      if (!count) return false;
      await tx.payment.upsert({
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

      return true;
    });
    if (!enregistre) return commande;

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
    // La commande devient « transmise » et son annonce est écrite dans la
    // même transaction : un arrêt entre les deux ne laisse plus une commande
    // payée que le commerçant ne verra jamais. L'annonce part ensuite via
    // l'outbox, rejouée jusqu'à son succès, dédoublonnée par commande.
    const enregistre = await db.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, submittedAt: null, status: "PENDING", deletedAt: null, paymentStatus: 'SUCCEEDED' },
        data: { submittedAt: new Date() },
      });
      if (count === 0) return false;
      await Outbox.enregistrer(
        TYPE_ANNONCE_COMMANDE,
        { orderId },
        { dedupeKey: `annonce-commande-${orderId}`, tx }
      );
      return true;
    });
    if (!enregistre) return false;

    // Au plus vite ; si cela échoue, le worker de l'outbox reprend.
    try {
      await Outbox.traiterLesDus(5);
    } catch (err) {
      logger.warn("Annonce de commande reportée au worker", { orderId, error: (err as Error).message });
    }

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
      select: { id: true, paymentId: true, storeId: true, promoCode: true },
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

        const { count } = await db.order.updateMany({
          where: { id: commande.id, submittedAt: null, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        // L'utilisation du code promo réservée à la création est rendue,
        // une seule fois : seul l'appel qui retire la commande la libère.
        if (count === 1 && commande.promoCode) {
          const { PromotionService } = await import("../marketing/promotion.service");
          await PromotionService.libererUtilisation(commande.storeId, commande.promoCode);
        }
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
    // Stripe peut livrer les événements dans le désordre : relire le cumul
    // actuel évite qu'un ancien remboursement partiel écrase le total final.
    charge = await stripe.charges.retrieve(charge.id);
    const paymentIntentId = idIntention(charge.payment_intent);
    if (!paymentIntentId) return null;

    const paiement = await db.payment.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!paiement) {
      logger.warn("Remboursement Stripe sans paiement connu", { paymentIntentId });
      return null;
    }

    return this.noterRemboursement(paiement, charge);
  },

  /**
   * Ramène la commande et le paiement à ce que Stripe a réellement rendu.
   *
   * Seuls les remboursements « succeeded » comptent : `amount_refunded` d'une
   * charge inclut ceux encore en attente, qui peuvent échouer ensuite. Une
   * commande n'est « REFUNDED » que quand tout le montant est rendu.
   */
  async noterRemboursement(paiement: { id: string; orderId: string; refundedAt: Date | null }, charge: Stripe.Charge) {
    const liste = await stripe.refunds.list({ charge: charge.id, limit: 100 });
    const rendu = liste.data
      .filter((r: Stripe.Refund) => r.status === "succeeded")
      .reduce((somme: number, r: Stripe.Refund) => somme + r.amount, 0);
    const total = rendu >= charge.amount;
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: paiement.orderId },
        data: { paymentStatus: total ? "REFUNDED" : "SUCCEEDED" },
      });
      await tx.payment.update({
        where: { id: paiement.id },
        data: {
          refundedAmount: rendu ? rendu / 100 : null,
          refundedAt: rendu ? paiement.refundedAt ?? new Date() : null,
          status: total ? "REFUNDED" : "SUCCEEDED",
        },
      });
    });
    return paiement;
  },

  /** Un remboursement a changé d'état chez Stripe (en attente, réussi, annulé). */
  async remboursementMisAJour(remboursement: Stripe.Refund) {
    const paymentIntentId = idIntention(remboursement.payment_intent);
    if (!paymentIntentId) return null;

    const paiement = await db.payment.findFirst({ where: { stripePaymentIntentId: paymentIntentId } });
    if (!paiement) return null;

    const chargeId = typeof remboursement.charge === "string" ? remboursement.charge : remboursement.charge?.id;
    if (!chargeId) return null;
    return this.noterRemboursement(paiement, await stripe.charges.retrieve(chargeId));
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
    // Un ancien échec ne doit pas annuler un remboursement plus récent.
    if (paiement.stripeRefundId !== remboursement.id) return null;

    const intention = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = intention.latest_charge;
    if (!charge) throw new ApiError(503, 'Charge Stripe introuvable.', 'REFUND_RECONCILIATION_FAILED');
    await this.noterRemboursement(paiement, typeof charge === 'string' ? await stripe.charges.retrieve(charge) : charge);

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

    // Un remboursement déjà demandé (en attente ou réussi) est repris, pas
    // doublé. Seul un remboursement échoué ou annulé autorise une nouvelle
    // demande, avec une autre clé d'idempotence.
    let precedent: Stripe.Refund | null = null;
    if (paiement?.stripeRefundId) {
      try {
        precedent = await stripe.refunds.retrieve(paiement.stripeRefundId);
      } catch (err) {
        logger.warn("Remboursement précédent illisible chez Stripe", { orderId, error: (err as Error).message });
      }
    }
    const reprise = precedent && ["pending", "requires_action", "succeeded"].includes(precedent.status ?? "");

    const remboursement: Stripe.Refund = reprise && precedent
      ? precedent
      : await stripe.refunds.create(
          {
            payment_intent: paymentIntentId,
            reason: "requested_by_customer",
            metadata: { orderId, raison: raison.slice(0, 500) },
          },
          { idempotencyKey: `remboursement-${orderId}${paiement?.stripeRefundId ? `-${paiement.stripeRefundId}` : ''}` }
        );

    if (remboursement.status === 'failed' || remboursement.status === 'canceled') {
      await db.payment.updateMany({ where: { orderId }, data: { stripeRefundId: remboursement.id } });
      throw new ApiError(502, 'Stripe n’a pas effectué le remboursement.', 'REFUND_FAILED');
    }

    // Demandé mais pas encore rendu : on garde la trace du remboursement, la
    // commande reste « payée » jusqu'à la confirmation de Stripe
    // (refund.updated / charge.refunded).
    if (remboursement.status !== 'succeeded') {
      await db.payment.updateMany({ where: { orderId }, data: { stripeRefundId: remboursement.id } });
      logger.info("Remboursement demandé, en attente de confirmation Stripe", {
        orderId,
        refundId: remboursement.id,
        statut: remboursement.status,
      });
      return remboursement;
    }

    const refundedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { paymentStatus: "REFUNDED" },
      });

      await tx.payment.upsert({
        where: { orderId },
        create: {
          orderId,
          amount: montantAEncaisser(commande),
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

  /**
   * Le client Stripe de l'utilisateur : celui déjà noté sur l'une de ses
   * cartes, sinon un nouveau, marqué de son identifiant.
   */
  async clientStripe(userId: string) {
    const connu = await db.paymentMethod.findFirst({
      where: { userId, stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
    });
    if (connu?.stripeCustomerId) return connu.stripeCustomerId;

    const client = await stripe.customers.create({ metadata: { userId } });
    return client.id;
  },

  /**
   * Prépare l'enregistrement d'une carte : la carte confirmée côté client avec
   * ce SetupIntent est rattachée par Stripe au client de l'appelant, ce qui
   * seul permet ensuite de l'enregistrer.
   */
  async preparerEnregistrementCarte(userId: string) {
    const customer = await this.clientStripe(userId);
    const intention = await stripe.setupIntents.create({
      customer,
      usage: "off_session",
      metadata: { userId },
    });
    return { clientSecret: intention.client_secret };
  },

  /**
   * Enregistre une carte au nom de l'appelant. Un `pm_...` ne prouve rien à
   * lui seul : la carte doit déjà être rattachée chez Stripe à un client créé
   * pour cet utilisateur. Une carte libre ou celle d'un autre répond 404.
   */
  async savePaymentMethod(customerId: string, paymentMethodId: string, storeId: string, isDefault = false) {
    const boutique = await db.store.findUnique({
      where: { id: storeId },
      select: { deletedAt: true },
    });
    if (!boutique || boutique.deletedAt) {
      throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
    }

    const introuvable = () => new ApiError(404, "Méthode de paiement introuvable", "NOT_FOUND");

    let paymentMethod: Stripe.PaymentMethod;
    try {
      paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    } catch {
      throw introuvable();
    }

    const clientId =
      typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;
    if (!clientId) throw introuvable();

    const client = await stripe.customers.retrieve(clientId);
    if (client.deleted || client.metadata?.userId !== customerId) throw introuvable();

    const saved = await db.paymentMethod.create({
      data: {
        storeId,
        userId: customerId,
        type: paymentMethod.type as any,
        name: paymentMethod.card?.brand || "Card",
        stripePaymentMethodId: paymentMethod.id,
        stripeCustomerId: clientId,
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

  /**
   * Retire un moyen de paiement de son propriétaire. Il est d'abord cherché
   * en base au nom de l'appelant : le moyen d'un autre répond 404, comme un
   * inconnu, et seul l'identifiant vérifié part chez Stripe.
   */
  async deletePaymentMethod(paymentMethodId: string, userId: string) {
    const moyen = await db.paymentMethod.findFirst({
      where: { stripePaymentMethodId: paymentMethodId, userId },
      select: { id: true, stripePaymentMethodId: true },
    });

    if (!moyen?.stripePaymentMethodId) {
      throw new ApiError(404, "Méthode de paiement introuvable", "NOT_FOUND");
    }

    await stripe.paymentMethods.detach(moyen.stripePaymentMethodId);
    return db.paymentMethod.delete({ where: { id: moyen.id } });
  },
};
