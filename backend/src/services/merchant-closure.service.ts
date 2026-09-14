import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitWebhook } from "./webhook.service";

const HARD_DELETE_DELAY_DAYS = 60;
const RESTORATION_WINDOW_DAYS = 180;

function asRecords(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? (value as Record<string, any>[]) : [];
}

function withoutTimestamps(row: Record<string, any>) {
  const { createdAt, updatedAt, deletedAt, ...rest } = row;
  return rest;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export class MerchantClosureService {
  // ============================================================================
  // SUSPENSION
  // ============================================================================

  static async suspend(orgId: string, reason: string) {
    const org = await db.organization.findUnique({ where: { id: orgId } });

    if (!org) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    if (org.status === "CLOSED") {
      throw new ApiError(400, "Impossible de suspendre un compte fermé", "INVALID_STATUS");
    }

    if (org.status === "SUSPENDED") {
      throw new ApiError(400, "Ce compte est déjà suspendu", "INVALID_STATUS");
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
    emitWebhook("merchant.suspended", { orgId, name: org.name, reason });
    return updated;
  }

  static async unsuspend(orgId: string) {
    const org = await db.organization.findUnique({ where: { id: orgId } });

    if (!org) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    if (org.status !== "SUSPENDED") {
      throw new ApiError(400, "Ce compte n'est pas suspendu", "INVALID_STATUS");
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
  }

  // ============================================================================
  // CLOSURE
  // ============================================================================

  static async close(orgId: string, reason: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: { stores: true },
    });

    if (!org) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    if (org.status === "CLOSED") {
      throw new ApiError(400, "Ce compte est déjà fermé", "INVALID_STATUS");
    }

    const storeIds = org.stores.map((s) => s.id);

    // Snapshot complet avant toute suppression
    const [categories, products, orders, customers] = await Promise.all([
      db.category.findMany({ where: { storeId: { in: storeIds } } }),
      db.product.findMany({ where: { storeId: { in: storeIds } } }),
      db.order.findMany({ where: { storeId: { in: storeIds } }, include: { items: true } }),
      db.customer.findMany({ where: { orders: { some: { storeId: { in: storeIds } } } } }),
    ]);

    const closureDate = new Date();
    const closedUntil = addDays(HARD_DELETE_DELAY_DAYS);
    const restorationDeadline = addDays(RESTORATION_WINDOW_DAYS);

    const archive = await db.merchantArchive.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        reason,
        closureDate,
        restorationDeadline,
        organizationData: org as any,
        storesData: org.stores as any,
        productsData: { categories, products } as any,
        ordersData: orders as any,
        customersData: customers as any,
      },
      update: {
        reason,
        closureDate,
        restorationDeadline,
        organizationData: org as any,
        storesData: org.stores as any,
        productsData: { categories, products } as any,
        ordersData: orders as any,
        customersData: customers as any,
        isRestored: false,
        restoredAt: null,
        restoredByAdminId: null,
      },
    });

    const updated = await db.organization.update({
      where: { id: orgId },
      data: {
        status: "CLOSED",
        closureReason: reason,
        closureDate,
        closedUntil,
        archiveBackupId: archive.id,
      },
    });

    // Masque les données sans les détruire : restaurables jusqu'au hard-delete
    await this.softDeleteMerchantData(orgId);

    logger.info("Merchant closed", { orgId, reason, archiveId: archive.id });
    emitWebhook("merchant.closed", { orgId, name: org.name, reason, closedUntil });
    return { updated, archive };
  }

  // ============================================================================
  // SOFT DELETE (après fermeture)
  // ============================================================================

  static async softDeleteMerchantData(orgId: string) {
    const stores = await db.store.findMany({
      where: { orgId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);
    const deletedAt = new Date();

    await db.product.updateMany({
      where: { storeId: { in: storeIds }, deletedAt: null },
      data: { deletedAt },
    });

    await db.order.updateMany({
      where: { storeId: { in: storeIds }, deletedAt: null },
      data: { deletedAt },
    });

    await db.store.updateMany({
      where: { orgId, deletedAt: null },
      data: { deletedAt },
    });

    logger.info("Merchant data soft-deleted", { orgId, storeCount: storeIds.length });
    return true;
  }

  // ============================================================================
  // HARD DELETE (après 60j)
  // ============================================================================

  static async hardDeleteMerchantData(orgId: string) {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      include: { stores: { select: { id: true } } },
    });

    if (!org) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    const storeIds = org.stores.map((s) => s.id);

    // Ordre imposé par les FK : OrderItem.product est en Restrict, donc les
    // commandes (et leurs items en cascade) partent avant les produits.
    await db.order.deleteMany({ where: { storeId: { in: storeIds } } });
    await db.product.deleteMany({ where: { storeId: { in: storeIds } } });
    await db.category.deleteMany({ where: { storeId: { in: storeIds } } });
    await db.store.deleteMany({ where: { orgId } });

    // Les Customer sont globaux (partagés entre commerçants) : jamais supprimés ici.

    await db.organization.update({
      where: { id: orgId },
      data: { isArchivedPermanently: true },
    });

    logger.info("Merchant data hard-deleted", { orgId, storeCount: storeIds.length });
    return true;
  }

  // ============================================================================
  // RESTORATION
  // ============================================================================

  static async restoreFromBackup(orgId: string, adminId: string) {
    const org = await db.organization.findUnique({ where: { id: orgId } });

    if (!org) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    const archive = await db.merchantArchive.findUnique({
      where: { organizationId: orgId },
    });

    if (!archive) {
      throw new ApiError(404, "Backup non trouvé pour ce commerçant", "NOT_FOUND");
    }

    if (archive.isRestored) {
      throw new ApiError(400, "Ce backup a déjà été restauré", "ALREADY_RESTORED");
    }

    if (archive.restorationDeadline < new Date()) {
      throw new ApiError(410, "La date limite de restauration a expiré", "RESTORATION_DEADLINE_PASSED");
    }

    if (org.isArchivedPermanently) {
      await this.recreateFromArchive(orgId, archive);
    } else {
      await this.undoSoftDelete(orgId);
    }

    const updated = await db.organization.update({
      where: { id: orgId },
      data: {
        status: "ACTIVE",
        closureReason: null,
        closureDate: null,
        closedUntil: null,
        archiveBackupId: null,
        isArchivedPermanently: false,
      },
    });

    await db.merchantArchive.update({
      where: { organizationId: orgId },
      data: {
        isRestored: true,
        restoredAt: new Date(),
        restoredByAdminId: adminId,
      },
    });

    logger.info("Merchant restored from backup", { orgId, adminId, recreated: org.isArchivedPermanently });
    return updated;
  }

  private static async undoSoftDelete(orgId: string) {
    const stores = await db.store.findMany({
      where: { orgId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    await db.store.updateMany({
      where: { orgId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    await db.product.updateMany({
      where: { storeId: { in: storeIds }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    await db.order.updateMany({
      where: { storeId: { in: storeIds }, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  }

  // Recrée le catalogue après un hard-delete. Les commandes restent dans
  // l'archive JSON : les rejouer dupliquerait paiements et factures.
  private static async recreateFromArchive(
    orgId: string,
    archive: { storesData: unknown; productsData: unknown }
  ) {
    const stores = asRecords(archive.storesData);
    const catalog = (archive.productsData ?? {}) as Record<string, unknown>;
    const categories = asRecords(catalog.categories);
    const products = asRecords(catalog.products);

    if (stores.length === 0) {
      throw new ApiError(422, "Le backup ne contient aucune boutique à restaurer", "EMPTY_BACKUP");
    }

    await db.store.createMany({
      data: stores.map((store) => ({ ...withoutTimestamps(store), orgId })) as any,
      skipDuplicates: true,
    });

    if (categories.length > 0) {
      await db.category.createMany({
        data: categories.map(withoutTimestamps) as any,
        skipDuplicates: true,
      });
    }

    if (products.length > 0) {
      await db.product.createMany({
        data: products.map(withoutTimestamps) as any,
        skipDuplicates: true,
      });
    }

    logger.info("Merchant catalog recreated from archive", {
      orgId,
      stores: stores.length,
      categories: categories.length,
      products: products.length,
    });
  }

  // ============================================================================
  // JOB AUTOMATIQUE
  // ============================================================================

  static async checkAndApplyAutomaticActions() {
    const now = new Date();

    const closedOrgs = await db.organization.findMany({
      where: {
        status: "CLOSED",
        closedUntil: { lte: now },
        isArchivedPermanently: false,
      },
      select: { id: true },
    });

    let processed = 0;

    for (const org of closedOrgs) {
      try {
        logger.info("Auto-triggering hard delete for organization", { orgId: org.id });
        await this.hardDeleteMerchantData(org.id);
        processed += 1;
      } catch (err) {
        // Un échec sur un commerçant ne doit pas bloquer les suivants
        logger.error("Hard delete failed for organization", {
          orgId: org.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    logger.info("Automatic closure actions completed", {
      candidates: closedOrgs.length,
      processed,
    });
    return processed;
  }
}
