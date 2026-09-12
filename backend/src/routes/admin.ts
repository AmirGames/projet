import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Helper to safely get string query params
const getQueryString = (value: any, defaultValue: string): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] || defaultValue;
  return defaultValue;
};

// Helper to safely get numeric query params
const getQueryNumber = (value: any, defaultValue: number): number => {
  const str = getQueryString(value, String(defaultValue));
  const num = parseInt(str, 10);
  return isNaN(num) ? defaultValue : num;
};

// Middleware to check if user is system admin
const isSystemAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user?.isSystemAdmin) {
      throw new ApiError(403, "Accès refusé", "FORBIDDEN");
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

// GET /admin/config - Get system configuration
router.get("/config", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await db.systemConfig.findFirst();

    if (!config) {
      config = await db.systemConfig.create({
        data: {},
      });
    }

    res.json(config);
  } catch (err) {
    next(err);
  }
});

// PUT /admin/config - Update system configuration
router.put("/config", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      minOrderAmount: z.number().optional(),
      maxOrderAmount: z.number().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    let config = await db.systemConfig.findFirst();
    if (!config) {
      config = await db.systemConfig.create({ data: {} });
    }

    const updated = await db.systemConfig.update({
      where: { id: config.id },
      data: body,
    });

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UPDATE_SYSTEM_CONFIG",
        target: "SYSTEM_CONFIG",
        changes: body as any,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// MERCHANTS MANAGEMENT
// ============================================================================

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

// PATCH /admin/merchants/:orgId - Update merchant status
router.patch("/merchants/:orgId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      status: z.enum(["ACTIVE", "SUSPENDED", "CLOSED"]).optional(),
      tier: z.enum(["FREE", "PREMIUM", "PRO"]).optional(),
    });

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

// ============================================================================
// TICKETS MANAGEMENT
// ============================================================================

// GET /admin/tickets - List all tickets
router.get("/tickets", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = getQueryNumber(req.query.limit, 20);
    const offset = getQueryNumber(req.query.offset, 0);
    const status = getQueryString(req.query.status, "");
    const priority = getQueryString(req.query.priority, "");

    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = (await db.merchantTicket.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        org: { select: { id: true, name: true } },
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    })) as any[];

    const total = await db.merchantTicket.count({ where });

    res.json({
      tickets,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/tickets/:ticketId - Update ticket
router.patch("/tickets/:ticketId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    const ticket = await db.merchantTicket.update({
      where: { id: ticketId },
      data: {
        ...body,
        resolvedAt: body.status === "RESOLVED" ? new Date() : undefined,
      },
      include: { org: true },
    });

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UPDATE_TICKET",
        target: ticketId,
        changes: body as any,
      },
    });

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// COMMISSIONS & BILLING
// ============================================================================

// GET /admin/commissions - Get commission history
router.get("/commissions", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = getQueryNumber(req.query.limit, 20);
    const offset = getQueryNumber(req.query.offset, 0);
    const period = getQueryString(req.query.period, "");

    const where: any = {};
    if (period) where.period = period;

    const commissions = (await db.commissionHistory.findMany({
      where,
      skip: offset,
      take: limit,
      include: { org: { select: { id: true, name: true } } },
      orderBy: { period: "desc" },
    })) as any[];

    const total = await db.commissionHistory.count({ where });
    const totalAmount = await db.commissionHistory.aggregate({
      _sum: { amount: true },
      where,
    });

    res.json({
      commissions,
      summary: {
        totalAmount: totalAmount._sum.amount || 0,
        count: total,
      },
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SYSTEM STATISTICS
// ============================================================================

// GET /admin/stats - Get system statistics
router.get("/stats", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Merchants stats
    const totalMerchants = await db.organization.count();
    const activeMerchants = await db.organization.count({
      where: { status: "ACTIVE" },
    });
    const suspendedMerchants = await db.organization.count({
      where: { status: "SUSPENDED" },
    });

    // Stores stats
    const totalStores = await db.store.count();
    const activeStores = await db.store.count({
      where: { isOpen: true },
    });

    // Orders stats
    const totalOrders = await db.order.count();
    const pendingOrders = await db.order.count({
      where: { status: "PENDING" },
    });
    const completedOrders = await db.order.count({
      where: { status: "COMPLETED" },
    });

    // Revenue stats
    const totalRevenue = await db.order.aggregate({
      _sum: { totalAmount: true },
    });
    const completedRevenue = await db.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: "COMPLETED" },
    });

    // Customers stats
    const totalCustomers = await db.customer.count();
    const totalUsers = await db.user.count();

    // Payment stats
    const pendingPayments = await db.order.count({
      where: { paymentStatus: "PENDING" },
    });
    const successfulPayments = await db.order.count({
      where: { paymentStatus: "SUCCEEDED" },
    });

    // Tickets
    const openTickets = await db.merchantTicket.count({
      where: { status: "OPEN" },
    });
    const criticalTickets = await db.merchantTicket.count({
      where: { priority: "CRITICAL" },
    });

    // Products
    const totalProducts = await db.product.count();
    const draftProducts = await db.product.count({
      where: { status: "DRAFT" },
    });

    const config = await db.systemConfig.findFirst();

    res.json({
      merchants: {
        total: totalMerchants,
        active: activeMerchants,
        suspended: suspendedMerchants,
      },
      stores: {
        total: totalStores,
        active: activeStores,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        completed: completedOrders,
      },
      revenue: {
        total: Number(totalRevenue._sum.totalAmount) || 0,
        completed: Number(completedRevenue._sum.totalAmount) || 0,
      },
      users: {
        total: totalUsers,
      },
      customers: {
        total: totalCustomers,
      },
      payments: {
        pending: pendingPayments,
        successful: successfulPayments,
      },
      products: {
        total: totalProducts,
        draft: draftProducts,
      },
      tickets: {
        open: openTickets,
        critical: criticalTickets,
      },
      config: {
        platformFeePercent: config?.platformFeePercent || 5,
        maintenanceMode: config?.maintenanceMode || false,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/audit-logs - Get audit logs
router.get("/audit-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = getQueryNumber(req.query.limit, 50);
    const offset = getQueryNumber(req.query.offset, 0);

    const logs = await db.systemAuditLog.findMany({
      skip: offset,
      take: limit,
      include: { admin: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const total = await db.systemAuditLog.count();

    res.json({
      logs,
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
