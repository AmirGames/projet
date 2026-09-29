import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../../middleware/auth";
import { MerchantClosureService } from "../merchants/merchant-closure.service";
import { logger } from "../../config/logger";
import { getQueryString, getQueryNumber, isSystemAdmin } from "./shared";

const router = Router();

// GET /admin/merchants - List all merchants
router.get("/merchants", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = getQueryNumber(req.query.limit, 20);
    const offset = getQueryNumber(req.query.offset, 0);
    const status = getQueryString(req.query.status, "");

    const where: any = {};
    if (status) where.status = status;

    const merchants = (await db.organization.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        stores: { select: { id: true, name: true } },
        memberships: { select: { id: true, role: true, user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
    })) as any[];

    const total = await db.organization.count({ where });

    res.json({
      merchants,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/merchants/:orgId - Get merchant details
router.get("/merchants/:orgId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const merchant = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        stores: true,
        memberships: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
        tickets: { take: 5, orderBy: { createdAt: "desc" } },
        commissionHistory: { take: 12, orderBy: { period: "desc" } },
      },
    }) as any;

    if (!merchant) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    // Get revenue stats
    const storeIds = (merchant.stores || []).map((s: any) => s.id);
    const orders = await db.order.findMany({
      where: {
        storeId: {
          in: storeIds,
        },
      },
      select: { totalAmount: true, createdAt: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const platformFee = await db.systemConfig.findFirst();
    const feePercent = platformFee?.platformFeePercent || 5;
    const commission = totalRevenue * (Number(feePercent) / 100);

    res.json({
      ...merchant,
      stats: {
        totalRevenue,
        commission,
        ordersCount: orders.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/merchants/:orgId - Update merchant tier
// Le statut passe obligatoirement par /suspend, /unsuspend et /close : eux seuls
// créent le backup, la raison et l'échéance de suppression.
router.patch("/merchants/:orgId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      tier: z.enum(["FREE", "PREMIUM", "PRO"]).optional(),
    });

    if (req.body?.status !== undefined) {
      throw new ApiError(
        400,
        "Le statut se change via /suspend, /unsuspend, /close ou /restore-from-backup",
        "USE_STATUS_ENDPOINTS"
      );
    }

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    const merchant = await db.organization.update({
      where: { id: orgId },
      data: body,
    });

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UPDATE_MERCHANT",
        target: orgId,
        changes: body as any,
      },
    });

    res.json(merchant);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/suspend - Suspend merchant account
router.post("/merchants/:orgId/suspend", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      reason: z.string().min(1, "La raison est requise"),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    const updated = await MerchantClosureService.suspend(orgId, body.reason);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "SUSPEND_MERCHANT",
        target: orgId,
        changes: { reason: body.reason } as any,
      },
    });

    logger.info("Merchant suspended by admin", { orgId, adminId, reason: body.reason });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/unsuspend - Unsuspend merchant account
router.post("/merchants/:orgId/unsuspend", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const adminId = (req as any).userId;

    const updated = await MerchantClosureService.unsuspend(orgId);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UNSUSPEND_MERCHANT",
        target: orgId,
        changes: {} as any,
      },
    });

    logger.info("Merchant unsuspended by admin", { orgId, adminId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/close - Close merchant account
router.post("/merchants/:orgId/close", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      reason: z.string().min(1, "La raison est requise"),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    const result = await MerchantClosureService.close(orgId, body.reason);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "CLOSE_MERCHANT",
        target: orgId,
        changes: {
          reason: body.reason,
          archiveId: result.archive.id,
        } as any,
      },
    });

    logger.info("Merchant closed by admin", { orgId, adminId, reason: body.reason, archiveId: result.archive.id });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /admin/merchants/:orgId/restore-from-backup - Restore merchant from backup
router.post("/merchants/:orgId/restore-from-backup", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const adminId = (req as any).userId;

    const updated = await MerchantClosureService.restoreFromBackup(orgId, adminId);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "RESTORE_MERCHANT",
        target: orgId,
        changes: {} as any,
      },
    });

    logger.info("Merchant restored from backup by admin", { orgId, adminId });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets - List all tickets
// GET /admin/stores - Toutes les boutiques de la plateforme
router.get("/stores", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recherche = (req.query.search as string) || "";
    const limit = Math.min(parseInt((req.query.limit as string) || "50") || 50, 200);
    const offset = parseInt((req.query.offset as string) || "0") || 0;

    const where: any = { deletedAt: null };

    if (recherche) {
      where.OR = [
        { name: { contains: recherche, mode: "insensitive" } },
        { city: { contains: recherche, mode: "insensitive" } },
        { slug: { contains: recherche, mode: "insensitive" } },
      ];
    }

    const [boutiques, total] = await Promise.all([
      db.store.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          org: { select: { id: true, name: true, status: true } },
          _count: { select: { products: true, orders: true } },
        },
      }),
      db.store.count({ where }),
    ]);

    res.json({
      stores: boutiques.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        city: b.city,
        isOpen: b.isOpen,
        rating: Number(b.rating),
        createdAt: b.createdAt,
        organization: b.org,
        productCount: b._count.products,
        orderCount: b._count.orders,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
