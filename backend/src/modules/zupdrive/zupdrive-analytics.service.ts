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
  avgResponseTime: number; // minutes
  cancellationRate: number;
}

export interface RegionalAnalytics {
  region: string;
  totalCourses: number;
  totalRevenue: number;
  avgSurgeMultiplier: number;
  activeDrivers: number;
  avgWaitTime: number; // minutes
  demandTrend: "INCREASING" | "STABLE" | "DECREASING";
}

export interface PaymentAnalytics {
  totalTransactions: number;
  successfulTransactions: number;
  successRate: number;
  totalAmount: number;
  avgAmount: number;
  failureReasons: Record<string, number>;
  topPaymentMethods: Array<{
    method: string;
    count: number;
    totalAmount: number;
  }>;
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
        avgResponseTime: 5, // TODO: Calculate from real data
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
          avgSurgeMultiplier: 1.2, // TODO: Calculate from actual surge data
          activeDrivers,
          avgWaitTime: 8, // TODO: Calculate from real data
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
      },
    });

    const successfulPayments = payments.filter((p) => p.status === "SUCCEEDED");

    return {
      totalTransactions: payments.length,
      successfulTransactions: successfulPayments.length,
      successRate: payments.length > 0 ? (successfulPayments.length / payments.length) * 100 : 0,
      totalAmount: payments.reduce((sum, p) => sum + p.amountCentimes, 0),
      avgAmount: payments.length > 0 ? payments.reduce((sum, p) => sum + p.amountCentimes, 0) / payments.length : 0,
      failureReasons: {
        // TODO: Track actual failure reasons in database
        "Card declined": 5,
        "Insufficient funds": 3,
        "Expired card": 2,
      },
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
        courseGrowth: ((period2.totalCourses - period1.totalCourses) / period1.totalCourses) * 100,
        revenueGrowth: ((period2.totalRevenue - period1.totalRevenue) / period1.totalRevenue) * 100,
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
