import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";

/**
 * Gestion des chauffeurs ZupDrive pour les admins.
 * Suspension, réactivation, validation des documents, historique des infractions.
 */

export interface DriverInfo {
  id: string;
  nomComplet: string;
  email: string;
  phone: string;
  status: "VALIDE" | "SUSPENDU" | "EN_ATTENTE_VALIDATION";
  rating: number;
  totalCourses: number;
  acceptanceRate: number;
  totalEarnings: number;
  createdAt: Date;
  suspendedAt?: Date;
  suspensionReason?: string;
}

export interface DriverDocument {
  id: string;
  driverId: string;
  type: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE";
  status: "VALIDE" | "EXPIREE" | "EN_ATTENTE";
  url: string;
  expiresAt: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
}

export interface DriverInfraction {
  id: string;
  driverId: string;
  type: "PLAINTE_PASSAGER" | "ACCIDENT" | "INFRACTION_CODE_ROUTE" | "AUTRE";
  description: string;
  severity: "BASSE" | "MOYENNE" | "HAUTE";
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export class ZupDriveDriverManagementService {
  /**
   * Lister tous les chauffeurs avec filtres et pagination.
   */
  static async listDrivers(filters: {
    status?: "VALIDE" | "SUSPENDU" | "EN_ATTENTE_VALIDATION";
    region?: string;
    minRating?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ drivers: DriverInfo[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: any = {};
    if (filters.status) where.statut = filters.status;
    if (filters.minRating) where.rating = { gte: filters.minRating };

    const [drivers, total] = await Promise.all([
      db.chauffeurDrive.findMany({
        where,
        select: {
          id: true,
          nomComplet: true,
          email: true,
          phone: true,
          statut: true,
          rating: true,
          courses: { select: { id: true } },
          propositions: { select: { id: true } },
          earnings: { select: { amountCentimes: true } },
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
        },
        take: limit,
        skip: offset,
      }),
      db.chauffeurDrive.count({ where }),
    ]);

    return {
      drivers: drivers.map((d) => ({
        id: d.id,
        nomComplet: d.nomComplet,
        email: d.email || "",
        phone: d.phone || "",
        status: d.statut as "VALIDE" | "SUSPENDU" | "EN_ATTENTE_VALIDATION",
        rating: d.rating || 0,
        totalCourses: d.courses.length,
        acceptanceRate: d.courses.length > 0 ? d.propositions.length / d.courses.length : 0,
        totalEarnings: d.earnings.reduce((sum, e) => sum + e.amountCentimes, 0),
        createdAt: d.createdAt,
        suspendedAt: d.suspendedAt || undefined,
        suspensionReason: d.suspensionReason || undefined,
      })),
      total,
    };
  }

  /**
   * Suspendre un chauffeur avec raison documentée.
   */
  static async suspendDriver(driverId: string, reason: string): Promise<void> {
    const driver = await db.chauffeurDrive.findUnique({ where: { id: driverId } });
    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    await db.chauffeurDrive.update({
      where: { id: driverId },
      data: {
        statut: "SUSPENDU",
        suspendedAt: new Date(),
        suspensionReason: reason,
      },
    });

    logger.info(`Driver ${driverId} suspended: ${reason}`);
  }

  /**
   * Réactiver un chauffeur suspendu.
   */
  static async reactivateDriver(driverId: string): Promise<void> {
    const driver = await db.chauffeurDrive.findUnique({ where: { id: driverId } });
    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");
    if (driver.statut !== "SUSPENDU") {
      throw new ApiError(400, "Le chauffeur n'est pas suspendu");
    }

    await db.chauffeurDrive.update({
      where: { id: driverId },
      data: {
        statut: "VALIDE",
        suspendedAt: null,
        suspensionReason: null,
      },
    });

    logger.info(`Driver ${driverId} reactivated`);
  }

  /**
   * Valider les documents d'un chauffeur.
   */
  static async validateDocument(
    driverId: string,
    documentType: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE",
    expiresAt: Date
  ): Promise<void> {
    const driver = await db.chauffeurDrive.findUnique({ where: { id: driverId } });
    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    // Créer ou mettre à jour le document
    await db.chauffeurDocument.upsert({
      where: {
        driverId_type: {
          driverId,
          type: documentType,
        },
      },
      create: {
        driverId,
        type: documentType,
        status: "VALIDE",
        url: "", // À remplir par upload
        expiresAt,
        verifiedAt: new Date(),
        verifiedBy: "ADMIN", // TODO: remplacer par admin ID réel
      },
      update: {
        status: "VALIDE",
        expiresAt,
        verifiedAt: new Date(),
        verifiedBy: "ADMIN",
      },
    });

    // Vérifier si tous les documents requis sont validés
    const requiredDocs = ["PERMIS", "ASSURANCE", "IDENTITE"];
    const validatedDocs = await db.chauffeurDocument.findMany({
      where: {
        driverId,
        type: { in: requiredDocs as any },
        status: "VALIDE",
      },
    });

    if (validatedDocs.length === requiredDocs.length && driver.statut === "EN_ATTENTE_VALIDATION") {
      // Tous les documents sont validés, activer le chauffeur
      await db.chauffeurDrive.update({
        where: { id: driverId },
        data: { statut: "VALIDE" },
      });
      logger.info(`Driver ${driverId} validated and activated`);
    }
  }

  /**
   * Récupérer l'historique des infractions d'un chauffeur.
   */
  static async getDriverInfractions(driverId: string): Promise<DriverInfraction[]> {
    const infractions = await db.chauffeurInfraction.findMany({
      where: { driverId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        driverId: true,
        type: true,
        description: true,
        severity: true,
        createdAt: true,
        resolvedAt: true,
        resolution: true,
      },
    });

    return infractions.map((i) => ({
      id: i.id,
      driverId: i.driverId,
      type: i.type as "PLAINTE_PASSAGER" | "ACCIDENT" | "INFRACTION_CODE_ROUTE" | "AUTRE",
      description: i.description,
      severity: i.severity as "BASSE" | "MOYENNE" | "HAUTE",
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt || undefined,
      resolution: i.resolution || undefined,
    }));
  }

  /**
   * Signaler une infraction/plainte contre un chauffeur.
   */
  static async reportInfraction(
    driverId: string,
    type: "PLAINTE_PASSAGER" | "ACCIDENT" | "INFRACTION_CODE_ROUTE" | "AUTRE",
    description: string,
    severity: "BASSE" | "MOYENNE" | "HAUTE"
  ): Promise<string> {
    const driver = await db.chauffeurDrive.findUnique({ where: { id: driverId } });
    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    const infraction = await db.chauffeurInfraction.create({
      data: {
        driverId,
        type,
        description,
        severity,
      },
    });

    // Si haute gravité, suspendre automatiquement
    if (severity === "HAUTE") {
      await this.suspendDriver(driverId, `Infraction grave: ${description}`);
    }

    logger.info(`Infraction reported for driver ${driverId}: ${type}`);
    return infraction.id;
  }

  /**
   * Résoudre une infraction (investigation complète).
   */
  static async resolveInfraction(infractionId: string, resolution: string): Promise<void> {
    const infraction = await db.chauffeurInfraction.findUnique({ where: { id: infractionId } });
    if (!infraction) throw new ApiError(404, "Infraction non trouvée");

    await db.chauffeurInfraction.update({
      where: { id: infractionId },
      data: {
        resolvedAt: new Date(),
        resolution,
      },
    });

    logger.info(`Infraction ${infractionId} resolved: ${resolution}`);
  }

  /**
   * Statistiques détaillées d'un chauffeur pour l'admin.
   */
  static async getDriverStats(driverId: string) {
    const driver = await db.chauffeurDrive.findUnique({
      where: { id: driverId },
      select: {
        id: true,
        nomComplet: true,
        rating: true,
        statut: true,
        courses: {
          select: { id: true, statut: true, prixCentimes: true, createdAt: true },
        },
        earnings: { select: { amountCentimes: true } },
        notes: { select: { note: true } },
        infractions: { select: { severity: true } },
        suspendedAt: true,
      },
    });

    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    const completedCourses = driver.courses.filter((c) => c.statut === "TERMINEE");
    const cancelledCourses = driver.courses.filter((c) => c.statut === "ANNULEE");
    const totalEarnings = driver.earnings.reduce((sum, e) => sum + e.amountCentimes, 0);
    const highSeverityInfractions = driver.infractions.filter((i) => i.severity === "HAUTE").length;

    return {
      id: driver.id,
      name: driver.nomComplet,
      status: driver.statut,
      rating: driver.rating,
      suspendedAt: driver.suspendedAt,
      stats: {
        totalCourses: driver.courses.length,
        completedCourses: completedCourses.length,
        completionRate: driver.courses.length > 0 ? (completedCourses.length / driver.courses.length) * 100 : 0,
        cancelledCourses: cancelledCourses.length,
        avgPrice: driver.courses.length > 0 ? driver.courses.reduce((sum, c) => sum + c.prixCentimes, 0) / driver.courses.length : 0,
        totalEarnings,
        highSeverityInfractions,
      },
    };
  }
}
