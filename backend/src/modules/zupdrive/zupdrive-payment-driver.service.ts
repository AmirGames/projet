/**
 * ZupDrive Driver Payment & Payout Service
 *
 * Gestion des paiements et des reversements:
 * - Calcul des revenus par course
 * - Commissions de plateforme
 * - Suivi des revenus (jour/semaine/mois)
 * - Paiements hebdomadaires
 * - Relevés financiers
 * - Historique des transactions
 *
 * Modèle: Chauffeur accepte course
 *         → Passager paie via Stripe
 *         → Revenus accumulés pour le chauffeur
 *         → Paiement hebdomadaire (lundi)
 *         → Virement bancaire SEPA
 */

import { db } from "../../services/db";
import { ApiError } from "../../middleware/api-error";
import { ZupDrivePaymentService } from "./zupdrive-payment.service";
import { debutSemaineVersement, finSemaineVersement } from "./semaine-versement";
import {
  COMMISSION_PAR_DEFAUT_POURCENT,
  lireCommissionPourcentage,
  repartirPrixCourse,
  type RepartitionPrixCourse,
} from "./commission-drive";

type PaymentStatus =
  | "PENDING"       // En attente de paiement passager
  | "COMPLETED"     // Paiement reçu
  | "DISPUTED"      // Litige en cours
  | "REFUNDED";     // Remboursé

/** Statuts réels de DriverPayoutDrive (voir prisma/schema.prisma). */
type PayoutStatus = "PENDING" | "PROCESSED" | "FAILED" | "CANCELLED";

// La règle de commission vit dans commission-drive.ts (partagée avec le paiement) ;
// ré-exportée ici pour les appelants existants.
export { COMMISSION_PAR_DEFAUT_POURCENT, repartirPrixCourse, lireCommissionPourcentage };
export type { RepartitionPrixCourse };

export interface CourseEarnings {
  courseId: string;
  chauffeurId: string;
  passengerPrice: number; // Prix payé par passager (centimes)
  platformCommission: number; // Commission ZupDrive (centimes)
  chauffeurEarnings: number; // Revenu net chauffeur (centimes)
  distance: number; // km
  duration: number; // minutes
  tips: number; // Pourboire (centimes) : non géré par le schéma, toujours 0
  status: PaymentStatus;
}

export interface DriverEarnings {
  chauffeurId: string;
  period: "today" | "week" | "month"; // Depuis quand?
  totalEarnings: number; // Total revenus chauffeur (centimes)
  totalCommission: number; // Total commissions ZupDrive
  totalPassengerSpent: number; // Total dépensé passagers
  coursesCompleted: number;
  averagePerCourse: number;
  tips: number; // Total pourboires
  breakdown: {
    baseFares: number;
    surgeBonus: number;
    tips: number;
    bonuses: number; // Incentives
  };
}

export interface DriverPayout {
  id: string;
  chauffeurId: string;
  amount: number; // Montant à verser (centimes)
  status: PayoutStatus;
  period: {
    startDate: Date;
    endDate: Date;
  };
  batchId?: string | null;
}

export interface PayoutPreparation {
  chauffeurId: string;
  payoutsCreated: number; // Un versement par paiement de course (paymentId unique)
  amount: number; // Total des versements créés (centimes)
  status: PayoutStatus;
  period: {
    startDate: Date;
    endDate: Date;
  };
}

/** Lundi 00:00 (heure locale) de la semaine de `date` : période d'affichage des revenus, pas des lots de versement. */
function debutSemaine(date: Date): Date {
  const decalage = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - decalage);
}

/**
 * Pricing Model:
 * Commission = round(Prix × commissionPercentage / 100)
 * Driver Earnings = Prix - Commission
 */

export const ZupDrivePaymentDriverService = {
  /**
   * Calculer les revenus d'une course (prix lu en base, jamais fourni par le client)
   */
  async calculateCourseEarnings(data: {
    courseId: string;
    chauffeurId: string;
  }): Promise<CourseEarnings> {
    const course = await db.courseDrive.findUnique({
      where: { id: data.courseId },
      select: { statut: true, chauffeurId: true, prixCentimes: true, distanceMetres: true, dureeSecondes: true },
    });

    // Chacun chez soi : une course d'un autre chauffeur est indiscernable d'une course absente.
    if (!course || course.chauffeurId !== data.chauffeurId) {
      throw new ApiError(404, "Course non trouvée");
    }

    if (course.statut !== "TERMINEE") {
      throw new ApiError(400, "Seules les courses complétées génèrent des revenus");
    }

    const { commissionCentimes, chauffeurCentimes } = repartirPrixCourse(
      course.prixCentimes,
      await lireCommissionPourcentage()
    );

    return {
      courseId: data.courseId,
      chauffeurId: data.chauffeurId,
      passengerPrice: course.prixCentimes,
      platformCommission: commissionCentimes,
      chauffeurEarnings: chauffeurCentimes,
      distance: course.distanceMetres / 1000,
      duration: course.dureeSecondes / 60,
      tips: 0,
      status: "COMPLETED",
    };
  },

  /**
   * Obtenir les revenus du chauffeur pour une période
   */
  async getDriverEarnings(
    chauffeurId: string,
    period: "today" | "week" | "month" = "week"
  ): Promise<DriverEarnings> {
    const now = new Date();
    let startDate: Date;

    if (period === "today") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      startDate = debutSemaine(now);
    } else {
      // Premier jour du mois
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const courses = await db.courseDrive.findMany({
      where: {
        chauffeurId,
        statut: "TERMINEE",
        termineeLe: { gte: startDate, lte: now },
      },
      select: {
        id: true,
        prixCentimes: true,
      },
    });

    if (courses.length === 0) {
      return {
        chauffeurId,
        period,
        totalEarnings: 0,
        totalCommission: 0,
        totalPassengerSpent: 0,
        coursesCompleted: 0,
        averagePerCourse: 0,
        tips: 0,
        breakdown: {
          baseFares: 0,
          surgeBonus: 0,
          tips: 0,
          bonuses: 0,
        },
      };
    }

    const commissionPourcent = await lireCommissionPourcentage();

    let totalPassengerSpent = 0;
    let totalCommission = 0;
    let totalEarnings = 0;

    for (const course of courses) {
      const { commissionCentimes, chauffeurCentimes } = repartirPrixCourse(course.prixCentimes, commissionPourcent);
      totalPassengerSpent += course.prixCentimes;
      totalCommission += commissionCentimes;
      totalEarnings += chauffeurCentimes;
    }

    return {
      chauffeurId,
      period,
      totalEarnings,
      totalCommission,
      totalPassengerSpent,
      coursesCompleted: courses.length,
      averagePerCourse: Math.round(totalEarnings / courses.length),
      tips: 0,
      breakdown: {
        baseFares: totalPassengerSpent,
        surgeBonus: 0, // Le multiplicateur de surge n'est pas conservé sur CourseDrive
        tips: 0,
        bonuses: 0, // Incentive programs
      },
    };
  },

  /**
   * Préparer les versements d'un chauffeur : un DriverPayoutDrive par paiement de course
   * confirmé (SUCCEEDED) qui n'en a pas encore. Idempotent : paymentId est unique et la
   * création ignore les doublons, un second appel ne crée rien. Montant = revenu chauffeur
   * figé sur le PaymentIntentDrive (driverEarningsCentimes), comme le webhook Stripe.
   */
  async preparePayout(chauffeurId: string): Promise<PayoutPreparation> {
    // Même semaine que celle du webhook de paiement : c'est ce qui range les versements dans le même lot.
    const periodStart = debutSemaineVersement(new Date());
    const periodEnd = finSemaineVersement(periodStart);

    const paiements = await db.paymentIntentDrive.findMany({
      where: {
        status: "SUCCEEDED",
        payout: null,
        // Une course annulée après paiement ne donne pas lieu à versement.
        course: { chauffeurId, statut: "TERMINEE" },
      },
      select: { id: true, driverEarningsCentimes: true, currency: true },
    });

    if (paiements.length === 0) {
      throw new ApiError(400, "Aucun revenu à verser");
    }

    const { count } = await db.driverPayoutDrive.createMany({
      data: paiements.map((p) => ({
        paymentId: p.id,
        chauffeurId,
        amountCentimes: p.driverEarningsCentimes,
        currency: p.currency,
        status: "PENDING",
        periodStart,
        periodEnd,
      })),
      skipDuplicates: true,
    });

    return {
      chauffeurId,
      payoutsCreated: count,
      amount: paiements.reduce((somme, p) => somme + p.driverEarningsCentimes, 0),
      status: "PENDING",
      period: { startDate: periodStart, endDate: periodEnd },
    };
  },

  /**
   * Traiter un payout : le rattacher au lot SEPA hebdomadaire de sa période.
   * Le virement lui-même part avec le lot (ZupDrivePaymentService.submitBatchToStripe) ;
   * aucune simulation de virement.
   */
  async processPayout(payoutId: string): Promise<DriverPayout> {
    const payout = await db.driverPayoutDrive.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        chauffeurId: true,
        amountCentimes: true,
        status: true,
        batchId: true,
        periodStart: true,
        periodEnd: true,
      },
    });

    if (!payout) {
      throw new ApiError(404, "Payout non trouvé");
    }

    if (payout.status !== "PENDING") {
      throw new ApiError(400, `Payout déjà ${payout.status}`);
    }

    if (payout.batchId) {
      throw new ApiError(409, "Payout déjà rattaché à un lot");
    }

    // Un lot déjà soumis à Stripe ne reçoit plus de versement.
    const lotFerme = await db.driverPayoutBatchDrive.findFirst({
      where: { periodStart: payout.periodStart, periodEnd: payout.periodEnd, status: { not: "PENDING" } },
      select: { id: true },
    });
    if (lotFerme) {
      throw new ApiError(409, "Le lot de cette période a déjà été soumis");
    }

    const lot = await ZupDrivePaymentService.createWeeklyBatch(payout.periodStart);

    return {
      id: payout.id,
      chauffeurId: payout.chauffeurId,
      amount: payout.amountCentimes,
      status: "PENDING",
      period: { startDate: payout.periodStart, endDate: payout.periodEnd },
      batchId: lot?.id ?? null,
    };
  },

  /**
   * Obtenir l'historique des payouts
   */
  async getPayoutHistory(chauffeurId: string, limit: number = 10) {
    return db.driverPayoutDrive.findMany({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amountCentimes: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        processedAt: true,
      },
    });
  },

  /**
   * Obtenir l'historique des transactions d'une course
   */
  async getCoursePaymentHistory(courseId: string) {
    return db.paymentIntentDrive.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Statut d'un payout du chauffeur (jamais celui d'un autre).
   */
  async getPayoutStatus(payoutId: string, chauffeurId: string) {
    const payout = await db.driverPayoutDrive.findFirst({
      where: { id: payoutId, chauffeurId },
      select: {
        id: true,
        amountCentimes: true,
        status: true,
        processedAt: true,
        failureReason: true,
      },
    });

    if (!payout) {
      throw new ApiError(404, "Payout non trouvé");
    }

    return {
      id: payout.id,
      amount: payout.amountCentimes,
      status: payout.status,
      completedAt: payout.processedAt,
      failureReason: payout.failureReason,
    };
  },

  /**
   * Dashboard financier du chauffeur
   */
  async getFinancialDashboard(chauffeurId: string) {
    const [today, week, month, payoutHistory] = await Promise.all([
      this.getDriverEarnings(chauffeurId, "today"),
      this.getDriverEarnings(chauffeurId, "week"),
      this.getDriverEarnings(chauffeurId, "month"),
      this.getPayoutHistory(chauffeurId, 5),
    ]);

    return {
      earnings: {
        today,
        week,
        month,
      },
      payoutHistory,
      nextPayoutDate: this.getNextPayoutDate(),
    };
  },

  /**
   * Prochaine date de payout (lundi)
   */
  getNextPayoutDate(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? 1 : 8); // Prochain lundi
    return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
  },
};

/**
 * PAYOUT CYCLE EXPLIQUÉ
 *
 * Lundi:
 * ├─ Cycle fermeture: fin du samedi 23h59
 * ├─ Calcul des revenus de la semaine (lun-dim)
 * ├─ Création des payouts
 * ├─ Vérification des détails bancaires
 * └─ Initiation des virements SEPA
 *
 * Mardi-Jeudi:
 * ├─ Virements en cours
 * └─ Notifications au chauffeur
 *
 * Vendredi:
 * ├─ Réception des virements (délai SEPA)
 * └─ Confirmation au chauffeur
 *
 * PRICING MODEL:
 *
 * Commission = round(prixCentimes × commissionPercentage / 100)  (20 % par défaut)
 * Revenu chauffeur = prixCentimes - commission
 *
 * Exemple : course à 15,00 € (1500 centimes), commission 20 %
 * - Commission plateforme : 300 centimes
 * - Revenu chauffeur : 1200 centimes
 */
