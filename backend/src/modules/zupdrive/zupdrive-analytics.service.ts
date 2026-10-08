import { db } from "../../services/db";

/**
 * Analytics et reports pour ZupDrive.
 * Métriques détaillées, trends, performance drivers, paiements, régions.
 */

export interface AnalyticsPeriod {
  startDate: Date;
  endDate: Date;
  totalCourses: number;
  totalRevenue: number;
  avgPrice: number;
  totalPassengers: number;
  totalDrivers: number;
  avgRating: number;
  successRate: number;
}

export interface DriverPerformance {
  chauffeurId: string;
  chauffeurName: string;
  rating: number;
  totalCourses: number;
  completedCourses: number;
  completionRate: number;
  avgEarnings: number;
  totalEarnings: number;
  /** Minutes entre la commande et l'acceptation ; null sans course acceptée sur la période. */
  avgResponseTime: number | null;
  cancellationRate: number;
}

export interface RegionalAnalytics {
  region: string;
  totalCourses: number;
  totalRevenue: number;
  /** Moyenne des majorations enregistrées ; null si aucune course de la période n'en porte. */
  avgSurgeMultiplier: number | null;
  activeDrivers: number;
  /** Minutes entre l'acceptation et l'arrivée du chauffeur ; null sans course concernée. */
  avgWaitTime: number | null;
  demandTrend: "INCREASING" | "STABLE" | "DECREASING";
}

export interface PaymentAnalytics {
  totalTransactions: number;
  successfulTransactions: number;
  successRate: number;
  totalAmount: number;
  avgAmount: number;
  /** Nombre d'échecs par code Stripe ; vide s'il n'y a eu aucun échec enregistré. */
  failureReasons: Record<string, number>;
  topPaymentMethods: Array<{
    method: string;
    count: number;
    totalAmount: number;
  }>;
}

const MS_PAR_MINUTE = 60_000;

/** Moyenne des valeurs ; null (et non 0) quand il n'y en a aucune. */
export function moyenneOuNull(valeurs: number[]): number | null {
  return valeurs.length > 0 ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length : null;
}

/** Durée moyenne en minutes entre deux instants connus ; les paires incomplètes ou négatives sont ignorées. */
export function delaiMoyenMinutes(paires: Array<{ debut: Date | null; fin: Date | null }>): number | null {
  const delais = paires.flatMap(({ debut, fin }) => {
    if (!debut || !fin) return [];
    const ms = fin.getTime() - debut.getTime();
    return ms >= 0 ? [ms / MS_PAR_MINUTE] : [];
  });
  return moyenneOuNull(delais);
}

/** Échecs de paiement regroupés par code ; les paiements sans échec enregistré ne comptent pas. */
export function compterParMotif(paiements: Array<{ failureReason: string | null }>): Record<string, number> {
  const parMotif: Record<string, number> = {};
  for (const { failureReason } of paiements) {
    if (failureReason) parMotif[failureReason] = (parMotif[failureReason] ?? 0) + 1;
  }
  return parMotif;
}

/** Évolution en % ; null quand la période de référence est vide (division par zéro). */
export function croissancePourcent(avant: number, apres: number): number | null {
  return avant > 0 ? ((apres - avant) / avant) * 100 : null;
}

export class ZupDriveAnalyticsService {
  /**
   * Rapport complet pour une période donnée.
   */
  static async getPeriodAnalytics(startDate: Date, endDate: Date): Promise<AnalyticsPeriod> {
    const courses = await db.courseDrive.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        statut: "TERMINEE",
      },
      select: {
        id: true,
        prixCentimes: true,
        passagerId: true,
        chauffeurId: true,
      },
    });

    const allCourses = await db.courseDrive.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        // Seules les notes des passagers comptent pour la moyenne du chauffeur.
        notes: { where: { auteur: "PASSAGER" }, select: { note: true } },
        statut: true,
      },
    });

    const uniquePassengers = new Set(courses.map((c) => c.passagerId)).size;
    const uniqueDrivers = new Set(courses.map((c) => c.chauffeurId)).size;

    const totalRevenue = courses.reduce((sum, c) => sum + c.prixCentimes, 0);
    const totalCourses = courses.length;

    const ratings = allCourses.flatMap((c) => c.notes.map((n) => n.note));
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const successRate = allCourses.length > 0 ? (totalCourses / allCourses.length) * 100 : 0;

    return {
      startDate,
      endDate,
      totalCourses,
      totalRevenue,
      avgPrice: totalCourses > 0 ? totalRevenue / totalCourses : 0,
      totalPassengers: uniquePassengers,
      totalDrivers: uniqueDrivers,
      avgRating,
      successRate,
    };
  }

  /**
   * Performance des drivers pour une période.
   */
  static async getDriverPerformance(startDate: Date, endDate: Date, limit = 50): Promise<DriverPerformance[]> {
    const drivers = await db.chauffeurDrive.findMany({
      select: {
        id: true,
        nomComplet: true,
        courses: {
          where: {
            createdAt: { gte: startDate, lte: endDate },
          },
          select: {
            id: true,
            statut: true,
            prixCentimes: true,
            createdAt: true,
            accepteeLe: true,
            // Gain net du chauffeur (centimes), figé avec le paiement de la course.
            paymentIntent: { select: { status: true, driverEarningsCentimes: true } },
          },
        },
      },
      take: limit,
    });

    // Note moyenne du chauffeur : moyenne des notes données par les passagers (NoteCourseDrive).
    const moyennes = await db.noteCourseDrive.groupBy({
      by: ["chauffeurId"],
      where: { auteur: "PASSAGER", chauffeurId: { in: drivers.map((d) => d.id) } },
      _avg: { note: true },
    });
    const noteParChauffeur = new Map(moyennes.map((m) => [m.chauffeurId, m._avg.note ?? 0]));

    return drivers.map((d) => {
      const completedCourses = d.courses.filter((c) => c.statut === "TERMINEE").length;
      const cancelledCourses = d.courses.filter((c) => c.statut === "ANNULEE").length;
      const totalEarnings = d.courses.reduce(
        (sum, c) => (c.paymentIntent?.status === "SUCCEEDED" ? sum + c.paymentIntent.driverEarningsCentimes : sum),
        0
      );

      return {
        chauffeurId: d.id,
        chauffeurName: d.nomComplet,
        rating: noteParChauffeur.get(d.id) ?? 0,
        totalCourses: d.courses.length,
        completedCourses,
        completionRate: d.courses.length > 0 ? (completedCourses / d.courses.length) * 100 : 0,
        avgEarnings: d.courses.length > 0 ? totalEarnings / d.courses.length : 0,
        totalEarnings,
        avgResponseTime: delaiMoyenMinutes(d.courses.map((c) => ({ debut: c.createdAt, fin: c.accepteeLe }))),
        cancellationRate: d.courses.length > 0 ? (cancelledCourses / d.courses.length) * 100 : 0,
      };
    });
  }

  /**
   * Analytics par région.
   */
  static async getRegionalAnalytics(startDate: Date, endDate: Date): Promise<RegionalAnalytics[]> {
    const regions = ["BRUXELLES", "WALLONIE", "FLANDRE"];

    const analytics = await Promise.all(
      regions.map(async (region) => {
        const courses = await db.courseDrive.findMany({
          where: {
            region,
            createdAt: { gte: startDate, lte: endDate },
            statut: "TERMINEE",
          },
          select: {
            id: true,
            prixCentimes: true,
            surgeFactor: true,
            accepteeLe: true,
            arriveeLe: true,
          },
        });

        const activeDrivers = await db.chauffeurDrive.count({
          where: {
            region,
            statut: "VALIDE",
          },
        });

        const totalRevenue = courses.reduce((sum, c) => sum + c.prixCentimes, 0);

        // Simple demand trend based on course count
        const previousCourses = await db.courseDrive.count({
          where: {
            region,
            createdAt: {
              gte: new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000),
              lt: startDate,
            },
          },
        });

        let demandTrend: "INCREASING" | "STABLE" | "DECREASING" = "STABLE";
        if (courses.length > previousCourses * 1.1) demandTrend = "INCREASING";
        else if (courses.length < previousCourses * 0.9) demandTrend = "DECREASING";

        return {
          region,
          totalCourses: courses.length,
          totalRevenue,
          avgSurgeMultiplier: moyenneOuNull(courses.flatMap((c) => (c.surgeFactor === null ? [] : [c.surgeFactor]))),
          activeDrivers,
          avgWaitTime: delaiMoyenMinutes(courses.map((c) => ({ debut: c.accepteeLe, fin: c.arriveeLe }))),
          demandTrend,
        };
      })
    );

    return analytics;
  }

  /**
   * Rapport sur les paiements.
   */
  static async getPaymentAnalytics(startDate: Date, endDate: Date): Promise<PaymentAnalytics> {
    const payments = await db.paymentIntentDrive.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        amountCentimes: true,
        status: true,
        failureReason: true,
      },
    });

    const successfulPayments = payments.filter((p) => p.status === "SUCCEEDED");

    return {
      totalTransactions: payments.length,
      successfulTransactions: successfulPayments.length,
      successRate: payments.length > 0 ? (successfulPayments.length / payments.length) * 100 : 0,
      totalAmount: payments.reduce((sum, p) => sum + p.amountCentimes, 0),
      avgAmount: payments.length > 0 ? payments.reduce((sum, p) => sum + p.amountCentimes, 0) / payments.length : 0,
      failureReasons: compterParMotif(payments),
      topPaymentMethods: [
        { method: "Card", count: payments.length, totalAmount: payments.reduce((sum, p) => sum + p.amountCentimes, 0) },
      ],
    };
  }

  /**
   * Trend analysis - comparaison de deux périodes.
   */
  static async comparePeriods(period1Start: Date, period1End: Date, period2Start: Date, period2End: Date) {
    const [period1, period2] = await Promise.all([
      this.getPeriodAnalytics(period1Start, period1End),
      this.getPeriodAnalytics(period2Start, period2End),
    ]);

    return {
      period1,
      period2,
      comparison: {
        courseGrowth: croissancePourcent(period1.totalCourses, period2.totalCourses),
        revenueGrowth: croissancePourcent(period1.totalRevenue, period2.totalRevenue),
        ratingChange: period2.avgRating - period1.avgRating,
        successRateChange: period2.successRate - period1.successRate,
      },
    };
  }

  /**
   * Dashboard summary pour admins.
   */
  static async getDashboardSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayMetrics, weekMetrics, regionalAnalytics, paymentAnalytics] = await Promise.all([
      this.getPeriodAnalytics(todayStart, now),
      this.getPeriodAnalytics(weekStart, now),
      this.getRegionalAnalytics(weekStart, now),
      this.getPaymentAnalytics(weekStart, now),
    ]);

    return {
      today: todayMetrics,
      thisWeek: weekMetrics,
      regions: regionalAnalytics,
      payments: paymentAnalytics,
    };
  }
}
