import { db } from "../../services/db";
import { stripe, STRIPE_CONFIG } from "../payments/stripe";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";

/**
 * Les paiements ZupDrive : le passager paie Stripe, le chauffeur reçoit un
 * versement hebdomadaire SEPA.
 *
 * Flux:
 * 1. Commande créée (CourseDrive RECHERCHE)
 * 2. Paiement créé (PaymentIntentDrive)
 * 3. Chauffeur accepte (CourseDrive ACCEPTEE) → Revenus figés
 * 4. Course terminée (CourseDrive TERMINEE) → Webhook Stripe confirme paiement
 * 5. Lundi: Batch SEPA hebdomadaire regroupe tous les payouts
 * 6. Virement versé au chauffeur
 *
 * La commission plateforme = prixCentimes × 20%
 * Le revenu chauffeur = prixCentimes × 80% (après surge pricing)
 * Surge pricing s'applique à TOUT: passager paie + cher, chauffeur gagne + cher
 */

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

    // Vérifier qu'une course n'a pas déjà un paiement
    const existing = await db.paymentIntentDrive.findUnique({
      where: { courseId },
    });
    if (existing) {
      throw new ApiError(409, "Ce trajet a déjà un paiement en cours", "PAYMENT_ALREADY_EXISTS");
    }

    // Calculer la commission plateforme (20%) et le revenu chauffeur (80%)
    // Note: Le surge pricing est déjà inclus dans amountCentimes
    const platformCommissionCentimes = Math.round(amountCentimes * 0.2);
    const driverEarningsCentimes = amountCentimes - platformCommissionCentimes;

    // Créer le PaymentIntent Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCentimes,
      currency: STRIPE_CONFIG.currency,
      description: `Course ZupDrive: ${course.departAdresse} → ${course.arriveeAdresse}`,
      metadata: {
        courseId,
        passagerId: passagerId || "anonymous",
      },
    });

    // Enregistrer en base
    const payment = await db.paymentIntentDrive.create({
      data: {
        courseId,
        passagerId,
        stripeId: paymentIntent.id,
        amountCentimes,
        currency: "EUR",
        status: paymentIntent.status,
        platformCommissionCentimes,
        driverEarningsCentimes,
      },
    });

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

  /**
   * Webhook Stripe: Payment succeeded.
   * Appelé par Stripe quand le paiement est confirmé → crée le payout au chauffeur.
   */
  static async handlePaymentSucceeded(stripePaymentIntentId: string) {
    const payment = await db.paymentIntentDrive.findUnique({
      where: { stripeId: stripePaymentIntentId },
      include: { course: { include: { chauffeur: true } } },
    });

    if (!payment) {
      logger.warn("ZupDrive payment intent not found in DB", { stripeId: stripePaymentIntentId });
      return null;
    }

    // Vérifier que la course a un chauffeur (acceptée)
    if (!payment.course.chauffeurId) {
      logger.warn("ZupDrive course has no driver", { courseId: payment.courseId });
      throw new ApiError(409, "Cette course n'a pas de chauffeur", "NO_DRIVER");
    }

    // Mettre à jour le paiement
    await db.paymentIntentDrive.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        confirmedAt: new Date(),
      },
    });

    // Créer le payout pour le chauffeur (période courante)
    const now = new Date();
    const periodStart = this.getCurrentWeekStart(now);
    const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const payout = await db.driverPayoutDrive.create({
      data: {
        paymentId: payment.id,
        chauffeurId: payment.course.chauffeurId,
        amountCentimes: payment.driverEarningsCentimes,
        currency: "EUR",
        status: "PENDING",
        periodStart,
        periodEnd,
        ibanSnapshot: payment.course.chauffeur ? await this.getChauffeurIban(payment.course.chauffeur.id) : null,
      },
    });

    logger.info("ZupDrive payout created", {
      paymentId: payment.id,
      payoutId: payout.id,
      chauffeurId: payment.course.chauffeurId,
      amount: payment.driverEarningsCentimes,
    });

    return payout;
  }

  /**
   * Crée ou met à jour un lot SEPA hebdomadaire.
   * Appelé une fois par semaine (lundi 9h00) pour regrouper tous les payouts.
   */
  static async createWeeklyBatch(periodStart?: Date) {
    const batchStart = periodStart || this.getCurrentWeekStart();
    const batchEnd = new Date(batchStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Trouver tous les payouts PENDING de cette période
    const payouts = await db.driverPayoutDrive.findMany({
      where: {
        status: "PENDING",
        periodStart: batchStart,
        periodEnd: batchEnd,
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
      where: { id: { in: payouts.map((p) => p.id) } },
      data: { batchId: batch.id },
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
    } as any);

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

  private static getCurrentWeekStart(date: Date = new Date()): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  }

  private static async getChauffeurIban(_driverId: string): Promise<string | null> {
    // TODO: Récupérer l'IBAN depuis le User ou une table de bankAccounts
    return null;
  }
}
