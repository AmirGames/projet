import { db } from "../../services/db";

/** Lecture des rapports de conformité des chauffeurs : dernier rapport, dossiers signalés, tableau de bord, export. */
export const ZupDriveComplianceLectureService = {
  /** Le rapport le plus récent d'un chauffeur (`null` s'il n'en a pas). */
  dernierRapport(chauffeurId: string) {
    return db.complianceReportDrive.findFirst({
      where: { chauffeurId },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Les dossiers à risque élevé ou critique, le score de conformité le plus bas d'abord. */
  dossiersSignales() {
    return db.complianceReportDrive.findMany({
      where: { riskLevel: { in: ["HIGH", "CRITICAL"] } },
      // Score de conformité le plus bas d'abord : le risque le plus élevé en tête.
      orderBy: { complianceScore: "asc" },
      take: 50,
      select: {
        id: true,
        chauffeurId: true,
        complianceScore: true,
        riskLevel: true,
        createdAt: true,
        chauffeur: {
          select: {
            nomComplet: true,
            user: { select: { email: true } },
          },
        },
      },
    });
  },

  /** Vue d'ensemble de la conformité. */
  async tableauDeBord() {
    const [total, critical, high, medium, low, flagged, recent] = await Promise.all([
      db.complianceReportDrive.count(),
      db.complianceReportDrive.count({ where: { riskLevel: "CRITICAL" } }),
      db.complianceReportDrive.count({ where: { riskLevel: "HIGH" } }),
      db.complianceReportDrive.count({ where: { riskLevel: "MEDIUM" } }),
      db.complianceReportDrive.count({ where: { riskLevel: "LOW" } }),
      db.complianceReportDrive.count({ where: { riskLevel: { in: ["HIGH", "CRITICAL"] } } }),
      db.complianceReportDrive.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          chauffeurId: true,
          complianceScore: true,
          riskLevel: true,
          createdAt: true,
        },
      }),
    ]);

    const avgRiskScore = await db.complianceReportDrive.aggregate({
      _avg: { complianceScore: true },
    });

    return {
      totalReports: total,
      riskDistribution: {
        critical,
        high,
        medium,
        low,
      },
      flaggedForReview: flagged,
      averageRiskScore: avgRiskScore._avg.complianceScore === null ? 0 : 100 - Math.round(avgRiskScore._avg.complianceScore),
      recentReports: recent,
    };
  },

  /** Un rapport avec son chauffeur, pour l'export (`null` s'il n'existe pas). */
  rapportPourExport(reportId: string) {
    return db.complianceReportDrive.findUnique({
      where: { id: reportId },
      include: {
        chauffeur: {
          select: {
            nomComplet: true,
            region: true,
            user: { select: { email: true } },
          },
        },
      },
    });
  },
};
