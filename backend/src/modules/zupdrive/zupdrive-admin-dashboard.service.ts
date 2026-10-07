import { db } from "../../services/db";
import { logger } from "../../config/logger";

/**
 * Admin Dashboard pour ZupDrive.
 * Agrège les métriques, paiements et courses pour supervision de la plateforme.
 */

export interface DashboardMetrics {
  courses: {
    totalToday: number;
    totalThisWeek: number;
    byStatus: Record<string, number>;
    avgPrice: number;
    totalRevenue: number;
  };
  drivers: {
    totalActive: number;
    totalOnline: number;
    avgRating: number;
    totalEarnings: number;
  };
  payments: {
    totalProcessed: number;
    totalPending: number;
    successRate: number;
    avgPayout: number;
  };
  regions: Array<{
    name: string;
    courseCount: number;
    driverCount: number;
    avgSurge: number;
  }>;
}

export class ZupDriveAdminDashboardService {
  /**
   * Métriques complètes du dashboard.
   */
  static async getDashboardMetrics(region?: string): Promise<DashboardMetrics> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const whereToday = {
      createdAt: { gte: todayStart },
      ...(region && { region }),
    };

    const whereWeek = {
      createdAt: { gte: weekStart },
      ...(region && { region }),
    };

    const [
      coursesToday,
      coursesWeek,
      coursesByStatus,
      courseStats,
      driverActive,
      driverOnline,
      driverEarnings,
      paymentProcessed,
      paymentPending,
      paymentStats,
      regions,
    ] = await Promise.all([
      db.courseDrive.count({ where: whereToday }),
      db.courseDrive.count({ where: whereWeek }),
      db.courseDrive.groupBy({
        by: ["statut"],
        where: whereToday,
        _count: true,
      }),
      db.courseDrive.aggregate({
        where: whereToday,
        _avg: { prixCentimes: true },
        _sum: { prixCentimes: true },
      }),
      db.chauffeurDrive.count({ where: { statut: "VALIDE", ...(region && { region }) } }),
      db.chauffeurDrive.count({ where: { statut: "VALIDE", enLigne: true, ...(region && { region }) } }),
      db.driverPayoutDrive.aggregate({
        where: { status: "PROCESSED", ...(region && { createdAt: { gte: weekStart } }) },
        _sum: { amountCentimes: true },
      }),
      db.driverPayoutDrive.count({ where: { status: "PROCESSED" } }),
      db.driverPayoutDrive.count({ where: { status: "PENDING" } }),
      db.driverPayoutDrive.aggregate({
        _avg: { amountCentimes: true },
        _count: true,
      }),
      db.courseDrive.groupBy({
        by: ["region"],
        where: whereWeek,
        _count: true,
      }),
    ]);

    // Calculer les ratings moyens
    const avgRatings = await db.noteCourseDrive.aggregate({
      where: {
        course: { createdAt: { gte: weekStart }, ...(region && { region }) },
        auteur: "PASSAGER",
      },
      _avg: { note: true },
    });

    // Construire la réponse
    const byStatus: Record<string, number> = {};
    coursesByStatus.forEach((item: any) => {
      byStatus[item.statut] = item._count;
    });

    return {
      courses: {
        totalToday: coursesToday,
        totalThisWeek: coursesWeek,
        byStatus,
        avgPrice: courseStats._avg.prixCentimes || 0,
        totalRevenue: (courseStats._sum.prixCentimes || 0) / 100, // En euros
      },
      drivers: {
        totalActive: driverActive,
        totalOnline: driverOnline,
        avgRating: avgRatings._avg.note || 0,
        totalEarnings: (driverEarnings._sum.amountCentimes || 0) / 100, // En euros
      },
      payments: {
        totalProcessed: paymentProcessed,
        totalPending: paymentPending,
        successRate: paymentProcessed + paymentPending > 0 ? (paymentProcessed / (paymentProcessed + paymentPending)) * 100 : 0,
        avgPayout: (paymentStats._avg.amountCentimes || 0) / 100, // En euros
      },
      regions: regions.map((r: any) => ({
        name: r.region,
        courseCount: r._count,
        driverCount: 0, // Sera rempli après
        avgSurge: 1.0, // Placeholder
      })),
    };
  }

  /**
   * Détails des lots SEPA pour gestion financière.
   */
  static async getPayoutBatches(limit: number = 50, offset: number = 0) {
    const [batches, total] = await Promise.all([
      db.driverPayoutBatchDrive.findMany({
        where: {},
        include: {
          payouts: {
            select: { id: true, amountCentimes: true, chauffeurId: true, status: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.driverPayoutBatchDrive.count(),
    ]);

    return {
      batches: batches.map((b) => ({
        id: b.id,
        period: { start: b.periodStart, end: b.periodEnd },
        status: b.status,
        totalAmount: b.totalAmountCentimes / 100,
        payoutCount: b.payoutCount,
        submittedAt: b.submittedAt,
        processedAt: b.processedAt,
        stripeTransferId: b.stripeTransferId,
        failureReason: b.failureReason,
      })),
      pagination: { total, limit, offset },
    };
  }

  /**
   * Courses détaillées avec paiement et chauffeur.
   */
  static async getCoursesList(
    filters?: {
      region?: string;
      status?: string;
      driverId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit: number = 50,
    offset: number = 0
  ) {
    const where: any = {};
    if (filters?.region) where.region = filters.region;
    if (filters?.status) where.statut = filters.status;
    if (filters?.driverId) where.chauffeurId = filters.driverId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [courses, total] = await Promise.all([
      db.courseDrive.findMany({
        where,
        include: {
          chauffeur: { select: { id: true, nomComplet: true } },
          paymentIntent: { select: { status: true, amountCentimes: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.courseDrive.count({ where }),
    ]);

    return {
      courses: courses.map((c) => ({
        id: c.id,
        region: c.region,
        status: c.statut,
        price: c.prixCentimes / 100,
        driver: c.chauffeur ? { id: c.chauffeur.id, name: c.chauffeur.nomComplet } : null,
        payment: c.paymentIntent ? {
          status: c.paymentIntent.status,
          amount: c.paymentIntent.amountCentimes / 100,
        } : null,
        createdAt: c.createdAt,
        completedAt: c.termineeLe,
      })),
      pagination: { total, limit, offset },
    };
  }

  /**
   * Statistiques détaillées d'un chauffeur.
   */
  static async getDriverStats(driverId: string) {
    const [driver, courses, ratings, earnings] = await Promise.all([
      db.chauffeurDrive.findUniqueOrThrow({ where: { id: driverId } }),
      db.courseDrive.findMany({
        where: { chauffeurId: driverId },
        select: { id: true, statut: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.noteCourseDrive.aggregate({
        where: { chauffeurId: driverId, auteur: "PASSAGER" },
        _avg: { note: true },
        _count: true,
      }),
      db.driverPayoutDrive.aggregate({
        where: { chauffeurId: driverId },
        _sum: { amountCentimes: true },
        _count: true,
      }),
    ]);

    const acceptanceRate = courses.length > 0 ? (courses.filter((c) => c.statut !== "ANNULEE").length / courses.length) * 100 : 0;

    return {
      id: driver.id,
      name: driver.nomComplet,
      status: driver.statut,
      rating: ratings._avg.note || 0,
      ratingCount: ratings._count,
      courses: {
        total: courses.length,
        completed: courses.filter((c) => c.statut === "TERMINEE").length,
        cancelled: courses.filter((c) => c.statut === "ANNULEE").length,
        acceptanceRate: acceptanceRate,
      },
      earnings: {
        totalCentimes: earnings._sum.amountCentimes || 0,
        totalEuros: (earnings._sum.amountCentimes || 0) / 100,
        payoutCount: earnings._count,
      },
      lastActive: driver.positionLe,
    };
  }

  /**
   * Alertes et anomalies de la plateforme.
   */
  static async getAlerts() {
    const alerts: any[] = [];

    // Chauffeurs hors ligne depuis longtemps
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const inactiveDrivers = await db.chauffeurDrive.count({
      where: {
        enLigne: false,
        positionLe: { lt: oneDayAgo },
        statut: "VALIDE",
      },
    });

    if (inactiveDrivers > 0) {
      alerts.push({
        type: "DRIVER_INACTIVE",
        severity: "LOW",
        message: `${inactiveDrivers} chauffeurs inactifs depuis 24h`,
        count: inactiveDrivers,
      });
    }

    // Lots de paiement en attente
    const pendingBatches = await db.driverPayoutBatchDrive.count({
      where: { status: "PENDING" },
    });

    if (pendingBatches > 0) {
      alerts.push({
        type: "PENDING_PAYOUTS",
        severity: "MEDIUM",
        message: `${pendingBatches} lot(s) de paiement en attente`,
        count: pendingBatches,
      });
    }

    // Paiements échoués
    const failedPayouts = await db.driverPayoutDrive.count({
      where: { status: "FAILED" },
    });

    if (failedPayouts > 0) {
      alerts.push({
        type: "FAILED_PAYOUTS",
        severity: "HIGH",
        message: `${failedPayouts} versement(s) échoué(s)`,
        count: failedPayouts,
      });
    }

    logger.info("Admin alerts generated", { count: alerts.length });
    return alerts;
  }
}
