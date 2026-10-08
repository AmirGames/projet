import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";

/** Filtre des alertes chauffeurs de la supervision. */
export type TypeAlerte = "all" | "compliance" | "rating" | "suspension";

/** Alertes et indicateurs de santé de la plateforme ZupDrive, en lecture seule. */
export const ZupDriveAlertesService = {
  /** Les chauffeurs à surveiller, avec leur note moyenne (la plus basse d'abord). */
  async chauffeursAAlerter(alertType: TypeAlerte) {
    let whereClause: Prisma.ChauffeurDriveWhereInput = {};
    if (alertType === "compliance") {
      whereClause = {
        complianceReports: { some: { riskLevel: { in: ["HIGH", "CRITICAL"] } } },
      };
    } else if (alertType === "rating") {
      const faibles = await db.noteCourseDrive.groupBy({
        by: ["chauffeurId"],
        where: { auteur: "PASSAGER" },
        _avg: { note: true },
        having: { note: { _avg: { lt: 3.0 } } },
      });
      whereClause = { id: { in: faibles.map((f) => f.chauffeurId) } };
    } else if (alertType === "suspension") {
      whereClause = { statut: "SUSPENDU" };
    }

    const chauffeurs = await db.chauffeurDrive.findMany({
      where: whereClause,
      take: 50,
      select: {
        id: true,
        nomComplet: true,
        statut: true,
        _count: {
          select: { courses: true, notes: true },
        },
      },
    });

    // Note moyenne des passagers (NoteCourseDrive), triée de la plus basse à la plus haute
    const moyennes = await db.noteCourseDrive.groupBy({
      by: ["chauffeurId"],
      where: { auteur: "PASSAGER", chauffeurId: { in: chauffeurs.map((c) => c.id) } },
      _avg: { note: true },
    });
    const moyenneParChauffeur = new Map(moyennes.map((m) => [m.chauffeurId, m._avg.note]));
    return chauffeurs
      .map((c) => ({ ...c, rating: moyenneParChauffeur.get(c.id) ?? null }))
      .sort((x, y) => (x.rating ?? Infinity) - (y.rating ?? Infinity));
  },

  /** Les rapports de conformité au niveau de risque critique. */
  alertesDeConformite() {
    return db.complianceReportDrive.findMany({
      where: {
        riskLevel: "CRITICAL",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
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

  /** Les pièces validées qui expirent dans les 30 jours. */
  piecesQuiExpirent() {
    // Find documents expiring within 30 days
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return db.documentChauffeurDrive.findMany({
      where: {
        statut: "APPROVED",
        archiveeLe: null,
        dateExpiration: {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        },
      },
      orderBy: { dateExpiration: "asc" },
      take: 50,
      select: {
        id: true,
        type: true,
        dateExpiration: true,
        chauffeurId: true,
        chauffeur: {
          select: {
            nomComplet: true,
            user: { select: { email: true } },
          },
        },
      },
    });
  },

  /** Les derniers versements en échec. */
  versementsEnEchec() {
    return db.driverPayoutDrive.findMany({
      where: {
        status: "FAILED",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        chauffeurId: true,
        amountCentimes: true,
        failureReason: true,
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

  /** Indicateurs de santé : chauffeurs actifs et suspendus, courses en cours, note moyenne. */
  async sante() {
    const [
      driverCount,
      activeCourses,
      suspendedCount,
      avgRating,
    ] = await Promise.all([
      db.chauffeurDrive.count({ where: { statut: "VALIDE" } }),
      db.courseDrive.count({ where: { statut: { in: ["ACCEPTEE", "ARRIVEE", "EN_COURS"] } } }),
      db.chauffeurDrive.count({ where: { statut: "SUSPENDU" } }),
      db.noteCourseDrive.aggregate({
        where: { auteur: "PASSAGER" },
        _avg: { note: true },
      }),
    ]);

    return {
      drivers: {
        active: driverCount,
        suspended: suspendedCount,
      },
      courses: {
        active: activeCourses,
      },
      quality: {
        averageRating: Math.round((avgRating._avg.note || 0) * 100) / 100,
      },
      status: "OPERATIONAL",
      timestamp: new Date().toISOString(),
    };
  },
};
