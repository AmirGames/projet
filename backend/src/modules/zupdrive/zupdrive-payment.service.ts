import type Stripe from "stripe";
import { db } from "../../services/db";
import { stripe, STRIPE_CONFIG } from "../payments/stripe";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { lireCommissionPourcentage, repartirPrixCourse } from "./commission-drive";
import { debutSemaineVersement, finSemaineVersement } from "./semaine-versement";

/**
 * Les paiements ZupDrive : le passager paie Stripe, le chauffeur reçoit un
 * versement hebdomadaire SEPA.
 *
 * Flux:
 * 1. Commande créée (CourseDrive RECHERCHE)
 * 2. Paiement créé (PaymentIntentDrive) : répartition commission / chauffeur figée
 * 3. Le webhook Stripe confirme le paiement (jamais le client) → PaymentIntentDrive SUCCEEDED
 * 4. Course terminée (CourseDrive TERMINEE) ET paiement confirmé → versement chauffeur créé,
 *    dans l'ordre où les deux événements arrivent (creerVersementSiDu, idempotent)
 * 5. Lundi: Batch SEPA hebdomadaire regroupe tous les payouts
 * 6. Virement versé au chauffeur
 *
 * Le webhook est celui de ZupEat (payments/payment.service.ts : signature sur le corps brut,
 * journal StripeEvent idempotent) ; il aiguille ici les intentions qui portent metadata.courseId.
 *
 * La commission plateforme suit PlatformSettingsDrive (20 % par défaut), voir commission-drive.ts :
 * commission = arrondi(prixCentimes × pourcentage / 100), revenu chauffeur = prix - commission
 * (surge pricing inclus dans le prix).
 * Surge pricing s'applique à TOUT: passager paie + cher, chauffeur gagne + cher
 */

/**
 * Statuts de PaymentIntentDrive une fois l'argent encaissé : un événement Stripe en retard
 * (échec, annulation, second « succeeded ») ne les remplace jamais.
 *   SUCCEEDED → REFUND_REQUESTED (remboursement demandé, pas encore rendu) → REFUNDED
 *   REFUND_FAILED : Stripe n'a pas pu rembourser ; reprise par le balayage ou par l'équipe.
 */
const STATUTS_ENCAISSES = ["SUCCEEDED", "REFUND_REQUESTED", "REFUNDED", "REFUND_FAILED"];
/** Statuts d'où un remboursement peut encore partir. */
const STATUTS_A_REMBOURSER = ["SUCCEEDED", "REFUND_REQUESTED", "REFUND_FAILED"];
/** Une course qui n'aboutit pas : le passager qui a payé est remboursé en totalité (aucun frais d'annulation n'existe). */
const COURSES_NON_ABOUTIES = ["ANNULEE", "SANS_CHAUFFEUR"];

export class ZupDrivePaymentService {
  /**
   * Crée un PaymentIntent Stripe et enregistre la transaction ZupDrive.
   * Appelé après commander() mais avant le paiement réel.
   */
  static async createPaymentIntent(
    courseId: string,
    passagerId: string | null,
    amountCentimes: number
  ) {
    const course = await db.courseDrive.findUniqueOrThrow({
      where: { id: courseId },
    });

    // Une course n'a qu'un paiement. Rejouer la demande (app relancée, double clic) rend le même
    // paiement non réglé au lieu d'une erreur : le client retrouve son clientSecret.
    const existing = await db.paymentIntentDrive.findUnique({ where: { courseId } });
    if (existing) return this.paiementExistant(existing, amountCentimes);

    // Répartition figée à la création du paiement avec le pourcentage en vigueur
    // (PlatformSettingsDrive) : un changement ultérieur ne touche pas ce paiement.
    // Note: Le surge pricing est déjà inclus dans amountCentimes
    const { commissionCentimes: platformCommissionCentimes, chauffeurCentimes: driverEarningsCentimes } =
      repartirPrixCourse(amountCentimes, await lireCommissionPourcentage());

    // Créer le PaymentIntent Stripe
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCentimes,
        currency: STRIPE_CONFIG.currency,
        description: `Course ZupDrive: ${course.departAdresse} → ${course.arriveeAdresse}`,
        metadata: {
          courseId,
          passagerId: passagerId || "anonymous",
        },
      },
      // Deux demandes simultanées pour la même course obtiennent la même intention Stripe.
      { idempotencyKey: `zupdrive-course-${courseId}` }
    );

    // Enregistrer en base (statuts en majuscules, comme le schéma les documente)
    let payment;
    try {
      payment = await db.paymentIntentDrive.create({
        data: {
          courseId,
          passagerId,
          stripeId: paymentIntent.id,
          amountCentimes,
          currency: "EUR",
          status: paymentIntent.status.toUpperCase(),
          platformCommissionCentimes,
          driverEarningsCentimes,
        },
      });
    } catch (err) {
      // Une demande simultanée l'a enregistré entre-temps : courseId est unique.
      if ((err as { code?: string }).code !== "P2002") throw err;
      const concurrent = await db.paymentIntentDrive.findUniqueOrThrow({ where: { courseId } });
      return this.paiementExistant(concurrent, amountCentimes);
    }

    logger.info("ZupDrive payment intent created", {
      courseId,
      paymentId: payment.id,
      stripeId: paymentIntent.id,
      amount: amountCentimes,
    });

    return {
      paymentId: payment.id,
      clientSecret: paymentIntent.client_secret,
      amount: amountCentimes,
      currency: STRIPE_CONFIG.currency,
    };
  }

  /** Le paiement déjà créé de cette course, à rendre au client tant qu'il n'est pas réglé ni annulé. */
  private static async paiementExistant(
    existing: { id: string; stripeId: string; status: string; amountCentimes: number },
    amountCentimes: number
  ) {
    if (existing.status !== "SUCCEEDED" && existing.amountCentimes === amountCentimes) {
      const ouverte = await stripe.paymentIntents.retrieve(existing.stripeId);
      if (ouverte.status !== "canceled" && ouverte.amount === amountCentimes) {
        return {
          paymentId: existing.id,
          clientSecret: ouverte.client_secret,
          amount: amountCentimes,
          currency: STRIPE_CONFIG.currency,
        };
      }
    }
    throw new ApiError(409, "Ce trajet a déjà un paiement en cours", "PAYMENT_ALREADY_EXISTS");
  }

  /** Cette intention Stripe est-elle celle d'une course ZupDrive (et non d'une commande ZupEat ou d'un pourboire) ? */
  static estUnPaiementDrive(intention: Stripe.PaymentIntent): boolean {
    return typeof intention.metadata?.courseId === "string" && !intention.metadata?.orderId;
  }

  /** Le paiement ZupDrive enregistré pour cette intention, en vérifiant que la métadonnée dit la même chose que la base. */
  private static async paiementDeLIntention(intention: Stripe.PaymentIntent) {
    const payment = await db.paymentIntentDrive.findUnique({
      where: { stripeId: intention.id },
      include: { course: { select: { statut: true } } },
    });
    if (!payment) {
      logger.warn("ZupDrive payment intent not found in DB", { stripeId: intention.id });
      return null;
    }
    if (intention.metadata?.courseId !== payment.courseId) {
      throw new ApiError(409, "Paiement associé à une autre course.", "PAYMENT_COURSE_MISMATCH");
    }
    return payment;
  }

  /**
   * Webhook Stripe : payment_intent.succeeded d'une course ZupDrive.
   *
   * Rejouable (Stripe renvoie les événements) et sans condition sur la course : un passager peut
   * payer avant qu'un chauffeur accepte. Le paiement passe à SUCCEEDED après contrôle de l'état,
   * de la devise et du montant (celui de la base, jamais celui du client) ; le versement du
   * chauffeur n'est créé que si la course est terminée (creerVersementSiDu).
   */
  static async marquerPaye(intention: Stripe.PaymentIntent) {
    const payment = await this.paiementDeLIntention(intention);
    if (!payment) return null;

    const recu = intention.amount_received ?? intention.amount;
    if (intention.status !== "succeeded" || intention.currency !== STRIPE_CONFIG.currency) {
      throw new ApiError(409, "État ou devise du paiement incorrect.", "PAYMENT_INVALID");
    }
    if (recu !== payment.amountCentimes) {
      logger.error("ZupDrive amount received differs from the ride payment", {
        courseId: payment.courseId,
        paymentIntentId: intention.id,
        recu,
        attendu: payment.amountCentimes,
      });
      throw new ApiError(409, "Montant encaissé incorrect.", "PAYMENT_AMOUNT_MISMATCH");
    }

    // Un second événement ne réécrit pas la date de confirmation.
    await db.paymentIntentDrive.updateMany({
      where: { id: payment.id, status: { notIn: STATUTS_ENCAISSES } },
      data: { status: "SUCCEEDED", confirmedAt: new Date() },
    });

    // Payé après l'annulation de la course (ou après la fin de la recherche) : l'argent repart aussitôt.
    if (COURSES_NON_ABOUTIES.includes(payment.course.statut)) {
      await this.rembourserCourse(payment.courseId, "Paiement reçu après l'annulation de la course").catch((err) =>
        logger.warn("ZupDrive refund after late payment failed", { courseId: payment.courseId, err })
      );
      return null;
    }

    return this.creerVersementSiDu(payment.id);
  }

  /** payment_intent.payment_failed : l'échec ne défait jamais un paiement déjà réglé (événement en retard). */
  static async marquerEchec(intention: Stripe.PaymentIntent) {
    const payment = await this.paiementDeLIntention(intention);
    if (!payment) return;
    await db.paymentIntentDrive.updateMany({
      where: { id: payment.id, status: { notIn: STATUTS_ENCAISSES } },
      data: { status: intention.status.toUpperCase() },
    });
  }

  /** payment_intent.canceled : même règle, un paiement réglé ne repasse pas à annulé. */
  static async marquerAnnule(intention: Stripe.PaymentIntent) {
    const payment = await this.paiementDeLIntention(intention);
    if (!payment) return;
    await db.paymentIntentDrive.updateMany({
      where: { id: payment.id, status: { notIn: STATUTS_ENCAISSES } },
      data: { status: "CANCELED", cancellationReason: intention.cancellation_reason ?? null },
    });
  }

  /**
   * Rembourse en totalité le passager d'une course payée qui n'a pas abouti (annulée, sans chauffeur).
   *
   * Rejouable : les remboursements existants sont relus chez Stripe et un remboursement déjà demandé ou
   * réussi est repris, pas doublé ; une nouvelle demande n'a lieu qu'après un échec, avec une autre clé
   * d'idempotence. L'état en base suit ce que Stripe a réellement rendu (synchroniserRemboursement) ;
   * le webhook (charge.refunded, refund.updated) le confirme. Refuse (409) une course terminée ou dont le
   * chauffeur a déjà un versement : la corriger demande une opération corrective, pas un remboursement.
   * Renvoie null s'il n'y a rien à rendre (course non payée, ou déjà remboursée).
   */
  static async rembourserCourse(courseId: string, raison: string) {
    const payment = await db.paymentIntentDrive.findUnique({
      where: { courseId },
      include: { course: { select: { statut: true } }, payout: { select: { id: true } } },
    });
    if (!payment || !STATUTS_A_REMBOURSER.includes(payment.status)) return null;

    if (!COURSES_NON_ABOUTIES.includes(payment.course.statut) || payment.payout) {
      throw new ApiError(409, "Cette course n'est pas remboursable", "COURSE_NOT_REFUNDABLE");
    }

    const existants = (await stripe.refunds.list({ payment_intent: payment.stripeId, limit: 10 })).data;
    const actif = existants.find((r: Stripe.Refund) => ["pending", "requires_action", "succeeded"].includes(r.status ?? ""));
    if (!actif) {
      await stripe.refunds.create(
        {
          payment_intent: payment.stripeId,
          reason: "requested_by_customer",
          metadata: { courseId, raison: raison.slice(0, 500) },
        },
        { idempotencyKey: `zupdrive-refund-${payment.id}-${existants.length}` }
      );
    }

    const etat = await this.synchroniserRemboursement(payment.id);
    if (etat === "REFUND_FAILED") {
      throw new ApiError(502, "Stripe n'a pas effectué le remboursement.", "REFUND_FAILED");
    }
    logger.info("ZupDrive ride refunded", { courseId, paymentId: payment.id, etat });
    return etat;
  }

  /**
   * Ramène PaymentIntentDrive à ce que Stripe a réellement rendu : REFUNDED quand tout le montant est
   * rendu, REFUND_REQUESTED tant qu'un remboursement est en attente, REFUND_FAILED après un échec sans
   * autre demande en cours. Un remboursement partiel fait depuis le tableau de bord ne change rien.
   */
  static async synchroniserRemboursement(paymentId: string): Promise<string | null> {
    const payment = await db.paymentIntentDrive.findUnique({ where: { id: paymentId } });
    if (!payment) return null;

    const remboursements = (await stripe.refunds.list({ payment_intent: payment.stripeId, limit: 100 })).data;
    const rendu = remboursements
      .filter((r: Stripe.Refund) => r.status === "succeeded")
      .reduce((somme: number, r: Stripe.Refund) => somme + r.amount, 0);
    const enAttente = remboursements.some((r: Stripe.Refund) => ["pending", "requires_action"].includes(r.status ?? ""));
    const echoue = remboursements.some((r: Stripe.Refund) => ["failed", "canceled"].includes(r.status ?? ""));

    let status: string | null = null;
    if (rendu >= payment.amountCentimes) status = "REFUNDED";
    else if (enAttente) status = "REFUND_REQUESTED";
    else if (echoue) status = "REFUND_FAILED";
    if (!status) return payment.status;

    await db.paymentIntentDrive.updateMany({
      where: { id: payment.id, status: { in: STATUTS_A_REMBOURSER } },
      data: { status },
    });
    return status;
  }

  /**
   * Webhook Stripe : un remboursement a changé d'état (charge.refunded, refund.updated, refund.failed).
   * Renvoie false si l'intention n'est pas celle d'une course ZupDrive (le webhook ZupEat s'en charge).
   */
  static async surRemboursement(paymentIntentId: string): Promise<boolean> {
    const payment = await db.paymentIntentDrive.findUnique({ where: { stripeId: paymentIntentId }, select: { id: true } });
    if (!payment) return false;
    await this.synchroniserRemboursement(payment.id);
    return true;
  }

  /**
   * Filet de sécurité du balayage : les courses payées qui n'ont pas abouti et dont le remboursement n'est
   * pas parti (arrêt entre l'annulation et l'appel à Stripe, échec de Stripe, paiement arrivé après coup).
   */
  static async rembourserLesCoursesNonAboutiesPayees(limite = 20): Promise<number> {
    const paiements = await db.paymentIntentDrive.findMany({
      where: { status: { in: ["SUCCEEDED", "REFUND_FAILED"] }, course: { statut: { in: COURSES_NON_ABOUTIES } }, payout: null },
      select: { courseId: true },
      take: limite,
    });
    let rembourses = 0;
    for (const { courseId } of paiements) {
      try {
        if (await this.rembourserCourse(courseId, "Course non aboutie")) rembourses++;
      } catch (err) {
        logger.warn("ZupDrive refund retry failed", { courseId, err });
      }
    }
    return rembourses;
  }

  /**
   * Crée le versement du chauffeur quand les deux conditions sont réunies : paiement confirmé par
   * Stripe ET course terminée avec un chauffeur. Appelé par le webhook (paiement après la course)
   * et à la fin de la course (paiement d'avance) : dans les deux ordres, un seul versement, car
   * paymentId est unique et l'upsert ne réécrit rien. Montant = revenu chauffeur figé sur le paiement.
   */
  static async creerVersementSiDu(paymentId: string) {
    const payment = await db.paymentIntentDrive.findUnique({
      where: { id: paymentId },
      include: { course: { select: { chauffeurId: true, statut: true } } },
    });
    if (!payment || payment.status !== "SUCCEEDED") return null;
    if (payment.course.statut !== "TERMINEE" || !payment.course.chauffeurId) return null;

    const periodStart = debutSemaineVersement();
    const periodEnd = finSemaineVersement(periodStart);
    const payout = await db.driverPayoutDrive.upsert({
      where: { paymentId: payment.id },
      update: {},
      create: {
        paymentId: payment.id,
        chauffeurId: payment.course.chauffeurId,
        amountCentimes: payment.driverEarningsCentimes,
        currency: "EUR",
        status: "PENDING",
        periodStart,
        periodEnd,
        ibanSnapshot: await this.getChauffeurIban(),
      },
    });

    logger.info("ZupDrive payout ensured", {
      paymentId: payment.id,
      payoutId: payout.id,
      chauffeurId: payment.course.chauffeurId,
      amount: payment.driverEarningsCentimes,
    });
    return payout;
  }

  /** La course vient de se terminer : si elle est déjà payée, le versement du chauffeur devient dû. */
  static async courseTerminee(courseId: string) {
    const payment = await db.paymentIntentDrive.findUnique({ where: { courseId }, select: { id: true } });
    return payment ? this.creerVersementSiDu(payment.id) : null;
  }

  /**
   * Crée ou met à jour un lot SEPA hebdomadaire.
   * Appelé une fois par semaine (lundi 9h00) pour regrouper tous les payouts.
   */
  static async createWeeklyBatch(periodStart?: Date) {
    // Toujours le lundi 00:00 UTC de la semaine demandée, même si l'appelant passe un instant quelconque.
    const batchStart = debutSemaineVersement(periodStart);
    const batchEnd = finSemaineVersement(batchStart);

    // Les payouts PENDING de cette semaine pas encore rattachés à un lot (rejouer l'appel n'en reprend aucun).
    const payouts = await db.driverPayoutDrive.findMany({
      where: {
        status: "PENDING",
        batchId: null,
        periodStart: { gte: batchStart, lt: batchEnd },
      },
    });

    if (payouts.length === 0) {
      logger.info("ZupDrive no payouts for batch", { periodStart: batchStart });
      return null;
    }

    // Vérifier s'il existe déjà un batch
    let batch = await db.driverPayoutBatchDrive.findFirst({
      where: {
        periodStart: batchStart,
        periodEnd: batchEnd,
      },
    });

    // Un lot déjà soumis à Stripe ne reçoit plus de versement.
    if (batch && batch.status !== "PENDING") {
      throw new ApiError(409, "Le lot de cette période a déjà été soumis", "BATCH_ALREADY_SUBMITTED");
    }

    const totalAmount = payouts.reduce((sum, p) => sum + p.amountCentimes, 0);

    if (!batch) {
      batch = await db.driverPayoutBatchDrive.create({
        data: {
          periodStart: batchStart,
          periodEnd: batchEnd,
          totalAmountCentimes: totalAmount,
          currency: "EUR",
          payoutCount: payouts.length,
        },
      });
    }

    // Associer les payouts au batch
    await db.driverPayoutDrive.updateMany({
      where: { id: { in: payouts.map((p) => p.id) }, batchId: null },
      data: { batchId: batch.id },
    });

    // Lot déjà existant : le total et le nombre suivent les versements réellement rattachés.
    const rattaches = await db.driverPayoutDrive.aggregate({
      where: { batchId: batch.id },
      _sum: { amountCentimes: true },
      _count: true,
    });
    batch = await db.driverPayoutBatchDrive.update({
      where: { id: batch.id },
      data: { totalAmountCentimes: rattaches._sum.amountCentimes ?? 0, payoutCount: rattaches._count },
    });

    logger.info("ZupDrive batch created", {
      batchId: batch.id,
      payoutCount: payouts.length,
      totalAmount,
      period: { start: batchStart, end: batchEnd },
    });

    return batch;
  }

  /**
   * Traite un lot SEPA en créant le transfer Stripe (Payout).
   * Stripe débite le compte de la plateforme et crédite les IBANs des chauffeurs.
   */
  static async submitBatchToStripe(batchId: string) {
    const batch = await db.driverPayoutBatchDrive.findUniqueOrThrow({
      where: { id: batchId },
      include: { payouts: true },
    });

    if (batch.status !== "PENDING") {
      throw new ApiError(409, "Ce lot n'est pas en attente", "BATCH_NOT_PENDING");
    }

    if (!batch.payouts.length) {
      throw new ApiError(400, "Ce lot n'a pas de versements", "BATCH_EMPTY");
    }

    // Créer le transfer Stripe (Payout)
    const payout = await stripe.payouts.create({
      amount: batch.totalAmountCentimes,
      currency: STRIPE_CONFIG.currency,
      description: `ZupDrive driver payouts week ${batch.periodStart.toISOString().split("T")[0]}`,
      method: "standard", // SEPA
    });

    // Mettre à jour le batch
    await db.driverPayoutBatchDrive.update({
      where: { id: batchId },
      data: {
        status: "SUBMITTED",
        stripeTransferId: payout.id,
        submittedAt: new Date(),
      },
    });

    logger.info("ZupDrive batch submitted to Stripe", {
      batchId,
      stripePayoutId: payout.id,
      amount: batch.totalAmountCentimes,
    });

    return payout;
  }

  /**
   * Webhook Stripe: Payout succeeded.
   * Marque le batch et tous ses payouts comme traités.
   */
  static async handlePayoutSucceeded(stripePayoutId: string) {
    const batch = await db.driverPayoutBatchDrive.findFirst({
      where: { stripeTransferId: stripePayoutId },
    });

    if (!batch) {
      logger.warn("ZupDrive batch not found for payout", { stripePayoutId });
      return null;
    }

    const now = new Date();

    // Mettre à jour le batch
    await db.driverPayoutBatchDrive.update({
      where: { id: batch.id },
      data: {
        status: "SUCCEEDED",
        processedAt: now,
      },
    });

    // Mettre à jour tous les payouts
    await db.driverPayoutDrive.updateMany({
      where: { batchId: batch.id },
      data: {
        status: "PROCESSED",
        processedAt: now,
      },
    });

    logger.info("ZupDrive batch processed", {
      batchId: batch.id,
      stripePayoutId,
    });

    return batch;
  }

  /**
   * Rapporte les revenus d'un chauffeur (période actuelle et historique).
   */
  static async getDriverEarnings(driverId: string, monthsBack: number = 3) {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsBack);

    const [payouts, totalEarned] = await Promise.all([
      db.driverPayoutDrive.findMany({
        where: {
          chauffeurId: driverId,
          createdAt: { gte: since },
        },
        include: { batch: true },
        orderBy: { periodStart: "desc" },
      }),
      db.driverPayoutDrive.aggregate({
        where: { chauffeurId: driverId },
        _sum: { amountCentimes: true },
      }),
    ]);

    const pendingAmount = await db.driverPayoutDrive.aggregate({
      where: { chauffeurId: driverId, status: "PENDING" },
      _sum: { amountCentimes: true },
    });

    return {
      totalEarningsCentimes: totalEarned._sum.amountCentimes || 0,
      pendingCentimes: pendingAmount._sum.amountCentimes || 0,
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: p.amountCentimes,
        status: p.status,
        period: { start: p.periodStart, end: p.periodEnd },
        batch: p.batch
          ? {
              id: p.batch.id,
              status: p.batch.status,
              submittedAt: p.batch.submittedAt,
              processedAt: p.batch.processedAt,
            }
          : null,
      })),
    };
  }

  // Utilitaires

  private static async getChauffeurIban(): Promise<string | null> {
    // TODO: Récupérer l'IBAN depuis le User ou une table de bankAccounts
    return null;
  }
}
