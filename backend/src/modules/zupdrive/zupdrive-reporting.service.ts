import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";
import type { Prisma, ScheduledReport as ScheduledReportRow } from "@prisma/client";
import { lireCommissionPourcentage, repartirPrixCourse } from "./zupdrive-payment-driver.service";

/**
 * Advanced Reporting pour ZupDrive.
 * Rapports détaillés, exports, rapports planifiés.
 */

export interface DriverPerformanceReport {
  reportId: string;
  period: { startDate: Date; endDate: Date };
  driverId: string;
  driverName: string;
  metrics: {
    totalCourses: number;
    completionRate: number;
    avgRating: number;
    earnings: number;
    cancellationRate: number;
    acceptanceRate: number;
  };
  trends: {
    coursesGrowth: number; // %
    ratingTrend: number;
    earningsGrowth: number; // %
  };
  infractions: number;
  documentStatus: Record<string, string>;
}

export interface FinancialReport {
  reportId: string;
  period: { startDate: Date; endDate: Date };
  revenue: {
    total: number;
    byCourse: number;
    bySurge: number;
    average: number;
  };
  expenses: {
    commissions: number;
    payouts: number;
    refunds: number;
    platformFees: number;
  };
  netProfit: number;
  profitMargin: number; // %
  paymentMethods: Record<string, { count: number; amount: number }>;
  topDriversByRevenue: Array<{ driverId: string; driverName: string; amount: number }>;
}

export interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  totalDrivers: number;
  documentCompliance: {
    fullyCompliant: number;
    expiringWithin30Days: number;
    expired: number;
    incomplete: number;
  };
  infractionsSummary: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  suspensions: {
    active: number;
    recent30Days: number;
  };
  riskMetrics: {
    riskScore: number;
    driversSuspended: number;
    driversLowRating: number;
    recommendations: string[];
  };
}

export interface ScheduledReport {
  id: string;
  name: string;
  reportType: "DRIVER_PERFORMANCE" | "FINANCIAL" | "COMPLIANCE" | "CUSTOM";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
  recipients: string[]; // emails
  format: "PDF" | "EXCEL" | "JSON";
  lastGeneratedAt?: Date;
  nextGenerationAt: Date;
  active: boolean;
  createdAt: Date;
}

export class ZupDriveReportingService {
  /**
   * Générer un rapport de performance driver.
   */
  static async generateDriverPerformanceReport(data: {
    driverId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<DriverPerformanceReport> {
    const driver = await db.chauffeurDrive.findUnique({
      where: { id: data.driverId },
      select: {
        id: true,
        nomComplet: true,
        courses: {
          where: {
            createdAt: { gte: data.startDate, lte: data.endDate },
          },
          select: {
            id: true,
            statut: true,
            prixCentimes: true,
            // Notes données par les passagers au chauffeur
            notes: { where: { auteur: "PASSAGER" }, select: { note: true } },
          },
        },
        documents: {
          where: { archiveeLe: null },
          select: { type: true, statut: true },
        },
        infractions: {
          where: {
            createdAt: { gte: data.startDate, lte: data.endDate },
          },
          select: { id: true },
        },
        propositions: { select: { id: true } },
      },
    });

    if (!driver) throw new ApiError(404, "Driver non trouvé");

    const commissionPourcent = await lireCommissionPourcentage();
    const gainsChauffeur = (prix: { prixCentimes: number }[]) =>
      prix.reduce((somme, c) => somme + repartirPrixCourse(c.prixCentimes, commissionPourcent).chauffeurCentimes, 0);

    const terminees = driver.courses.filter((c) => c.statut === "TERMINEE");
    const completedCourses = terminees.length;
    const cancelledCourses = driver.courses.filter((c) => c.statut === "ANNULEE").length;
    const totalEarnings = gainsChauffeur(terminees);
    const allRatings = driver.courses.flatMap((c) => c.notes.map((n) => n.note));
    const avgRating = allRatings.length > 0 ? allRatings.reduce((a, b) => a + b, 0) / allRatings.length : 0;
    const noteGlobale = await db.noteCourseDrive.aggregate({
      where: { chauffeurId: data.driverId, auteur: "PASSAGER" },
      _avg: { note: true },
    });
    const overallRating = noteGlobale._avg.note ?? 0;

    // Calculer les trends (comparaison avec période précédente)
    const previousStartDate = new Date(data.startDate.getTime() - (data.endDate.getTime() - data.startDate.getTime()));
    const previousEndDate = data.startDate;

    const previousCoursesRows = await db.courseDrive.findMany({
      where: {
        chauffeurId: data.driverId,
        createdAt: { gte: previousStartDate, lte: previousEndDate },
        statut: "TERMINEE",
      },
      select: { prixCentimes: true },
    });
    const previousCourses = previousCoursesRows.length;
    const previousEarningsAmount = gainsChauffeur(previousCoursesRows);

    const coursesGrowth = previousCourses > 0 ? ((completedCourses - previousCourses) / previousCourses) * 100 : 0;
    const earningsGrowth = previousEarningsAmount > 0 ? ((totalEarnings - previousEarningsAmount) / previousEarningsAmount) * 100 : 0;

    // Document status
    const documentStatus: Record<string, string> = {};
    driver.documents.forEach((doc) => {
      documentStatus[doc.type] = doc.statut;
    });

    return {
      reportId: `RPT-${Date.now()}-DRIVER`,
      period: { startDate: data.startDate, endDate: data.endDate },
      driverId: driver.id,
      driverName: driver.nomComplet,
      metrics: {
        totalCourses: driver.courses.length,
        completionRate: driver.courses.length > 0 ? (completedCourses / driver.courses.length) * 100 : 0,
        avgRating,
        earnings: totalEarnings,
        cancellationRate: driver.courses.length > 0 ? (cancelledCourses / driver.courses.length) * 100 : 0,
        acceptanceRate: driver.courses.length > 0 ? (driver.propositions.length / driver.courses.length) * 100 : 0,
      },
      trends: {
        coursesGrowth,
        ratingTrend: overallRating ? overallRating - avgRating : 0,
        earningsGrowth,
      },
      infractions: driver.infractions.length,
      documentStatus,
    };
  }

  /**
   * Générer un rapport financier.
   */
  static async generateFinancialReport(data: {
    startDate: Date;
    endDate: Date;
  }): Promise<FinancialReport> {
    // Récupérer toutes les courses terminées
    const courses = await db.courseDrive.findMany({
      where: {
        createdAt: { gte: data.startDate, lte: data.endDate },
        statut: "TERMINEE",
      },
      select: {
        prixCentimes: true,
      },
    });

    const totalRevenue = courses.reduce((sum, c) => sum + c.prixCentimes, 0);
    // Le multiplicateur de surge n'est pas conservé sur CourseDrive : pas de ventilation possible.
    const baseRevenue = totalRevenue;
    const surgeRevenue = 0;

    // Récupérer les commissions et dépenses (paiements confirmés)
    const commissions = await db.paymentIntentDrive.aggregate({
      where: {
        createdAt: { gte: data.startDate, lte: data.endDate },
        status: "SUCCEEDED",
      },
      _sum: { platformCommissionCentimes: true },
    });

    const payouts = await db.driverPayoutDrive.aggregate({
      where: {
        createdAt: { gte: data.startDate, lte: data.endDate },
      },
      _sum: { amountCentimes: true },
    });

    // Aucun remboursement n'est modélisé sur PaymentIntentDrive.
    const refundsAmount = 0;

    const commissionsAmount = commissions._sum.platformCommissionCentimes ?? 0;
    const payoutsAmount = payouts._sum.amountCentimes ?? 0;
    const platformFees = Math.round(totalRevenue * 0.05); // 5% fee

    const netProfit = totalRevenue - commissionsAmount - payoutsAmount - refundsAmount - platformFees;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Payment methods (placeholder)
    const paymentMethods: Record<string, { count: number; amount: number }> = {
      CARD: { count: courses.length, amount: totalRevenue },
    };

    // Top drivers by revenue
    const topPayouts = await db.driverPayoutDrive.groupBy({
      by: ["chauffeurId"],
      where: { createdAt: { gte: data.startDate, lte: data.endDate } },
      _sum: { amountCentimes: true },
      orderBy: { _sum: { amountCentimes: "desc" } },
      take: 10,
    });
    const topChauffeurs = await db.chauffeurDrive.findMany({
      where: { id: { in: topPayouts.map((p) => p.chauffeurId) } },
      select: { id: true, nomComplet: true },
    });
    const nomParChauffeur = new Map(topChauffeurs.map((c) => [c.id, c.nomComplet]));

    return {
      reportId: `RPT-${Date.now()}-FINANCIAL`,
      period: { startDate: data.startDate, endDate: data.endDate },
      revenue: {
        total: totalRevenue,
        byCourse: baseRevenue,
        bySurge: surgeRevenue,
        average: courses.length > 0 ? totalRevenue / courses.length : 0,
      },
      expenses: {
        commissions: commissionsAmount,
        payouts: payoutsAmount,
        refunds: refundsAmount,
        platformFees,
      },
      netProfit,
      profitMargin,
      paymentMethods,
      topDriversByRevenue: topPayouts.map((p) => ({
        driverId: p.chauffeurId,
        driverName: nomParChauffeur.get(p.chauffeurId) ?? "",
        amount: p._sum.amountCentimes ?? 0,
      })),
    };
  }

  /**
   * Générer un rapport de compliance.
   */
  static async generateComplianceReport(data: {
    includeRecommendations?: boolean;
  } = {}): Promise<ComplianceReport> {
    const drivers = await db.chauffeurDrive.findMany({
      select: {
        id: true,
        documents: { where: { archiveeLe: null }, select: { statut: true, dateExpiration: true } },
        infractions: { select: { type: true, severity: true } },
        statut: true,
      },
    });

    // Note moyenne par chauffeur, depuis les notes des passagers
    const moyennes = await db.noteCourseDrive.groupBy({
      by: ["chauffeurId"],
      where: { auteur: "PASSAGER" },
      _avg: { note: true },
    });

    const now = new Date();
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const fullyCompliant = drivers.filter((d) =>
      d.documents.every((doc) => doc.statut === "APPROVED" && (!doc.dateExpiration || doc.dateExpiration > now))
    ).length;

    const expiringWithin30Days = drivers.filter((d) =>
      d.documents.some((doc) => doc.dateExpiration && doc.dateExpiration > now && doc.dateExpiration < thirtyDaysAhead)
    ).length;

    const expired = drivers.filter((d) =>
      d.documents.some((doc) => doc.dateExpiration && doc.dateExpiration < now)
    ).length;

    const incomplete = drivers.filter((d) => d.documents.length === 0).length;

    // Infractions
    const allInfractions = drivers.flatMap((d) => d.infractions);
    const infractionsByType: Record<string, number> = {};
    const infractionsBySeverity: Record<string, number> = {};

    allInfractions.forEach((inf) => {
      infractionsByType[inf.type] = (infractionsByType[inf.type] || 0) + 1;
      infractionsBySeverity[inf.severity] = (infractionsBySeverity[inf.severity] || 0) + 1;
    });

    // Suspensions
    const suspended = drivers.filter((d) => d.statut === "SUSPENDU").length;
    const lowRating = moyennes.filter((m) => m._avg.note !== null && m._avg.note < 4).length;

    // Risk score
    const riskScore = Math.min(
      100,
      (allInfractions.length / Math.max(drivers.length, 1)) * 40 +
        (lowRating / Math.max(drivers.length, 1)) * 30 +
        ((drivers.length - fullyCompliant) / Math.max(drivers.length, 1)) * 30
    );

    const recommendations: string[] = [];
    if (data.includeRecommendations) {
      if (fullyCompliant < drivers.length * 0.8) recommendations.push("Urgent: More than 20% of drivers non-compliant");
      if (expiringWithin30Days > drivers.length * 0.2) recommendations.push("Action: Many documents expiring soon");
      if (infractionsBySeverity["HAUTE"] > drivers.length * 0.05) recommendations.push("Review: High severe infractions");
    }

    return {
      reportId: `RPT-${Date.now()}-COMPLIANCE`,
      generatedAt: now,
      totalDrivers: drivers.length,
      documentCompliance: {
        fullyCompliant,
        expiringWithin30Days,
        expired,
        incomplete,
      },
      infractionsSummary: {
        total: allInfractions.length,
        byType: infractionsByType,
        bySeverity: infractionsBySeverity,
      },
      suspensions: {
        active: suspended,
        recent30Days: suspended, // TODO: track suspension date
      },
      riskMetrics: {
        riskScore,
        driversSuspended: suspended,
        driversLowRating: lowRating,
        recommendations,
      },
    };
  }

  /**
   * Créer un rapport programmé.
   */
  static async createScheduledReport(data: {
    name: string;
    reportType: "DRIVER_PERFORMANCE" | "FINANCIAL" | "COMPLIANCE" | "CUSTOM";
    frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
    recipients: string[];
    format: "PDF" | "EXCEL" | "JSON";
  }): Promise<ScheduledReport> {
    // Calculer nextGenerationAt
    const now = new Date();
    const nextGenerationAt = this.calculateNextGenerationTime(now, data.frequency);

    const report = await db.scheduledReport.create({
      data: {
        name: data.name,
        reportType: data.reportType,
        frequency: data.frequency,
        recipients: JSON.stringify(data.recipients),
        format: data.format,
        nextGenerationAt,
        active: true,
      },
    });

    logger.info(`Scheduled report created: ${data.name}`);
    return this.formatScheduledReport(report);
  }

  /**
   * Lister les rapports programmés.
   */
  static async listScheduledReports(activeOnly = true): Promise<ScheduledReport[]> {
    const reports = await db.scheduledReport.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return reports.map((r) => this.formatScheduledReport(r));
  }

  /**
   * Mettre à jour un rapport programmé.
   */
  static async updateScheduledReport(
    reportId: string,
    data: Partial<{
      name: string;
      frequency: string;
      recipients: string[];
      active: boolean;
    }>
  ): Promise<void> {
    const existant = await db.scheduledReport.findUnique({ where: { id: reportId }, select: { id: true } });
    if (!existant) throw new ApiError(404, "Rapport programmé introuvable", "SCHEDULED_REPORT_NOT_FOUND");

    const { recipients, ...autres } = data;
    const updateData: Prisma.ScheduledReportUpdateInput = { ...autres };
    if (recipients) {
      updateData.recipients = JSON.stringify(recipients);
    }

    await db.scheduledReport.update({
      where: { id: reportId },
      data: updateData,
    });

    logger.info(`Scheduled report ${reportId} updated`);
  }

  /**
   * Calculer le prochain temps de génération basé sur la fréquence.
   */
  private static calculateNextGenerationTime(now: Date, frequency: string): Date {
    const next = new Date(now);

    switch (frequency) {
      case "DAILY":
        next.setDate(next.getDate() + 1);
        next.setHours(0, 0, 0, 0);
        break;
      case "WEEKLY":
        next.setDate(next.getDate() + 7);
        next.setHours(0, 0, 0, 0);
        break;
      case "MONTHLY":
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        next.setHours(0, 0, 0, 0);
        break;
      case "QUARTERLY":
        next.setMonth(next.getMonth() + 3);
        next.setDate(1);
        next.setHours(0, 0, 0, 0);
        break;
    }

    return next;
  }

  // Formatters

  private static formatScheduledReport(report: ScheduledReportRow): ScheduledReport {
    return {
      id: report.id,
      name: report.name,
      reportType: report.reportType as ScheduledReport["reportType"],
      frequency: report.frequency as ScheduledReport["frequency"],
      recipients: JSON.parse(report.recipients || "[]") as string[],
      format: report.format as ScheduledReport["format"],
      lastGeneratedAt: report.lastGeneratedAt || undefined,
      nextGenerationAt: report.nextGenerationAt,
      active: report.active,
      createdAt: report.createdAt,
    };
  }
}
