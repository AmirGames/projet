import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { NoteCourseDriveService } from "./note-course-drive.service";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/api-error";

/**
 * Gestion des chauffeurs ZupDrive pour les admins.
 * Suspension, réactivation, validation des documents, historique des infractions.
 */

/** Les statuts réels du dossier chauffeur (ChauffeurDrive.statut). */
export type StatutChauffeur = "BROUILLON" | "SOUMIS" | "VALIDE" | "REFUSE" | "SUSPENDU";

/** Les pièces que l'équipe peut valider ici, et leur type dans DocumentChauffeurDrive. */
const TYPE_PIECE: Record<"PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE", string> = {
  PERMIS: "permis",
  ASSURANCE: "assurance",
  INSPECTION: "controle_technique",
  IDENTITE: "identite",
};

export interface DriverInfo {
  id: string;
  nomComplet: string;
  email: string;
  phone: string;
  status: StatutChauffeur;
  /** Moyenne des notes des passagers (NoteCourseDrive), 0 tant que personne n'a noté. */
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
  chauffeurId: string;
  type: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE";
  /** DocumentChauffeurDrive.statut : PENDING, APPROVED, REJECTED, EXPIRED. */
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  url: string;
  expiresAt?: Date;
  verifiedAt?: Date;
}

export interface DriverInfraction {
  id: string;
  chauffeurId: string;
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
    status?: StatutChauffeur;
    region?: string;
    minRating?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ drivers: DriverInfo[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: Prisma.ChauffeurDriveWhereInput = {};
    if (filters.status) where.statut = filters.status;
    if (filters.region) where.region = filters.region;
    if (filters.minRating) {
      // Moyenne des notes des passagers, calculée depuis NoteCourseDrive.
      const qualifies = await db.noteCourseDrive.groupBy({
        by: ["chauffeurId"],
        where: { auteur: "PASSAGER" },
        _avg: { note: true },
        having: { note: { _avg: { gte: filters.minRating } } },
      });
      where.id = { in: qualifies.map((q) => q.chauffeurId) };
    }

    const [drivers, total] = await Promise.all([
      db.chauffeurDrive.findMany({
        where,
        select: {
          id: true,
          nomComplet: true,
          telephone: true,
          user: { select: { email: true } },
          statut: true,
          _count: { select: { courses: true, propositions: true } },
          payouts: {
            where: { status: { in: ["PENDING", "PROCESSED"] } },
            select: { amountCentimes: true },
          },
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.chauffeurDrive.count({ where }),
    ]);

    const notes = await NoteCourseDriveService.moyennesChauffeurs(drivers.map((d) => d.id));

    return {
      drivers: drivers.map((d) => ({
        id: d.id,
        nomComplet: d.nomComplet,
        email: d.user.email,
        phone: d.telephone || "",
        status: d.statut as StatutChauffeur,
        rating: notes.get(d.id)?.moyenne ?? 0,
        totalCourses: d._count.courses,
        acceptanceRate: d._count.courses > 0 ? d._count.propositions / d._count.courses : 0,
        totalEarnings: d.payouts.reduce((sum, e) => sum + e.amountCentimes, 0),
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
        // Une suspension met le chauffeur hors ligne (voir schema.prisma, enLigne).
        enLigne: false,
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
   * Valider une pièce déjà déposée par le chauffeur (DocumentChauffeurDrive).
   * Seule la version en vigueur (non archivée) du type demandé est validée ;
   * une pièce jamais déposée ne se valide pas. Le passage du dossier à VALIDE
   * reste une décision d'équipe (ChauffeurOnboardingService.valider).
   */
  static async validateDocument(
    chauffeurId: string,
    documentType: "PERMIS" | "ASSURANCE" | "INSPECTION" | "IDENTITE",
    expiresAt: Date
  ): Promise<void> {
    const chauffeur = await db.chauffeurDrive.findUnique({ where: { id: chauffeurId }, select: { id: true } });
    if (!chauffeur) throw new ApiError(404, "Chauffeur non trouvé");

    const piece = await db.documentChauffeurDrive.findFirst({
      where: { chauffeurId, type: TYPE_PIECE[documentType], archiveeLe: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!piece) throw new ApiError(404, "Document non déposé par le chauffeur");

    await db.documentChauffeurDrive.update({
      where: { id: piece.id },
      data: { statut: "APPROVED", dateExpiration: expiresAt, examineLe: new Date(), noteExamen: null },
    });

    logger.info(`Document ${documentType} of chauffeur ${chauffeurId} validated`);
  }

  /**
   * Récupérer l'historique des infractions d'un chauffeur.
   */
  static async getDriverInfractions(driverId: string): Promise<DriverInfraction[]> {
    const infractions = await db.chauffeurInfraction.findMany({
      where: { chauffeurId: driverId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        chauffeurId: true,
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
      chauffeurId: i.chauffeurId,
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
        chauffeurId: driverId,
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
        statut: true,
        courses: {
          select: { id: true, statut: true, prixCentimes: true, createdAt: true },
        },
        payouts: {
          where: { status: { in: ["PENDING", "PROCESSED"] } },
          select: { amountCentimes: true },
        },
        infractions: { select: { severity: true } },
        suspendedAt: true,
      },
    });

    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    const completedCourses = driver.courses.filter((c) => c.statut === "TERMINEE");
    const cancelledCourses = driver.courses.filter((c) => c.statut === "ANNULEE");
    const totalEarnings = driver.payouts.reduce((sum, e) => sum + e.amountCentimes, 0);
    const highSeverityInfractions = driver.infractions.filter((i) => i.severity === "HAUTE").length;

    const { moyenne } = await NoteCourseDriveService.moyenneChauffeur(driverId);

    return {
      id: driver.id,
      name: driver.nomComplet,
      status: driver.statut,
      rating: moyenne,
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
