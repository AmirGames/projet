import { db } from "../../services/db";

/** Vues financières de l'administration ZupDrive : versements en attente, tableau de bord, commission. */
export const ZupDriveFinanceAdminService = {
  /** Les versements en attente, le plus ancien d'abord. */
  versementsEnAttente(limit: number) {
    return db.driverPayoutDrive.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        chauffeurId: true,
        amountCentimes: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        chauffeur: {
          select: {
            nomComplet: true,
            user: { select: { email: true } },
          },
        },
      },
    });
  },

  /** Statistiques de la plateforme : versements et courses par statut. */
  async tableauDeBord() {
    // Get platform-wide statistics
    const [totalPayouts, pendingPayouts, completedPayouts, totalPayout] = await Promise.all([
      db.driverPayoutDrive.count(),
      db.driverPayoutDrive.count({ where: { status: "PENDING" } }),
      db.driverPayoutDrive.count({ where: { status: "PROCESSED" } }),
      db.driverPayoutDrive.aggregate({
        _sum: { amountCentimes: true },
      }),
    ]);

    // Get course statistics
    const coursesStats = await db.courseDrive.groupBy({
      by: ["statut"],
      _count: true,
      _sum: {
        prixCentimes: true,
      },
    });

    return {
      payouts: {
        total: totalPayouts,
        pending: pendingPayouts,
        completed: completedPayouts,
        totalAmount: totalPayout._sum?.amountCentimes ?? 0,
      },
      courses: coursesStats,
    };
  },

  /**
   * Change la commission de la plateforme. Elle ne s'applique qu'aux paiements
   * créés ensuite : un paiement existant garde sa répartition.
   */
  async changerCommission(commissionPercentage: number) {
    const avant = await db.platformSettingsDrive.findUnique({
      where: { id: "default" },
      select: { commissionPercentage: true },
    });

    const settings = await db.platformSettingsDrive.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        commissionPercentage,
      },
      update: {
        commissionPercentage,
      },
    });

    return { avant: avant?.commissionPercentage ?? null, settings };
  },
};
