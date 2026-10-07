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

export type PaymentStatus =
  | "PENDING"       // En attente de paiement passager
  | "COMPLETED"     // Paiement reçu
  | "DISPUTED"      // Litige en cours
  | "REFUNDED";     // Remboursé

export type PayoutStatus =
  | "PENDING"       // En attente du cycle de paiement
  | "SCHEDULED"     // Programmé pour virement
  | "PROCESSING"    // En cours de virement
  | "COMPLETED"     // Viré avec succès
  | "FAILED";       // Erreur de virement

export interface CourseEarnings {
  courseId: string;
  chauffeurId: string;
  passengerPrice: number; // Prix payé par passager (centimes)
  platformCommission: number; // Commission ZupDrive (centimes)
  chauffeurEarnings: number; // Revenu net chauffeur (centimes)
  distance: number; // km
  duration: number; // minutes
  baseRate: number; // Tarif de base (centimes/km)
  surgeMultiplier: number; // 1.0 = normal, 1.5 = surge
  tips: number; // Pourboire du passager (centimes)
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
  bankDetails?: {
    accountHolder: string;
    iban: string;
    bic?: string;
  };
  metadata?: {
    coursesIncluded: number;
    periodEarnings: number;
    platformCommission: number;
    taxes?: number; // À retenir
  };
  scheduledAt?: Date;
  completedAt?: Date;
  failureReason?: string;
}

/**
 * Pricing Model:
 * Price = (Base Rate × Distance) × Surge Multiplier + Time Fee + Minimum
 * Commission = Price × Commission Rate (typically 20-30%)
 * Driver Earnings = Price - Commission + Tips
 */

export const ZupDrivePaymentDriverService = {
  /**
   * Calculer les revenus d'une course
   */
  async calculateCourseEarnings(data: {
    courseId: string;
    chauffeurId: string;
    distance: number; // km
    duration: number; // minutes
    baseRate: number; // centimes/km
    surgeMultiplier: number; // 1.0 = normal
    passengerPrice: number; // Total payé par passager
    tips: number; // Pourboire
  }): Promise<CourseEarnings> {
    // Vérifier la course existe
    const course = await db.courseDrive.findUnique({
      where: { id: data.courseId },
      select: { statut: true },
    });

    if (!course) {
      throw new ApiError(404, "Course non trouvée");
    }

    if (course.statut !== "COMPLETED") {
      throw new ApiError(400, "Seules les courses complétées génèrent des revenus");
    }

    // Récupérer les paramètres de commission
    const platformConfig = await db.platformSettingsDrive.findFirst({
      select: {
        commissionPercentage: true,
      },
    });

    const commissionRate = (platformConfig?.commissionPercentage || 25) / 100;

    // Calculer les revenus
    const platformCommission = Math.round(data.passengerPrice * commissionRate);
    const chauffeurEarnings = data.passengerPrice - platformCommission + data.tips;

    return {
      courseId: data.courseId,
      chauffeurId: data.chauffeurId,
      passengerPrice: data.passengerPrice,
      platformCommission,
      chauffeurEarnings,
      distance: data.distance,
      duration: data.duration,
      baseRate: data.baseRate,
      surgeMultiplier: data.surgeMultiplier,
      tips: data.tips,
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
      // Lundi de cette semaine
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diff);
    } else {
      // Premier jour du mois
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Récupérer les courses du chauffeur
    const courses = await db.courseDrive.findMany({
      where: {
        chauffeurId,
        statut: "COMPLETED",
        createdAt: { gte: startDate, lte: now },
      },
      select: {
        id: true,
        prixTotal: true,
        pourboire: true,
        distanceKm: true,
        dureeMinutes: true,
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

    // Récupérer la commission
    const platformConfig = await db.platformSettingsDrive.findFirst({
      select: { commissionPercentage: true },
    });

    const commissionRate = (platformConfig?.commissionPercentage || 25) / 100;

    // Calculer les totaux
    let totalPassengerSpent = 0;
    let totalTips = 0;
    let totalEarnings = 0;

    for (const course of courses) {
      totalPassengerSpent += course.prixTotal;
      totalTips += course.pourboire || 0;

      const commission = Math.round(course.prixTotal * commissionRate);
      totalEarnings += course.prixTotal - commission + (course.pourboire || 0);
    }

    const totalCommission = totalPassengerSpent - (totalEarnings - totalTips);

    return {
      chauffeurId,
      period,
      totalEarnings,
      totalCommission,
      totalPassengerSpent,
      coursesCompleted: courses.length,
      averagePerCourse: Math.round(totalEarnings / courses.length),
      tips: totalTips,
      breakdown: {
        baseFares: totalPassengerSpent - totalTips,
        surgeBonus: 0, // TODO: Calculate from surge multipliers
        tips: totalTips,
        bonuses: 0, // Incentive programs
      },
    };
  },

  /**
   * Préparer un paiement hebdomadaire pour les chauffeurs
   */
  async preparePayout(chauffeurId: string): Promise<DriverPayout> {
    // Récupérer les revenus de cette semaine
    const earnings = await this.getDriverEarnings(chauffeurId, "week");

    if (earnings.totalEarnings === 0) {
      throw new ApiError(400, "Aucun revenu à verser cette semaine");
    }

    // Vérifier que le chauffeur a des détails bancaires
    const chauffeur = await db.chauffeurDrive.findUnique({
      where: { id: chauffeurId },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        bankDetails: true,
      },
    });

    if (!chauffeur?.bankDetails) {
      throw new ApiError(400, "Détails bancaires manquants");
    }

    // Créer le payout
    const payout = await db.driverPayoutDrive.create({
      data: {
        chauffeurId,
        montant: earnings.totalEarnings,
        statut: "PENDING",
        periodeDebut: new Date(new Date().setDate(new Date().getDate() - 7)),
        periodeFinale: new Date(),
        metadata: {
          coursesIncluded: earnings.coursesCompleted,
          periodEarnings: earnings.totalEarnings,
          platformCommission: earnings.totalCommission,
        },
      },
    });

    return {
      id: payout.id,
      chauffeurId,
      amount: earnings.totalEarnings,
      status: "PENDING" as PayoutStatus,
      period: {
        startDate: new Date(new Date().setDate(new Date().getDate() - 7)),
        endDate: new Date(),
      },
      metadata: {
        coursesIncluded: earnings.coursesCompleted,
        periodEarnings: earnings.totalEarnings,
        platformCommission: earnings.totalCommission,
      },
    };
  },

  /**
   * Traiter un payout (virement bancaire)
   */
  async processPayout(payoutId: string): Promise<DriverPayout> {
    const payout = await db.driverPayoutDrive.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        chauffeurId: true,
        montant: true,
        statut: true,
        periodeDebut: true,
        periodeFinale: true,
      },
    });

    if (!payout) {
      throw new ApiError(404, "Payout non trouvé");
    }

    if (payout.statut !== "PENDING") {
      throw new ApiError(400, `Payout déjà ${payout.statut}`);
    }

    // TODO: Intégration Stripe pour virement SEPA
    // await stripe.transfers.create({
    //   amount: payout.montant,
    //   currency: "eur",
    //   destination: chauffeur.stripeConnectId,
    // });

    // Mettre à jour le statut
    const updated = await db.driverPayoutDrive.update({
      where: { id: payoutId },
      data: {
        statut: "PROCESSING",
        programmeLe: new Date(),
      },
    });

    // Simuler le virement (en production: vrai virement Stripe)
    setTimeout(async () => {
      await db.driverPayoutDrive.update({
        where: { id: payoutId },
        data: {
          statut: "COMPLETED",
          completeLe: new Date(),
        },
      });
    }, 5000); // Simulé après 5 secondes

    return {
      id: updated.id,
      chauffeurId: updated.chauffeurId,
      amount: updated.montant,
      status: "PROCESSING" as PayoutStatus,
      period: {
        startDate: updated.periodeDebut,
        endDate: updated.periodeFinale,
      },
      scheduledAt: new Date(),
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
        montant: true,
        statut: true,
        periodeDebut: true,
        periodeFinale: true,
        programmeLe: true,
        completeLe: true,
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
   * Statut de payout personnalisé
   */
  async getPayoutStatus(payoutId: string) {
    const payout = await db.driverPayoutDrive.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        montant: true,
        statut: true,
        completeLe: true,
        erreurMotif: true,
      },
    });

    if (!payout) {
      throw new ApiError(404, "Payout non trouvé");
    }

    return {
      id: payout.id,
      amount: payout.montant,
      status: payout.statut,
      completedAt: payout.completeLe,
      failureReason: payout.erreurMotif,
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
  private getNextPayoutDate(): Date {
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
 * Course Cost = (Distance × Base Rate) × Surge + Time Fee + Minimum
 *
 * Example:
 * - Distance: 5 km @ €0.25/km = €1.25
 * - Time: 10 min @ €0.10/min = €1.00
 * - Surge: 1.5x = (€1.25 + €1.00) × 1.5 = €3.375
 * - Minimum: €4.00 → Final: €4.00
 * - Tips: €1.00
 * ─────────────────────────────
 * Total: €5.00
 *
 * Platform Commission: €5.00 × 25% = €1.25
 * Driver Earnings: €5.00 - €1.25 + €1.00 = €4.75
 */
