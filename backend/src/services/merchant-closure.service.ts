import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";

export class MerchantClosureService {
  // ============================================================================
  // SUSPENSION
  // ============================================================================

  static async suspend(orgId: string, reason: string) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
      });

      if (!org) {
        throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
      }

      if (org.status === "CLOSED") {
        throw new ApiError(
          400,
          "Impossible de suspendre un compte fermé",
          "INVALID_STATUS"
        );
      }

      const updated = await db.organization.update({
        where: { id: orgId },
        data: {
          status: "SUSPENDED",
          suspensionReason: reason,
          suspensionDate: new Date(),
        },
      });

      logger.info("Merchant suspended", { orgId, reason });
      return updated;
    } catch (err) {
      throw err;
    }
  }

  static async unsuspend(orgId: string) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
      });

      if (!org) {
        throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
      }

      if (org.status !== "SUSPENDED") {
        throw new ApiError(
          400,
          "Ce compte n'est pas suspendu",
          "INVALID_STATUS"
        );
      }

      const updated = await db.organization.update({
        where: { id: orgId },
        data: {
          status: "ACTIVE",
          suspensionReason: null,
          suspensionDate: null,
        },
      });

      logger.info("Merchant unsuspended", { orgId });
      return updated;
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // CLOSURE
  // ============================================================================

  static async close(orgId: string, reason: string) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        include: {
          stores: true,
        },
      });

      if (!org) {
        throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
      }

      // Calculer la date limite de restauration (180 jours)
      const restorationDeadline = new Date();
      restorationDeadline.setDate(restorationDeadline.getDate() + 180);

      // Calculer la date de suppression hard-delete (60 jours)
      const closedUntil = new Date();
      closedUntil.setDate(closedUntil.getDate() + 60);

      // Créer un backup des données
      const archiveData = {
        organization: org,
        storesCount: org.stores.length,
      };

      const archive = await db.merchantArchive.create({
        data: {
          organizationId: orgId,
          reason,
          closureDate: new Date(),
          restorationDeadline,
          organizationData: org as any,
          storesData: org.stores,
        },
      });

      // Mettre à jour l'organisation
      const updated = await db.organization.update({
        where: { id: orgId },
        data: {
          status: "CLOSED",
          closureReason: reason,
          closureDate: new Date(),
          closedUntil,
          archiveBackupId: archive.id,
        },
      });

      logger.info("Merchant closed", { orgId, reason, archiveId: archive.id });
      return { updated, archive };
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // SOFT DELETE (après fermeture)
  // ============================================================================

  static async softDeleteMerchantData(orgId: string) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        include: { stores: { select: { id: true } } },
      });

      if (!org) {
        throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
      }

      const storeIds = org.stores.map((s) => s.id);

      // Soft-delete des produits
      await db.product.updateMany({
        where: {
          storeId: { in: storeIds },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      // Soft-delete des commandes
      await db.order.updateMany({
        where: {
          storeId: { in: storeIds },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      // Soft-delete des boutiques
      await db.store.updateMany({
        where: {
          orgId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      logger.info("Merchant data soft-deleted", { orgId });
      return true;
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // HARD DELETE (après 60j)
  // ============================================================================

  static async hardDeleteMerchantData(orgId: string) {
    try {
      const org = await db.organization.findUnique({
        where: { id: orgId },
        include: { stores: { select: { id: true } } },
      });

      if (!org) {
        throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
      }

      const storeIds = org.stores.map((s) => s.id);

      // Hard-delete des produits
      await db.product.deleteMany({
        where: {
          storeId: { in: storeIds },
        },
      });

      // Hard-delete des commandes
      await db.order.deleteMany({
        where: {
          storeId: { in: storeIds },
        },
      });

      // Hard-delete des catégories
      await db.category.deleteMany({
        where: {
          storeId: { in: storeIds },
        },
      });

      // Hard-delete des boutiques
      await db.store.deleteMany({
        where: {
          orgId,
        },
      });

      // Marquer l'archive comme définitivement archivée
      await db.merchantArchive.update({
        where: { organizationId: orgId },
        data: { isArchivedPermanently: true },
      });

      logger.info("Merchant data hard-deleted", { orgId });
      return true;
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // RESTORATION
  // ============================================================================

  static async restoreFromBackup(orgId: string, adminId: string) {
    try {
      const archive = await db.merchantArchive.findUnique({
        where: { organizationId: orgId },
      });

      if (!archive) {
        throw new ApiError(
          404,
          "Backup non trouvé pour ce commerçant",
          "NOT_FOUND"
        );
      }

      if (archive.isArchivedPermanently) {
        throw new ApiError(
          410,
          "Ce backup a été définitivement supprimé",
          "BACKUP_EXPIRED"
        );
      }

      if (archive.restorationDeadline < new Date()) {
        throw new ApiError(
          410,
          "La date limite de restauration a expiré",
          "RESTORATION_DEADLINE_PASSED"
        );
      }

      // Restaurer tous les soft-deleted records
      const storeIds = archive.storesData?.map((s: any) => s.id) || [];

      // Restaurer les produits
      await db.product.updateMany({
        where: {
          storeId: { in: storeIds },
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      // Restaurer les commandes
      await db.order.updateMany({
        where: {
          storeId: { in: storeIds },
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      // Restaurer les boutiques
      await db.store.updateMany({
        where: {
          orgId,
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });

      // Mettre à jour l'organisation
      const updated = await db.organization.update({
        where: { id: orgId },
        data: {
          status: "ACTIVE",
          closureReason: null,
          closureDate: null,
          closedUntil: null,
          archiveBackupId: null,
        },
      });

      // Marquer le backup comme restauré
      await db.merchantArchive.update({
        where: { organizationId: orgId },
        data: {
          isRestored: true,
          restoredAt: new Date(),
          restoredByAdminId: adminId,
        },
      });

      logger.info("Merchant restored from backup", { orgId, adminId });
      return updated;
    } catch (err) {
      throw err;
    }
  }

  // ============================================================================
  // CHECK STATUS
  // ============================================================================

  static async checkAndApplyAutomaticActions() {
    try {
      const now = new Date();

      // Trouver les comptes CLOSED depuis 60j (softer delete)
      const closedOrgs = await db.organization.findMany({
        where: {
          status: "CLOSED",
          closedUntil: { lte: now },
          isArchivedPermanently: false,
        },
        include: { stores: { select: { id: true } } },
      });

      for (const org of closedOrgs) {
        logger.info("Auto-triggering hard delete for organization", {
          orgId: org.id,
        });
        await this.hardDeleteMerchantData(org.id);
      }

      logger.info("Automatic closure actions completed", { count: closedOrgs.length });
      return closedOrgs.length;
    } catch (err) {
      logger.error("Error in automatic closure actions", { error: err });
      throw err;
    }
  }
}
