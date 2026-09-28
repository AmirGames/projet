import Stripe from "stripe";

import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { getEnv } from "../config/env";
import { stripe, STRIPE_CONFIG } from "../config/stripe";
import { emitNotification } from "../config/socket";
import { POURBOIRE_MAXIMUM } from "./delivery-mode.service";

/**
 * Le pourboire laissé **après** la livraison.
 *
 * Le client qui n'a rien laissé en commandant peut, une fois sa commande
 * livrée, remercier son livreur. C'est un paiement à part (Stripe) : il paie
 * ses propres frais, et la carte se ressaisit. Le pourboire payé devient une
 * ligne `DriverTip`, due au livreur jusqu'à ce qu'un relevé la porte
 * (DriverPayoutService), comme une course.
 *
 * La commande se désigne par son identifiant, comme pour son suivi : c'est le
 * lien que reçoit un client sans compte.
 */

/** Combien de temps après la livraison le pourboire reste proposé. */
export const DELAI_POURBOIRE_JOURS = 7;
export const POURBOIRE_MINIMUM = 0.5;

const enCentimes = (montant: number) => Math.round(montant * 100);
const paiementEnLigne = () => getEnv().ENABLE_STRIPE && Boolean(process.env.STRIPE_SECRET_KEY);

type Etat =
  | { possible: true }
  | { possible: false; raison: "DEJA_DONNE" | "PAS_LIVREE" | "PAS_DE_LIVREUR" | "TROP_TARD" | "PAIEMENT_INDISPONIBLE" };

async function lireCommande(orderId: string) {
  const commande = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      deletedAt: true,
      deliveryMode: true,
      tipAmount: true,
      totalAmount: true,
      feesAmount: true,
      serviceFeeAmount: true,
      discountAmount: true,
      customerEmail: true,
      items: { select: { total: true } },
      delivery: {
        select: {
          id: true,
          status: true,
          deliveryTime: true,
          driverId: true,
          driver: { select: { name: true } },
        },
      },
      pourboireApres: true,
    },
  });

  if (!commande || commande.deletedAt) {
    throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
  }
  return commande;
}

type Commande = Awaited<ReturnType<typeof lireCommande>>;

function etat(commande: Commande, maintenant = new Date()): Etat {
  if (Number(commande.tipAmount) > 0 || commande.pourboireApres?.status === "PAID") {
    return { possible: false, raison: "DEJA_DONNE" };
  }
  if (commande.deliveryMode !== "PLATFORM" || !commande.delivery?.driverId) {
    return { possible: false, raison: "PAS_DE_LIVREUR" };
  }
  if (commande.delivery.status !== "DELIVERED") {
    return { possible: false, raison: "PAS_LIVREE" };
  }
  const livreeLe = commande.delivery.deliveryTime;
  if (livreeLe && maintenant.getTime() - livreeLe.getTime() > DELAI_POURBOIRE_JOURS * 86400000) {
    return { possible: false, raison: "TROP_TARD" };
  }
  if (!paiementEnLigne()) {
    return { possible: false, raison: "PAIEMENT_INDISPONIBLE" };
  }
  return { possible: true };
}

/** Le prénom du livreur, pour « Laisser un pourboire à Karim ». */
const prenom = (nom?: string | null) => (nom || "").trim().split(/\s+/)[0] || null;

export class PourboireService {
  /**
   * Ce que la page de suivi doit savoir : le pourboire est-il proposé, sur
   * quel montant d'articles se calculent les pourcentages, et ce qui a déjà
   * été donné.
   */
  static async situation(orderId: string) {
    const commande = await lireCommande(orderId);
    const verdict = etat(commande);
    const articles = commande.items.reduce((somme, ligne) => somme + Number(ligne.total), 0);

    return {
      ...verdict,
      livreur: prenom(commande.delivery?.driver?.name),
      /** La base des pourcentages : les articles, remise déduite. */
      montantArticles: Number(Math.max(0, articles - Number(commande.discountAmount || 0)).toFixed(2)),
      minimum: POURBOIRE_MINIMUM,
      maximum: POURBOIRE_MAXIMUM,
      donne:
        Number(commande.tipAmount) > 0
          ? { montant: Number(commande.tipAmount), quand: "COMMANDE" as const }
          : commande.pourboireApres?.status === "PAID"
            ? { montant: Number(commande.pourboireApres.amount), quand: "APRES_LIVRAISON" as const }
            : null,
    };
  }

  /**
   * L'intention de paiement du pourboire.
   *
   * Une seule ligne par commande : un client qui change d'avis sur le montant
   * reprend la même, avec une nouvelle intention.
   */
  static async creerIntention(orderId: string, montantDemande: number) {
    const commande = await lireCommande(orderId);
    const verdict = etat(commande);

    if (!verdict.possible) {
      const messages: Record<string, string> = {
        DEJA_DONNE: "Un pourboire a déjà été laissé pour cette commande.",
        PAS_LIVREE: "Le pourboire se laisse une fois la commande livrée.",
        PAS_DE_LIVREUR: "Cette commande n'a pas été livrée par un livreur de la plateforme.",
        TROP_TARD: `Le pourboire se laisse dans les ${DELAI_POURBOIRE_JOURS} jours qui suivent la livraison.`,
        PAIEMENT_INDISPONIBLE: "Le paiement en ligne n'est pas disponible.",
      };
      throw new ApiError(409, messages[verdict.raison], `TIP_${verdict.raison}`);
    }

    const montant = Number(Number(montantDemande).toFixed(2));
    if (!Number.isFinite(montant) || montant < POURBOIRE_MINIMUM || montant > POURBOIRE_MAXIMUM) {
      throw new ApiError(
        400,
        `Le pourboire doit être compris entre ${POURBOIRE_MINIMUM.toFixed(2)} et ${POURBOIRE_MAXIMUM} €.`,
        "INVALID_TIP"
      );
    }

    const driverId = commande.delivery!.driverId!;
    const intention = await stripe.paymentIntents.create({
      amount: enCentimes(montant),
      currency: STRIPE_CONFIG.currency,
      receipt_email: commande.customerEmail || undefined,
      description: "Pourboire pour votre livreur",
      // `pourboire` aiguille le webhook : ce n'est pas le paiement de la commande.
      metadata: { orderId: commande.id, pourboire: "1", driverId },
      payment_method_types: ["card"],
    });

    await db.driverTip.upsert({
      where: { orderId: commande.id },
      create: {
        orderId: commande.id,
        driverId,
        amount: montant,
        status: "PENDING",
        stripePaymentIntentId: intention.id,
      },
      update: { amount: montant, status: "PENDING", stripePaymentIntentId: intention.id, driverId },
    });

    return { clientSecret: intention.client_secret, paymentIntentId: intention.id, montant };
  }

  /** Une intention Stripe est-elle celle d'un pourboire. */
  static estUnPourboire(intention: Stripe.PaymentIntent) {
    return intention.metadata?.pourboire === "1";
  }

  /**
   * Le pourboire est encaissé : il devient dû au livreur.
   *
   * Rejouable : le webhook et `/confirm` peuvent arriver tous les deux, et
   * Stripe renvoie parfois un événement deux fois.
   */
  static async marquerPaye(intention: Stripe.PaymentIntent) {
    const pourboire = await db.driverTip.findUnique({
      where: { stripePaymentIntentId: intention.id },
      include: { driver: { select: { email: true } } },
    });
    if (!pourboire) {
      logger.warn("Pourboire encaissé sans ligne correspondante", { paymentIntentId: intention.id });
      return null;
    }

    // Le montant encaissé fait foi, pas celui demandé.
    const montant = (intention.amount_received ?? intention.amount) / 100;
    const { count } = await db.driverTip.updateMany({
      where: { id: pourboire.id, status: { not: "PAID" } },
      data: { status: "PAID", amount: montant, paidAt: new Date() },
    });
    if (count === 0) return pourboire;

    await db.driver.update({
      where: { id: pourboire.driverId },
      data: { totalEarnings: { increment: montant } },
    });

    logger.info("Pourboire après livraison encaissé", { orderId: pourboire.orderId, montant });

    try {
      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: "Vous avez reçu un pourboire 🎉",
          message: `${montant.toFixed(2).replace(".", ",")} € laissés par un client après sa livraison. Ils vous seront versés avec votre prochain relevé.`,
          recipientEmail: pourboire.driver.email,
          link: "/driver/earnings",
          relatedOrderId: pourboire.orderId,
        },
      });
      emitNotification(pourboire.driver.email, notification);
    } catch (err) {
      logger.warn("Pourboire : notification du livreur impossible", { error: (err as Error).message });
    }

    return pourboire;
  }

  static async marquerEchec(intention: Stripe.PaymentIntent) {
    await db.driverTip.updateMany({
      where: { stripePaymentIntentId: intention.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
  }
}
