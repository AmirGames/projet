import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { MerchantClosureService } from "../services/merchant-closure.service";
import { TicketMessageService } from "../services/ticket-message.service";

const LIBELLES_STATUT_TICKET: Record<string, string> = {
  OPEN: "rouvert",
  IN_PROGRESS: "pris en charge par le support",
  RESOLVED: "résolu",
  CLOSED: "clôturé",
};

const LIBELLES_PRIORITE_TICKET: Record<string, string> = {
  LOW: "basse",
  MEDIUM: "normale",
  HIGH: "haute",
  CRITICAL: "urgente",
};
import { logger } from "../config/logger";
import { invalidateMaintenanceCache } from "../middleware/maintenance";

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
// Le compte est déjà lu par `authMiddleware`, qui refuse en 401 celui qui
// n'existe plus : ici, un refus veut bien dire « pas administrateur », et non
// « compte introuvable » — c'est ce que les traces laissaient croire.
const isSystemAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.compte?.isSystemAdmin) {
    return next(new ApiError(403, "Accès refusé", "FORBIDDEN"));
  }

  next();
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
      selectedTheme: z.string().optional(),
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

    // Le middleware met le réglage en cache : forcer sa relecture.
    invalidateMaintenanceCache();

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

// ============================================================================
// TICKETS MANAGEMENT
// ============================================================================

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

router.get("/tickets", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = getQueryNumber(req.query.limit, 20);
    const offset = getQueryNumber(req.query.offset, 0);
    const status = getQueryString(req.query.status, "");
    const priority = getQueryString(req.query.priority, "");

    const archived = getQueryString(req.query.archived, "") === "true";

    const where: any = { archivedAt: archived ? { not: null } : null };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = (await db.merchantTicket.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        org: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
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

    const avant = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      select: { status: true, priority: true },
    });

    if (!avant) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

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

    // Le commerçant est prévenu du changement, comme d'une réponse.
    const changements: string[] = [];
    if (body.status && body.status !== avant.status) {
      changements.push(LIBELLES_STATUT_TICKET[body.status] || body.status);
    }
    if (body.priority && body.priority !== avant.priority) {
      changements.push(`priorité ${LIBELLES_PRIORITE_TICKET[body.priority] || body.priority}`);
    }

    if (changements.length > 0) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Votre ticket a changé d'état",
        `Ticket « ${ticket.title} » : ${changements.join(", ")}.`
      );
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets/:ticketId/messages - Conversation du ticket
router.get("/tickets/:ticketId/messages", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const messages = await TicketMessageService.list(ticketId);

    res.json({ data: messages, count: messages.length });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/messages - Répondre au commerçant
router.post("/tickets/:ticketId/messages", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({ body: z.string().min(1, "Message requis") });
    const body = schema.parse(req.body);

    const message = await TicketMessageService.add({
      ticketId,
      authorId: (req as any).userId,
      authorRole: "ADMIN",
      body: body.body,
    });

    res.status(201).json({ message: "Réponse envoyée", data: message });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/archive - Archiver un ticket fermé
router.post("/tickets/:ticketId/archive", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const adminId = (req as any).userId;

    const ticket = await TicketMessageService.archive(ticketId);

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "ARCHIVE_TICKET",
        target: ticketId,
        changes: {} as any,
      },
    });

    res.json({ message: "Ticket archivé", data: ticket });
  } catch (err) {
    next(err);
  }
});

// POST /admin/tickets/:ticketId/unarchive - Sortir un ticket des archives
router.post("/tickets/:ticketId/unarchive", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const ticket = await TicketMessageService.unarchive(ticketId);

    res.json({ message: "Ticket désarchivé", data: ticket });
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
// JOURNAL D'ACCÈS & NOTIFICATIONS PLATEFORME
// ============================================================================

// GET /admin/access-logs - Journal des accès (connexions, actions sensibles)
router.get("/access-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(getQueryNumber(req.query.limit, 100), 500);
    const offset = getQueryNumber(req.query.offset, 0);
    const statut = req.query.status as string | undefined;

    const where: any = {};
    if (statut) where.status = statut;

    const [evenements, total] = await Promise.all([
      db.securityEvent.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      db.securityEvent.count({ where }),
    ]);

    // La page attend un utilisateur, une ressource et un statut ; les
    // événements de sécurité portent déjà ces informations.
    const utilisateurs = await db.user.findMany({
      where: { email: { in: [...new Set(evenements.map((e) => e.actor))] } },
      select: { email: true, name: true },
    });
    const parEmail = new Map(utilisateurs.map((u) => [u.email, u]));

    res.json({
      logs: evenements.map((e) => ({
        id: e.id,
        user: { email: e.actor, name: parEmail.get(e.actor)?.name || "—" },
        resource: e.target || "plateforme",
        action: e.action,
        ipAddress: e.ipAddress || "—",
        userAgent: e.userAgent || "—",
        status: e.status === "SUCCESS" ? "SUCCESS" : e.status === "FAILED" ? "FAILED" : "DENIED",
        severity: e.severity,
        details: e.details,
        timestamp: e.createdAt,
        // Mesurée depuis que la requête est chronométrée. `null` pour les
        // entrées d'avant, plutôt qu'un zéro qui ressemble à une mesure.
        duration: e.durationMs,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/notifications - Annonces diffusées par la plateforme
router.get("/notifications", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(getQueryNumber(req.query.limit, 50), 200);
    const offset = getQueryNumber(req.query.offset, 0);

    const where = { type: "PLATFORM_ANNOUNCEMENT" as const };

    const [annonces, total] = await Promise.all([
      db.notification.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: "desc" } }),
      db.notification.count({ where }),
    ]);

    res.json({
      notifications: annonces.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.priority === "CRITICAL" ? "ALERT" : n.priority === "HIGH" ? "WARNING" : "INFO",
        priority: n.priority,
        read: n.isRead,
        createdAt: n.createdAt,
        targetAudience: n.targetAudience,
        actionUrl: n.link || undefined,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

const annonceSchema = z.object({
  title: z.string().min(3, "Titre : 3 caractères minimum"),
  message: z.string().min(3, "Message : 3 caractères minimum"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  targetAudience: z.enum(["ALL", "MERCHANTS", "CUSTOMERS", "DRIVERS"]).optional(),
  actionUrl: z.string().optional(),
});

// POST /admin/notifications - Diffuser une annonce
router.post("/notifications", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = annonceSchema.parse(req.body);
    const auteur = (req as any).actorEmail || "plateforme";

    const annonce = await db.notification.create({
      data: {
        type: "PLATFORM_ANNOUNCEMENT",
        title: body.title,
        message: body.message,
        priority: body.priority || "MEDIUM",
        targetAudience: body.targetAudience || "ALL",
        link: body.actionUrl,
        recipientEmail: auteur,
        sentAt: new Date(),
      },
    });

    res.status(201).json({ message: "Annonce diffusée", notification: annonce });
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/notifications/:notificationId/read - Marquer comme lue
router.patch("/notifications/:notificationId/read", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;

    const existante = await db.notification.findUnique({ where: { id: notificationId } });
    if (!existante) {
      throw new ApiError(404, "Annonce introuvable", "NOT_FOUND");
    }

    const annonce = await db.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({ message: "Annonce marquée comme lue", notification: annonce });
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/notifications/:notificationId - Retirer une annonce
router.delete("/notifications/:notificationId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;

    const existante = await db.notification.findUnique({ where: { id: notificationId } });
    if (!existante) {
      throw new ApiError(404, "Annonce introuvable", "NOT_FOUND");
    }

    await db.notification.delete({ where: { id: notificationId } });

    res.json({ message: "Annonce supprimée" });
  } catch (err) {
    next(err);
  }
});

// GET /admin/tickets/:ticketId - Détail d'un ticket
router.get("/tickets/:ticketId", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;

    const ticket = await db.merchantTicket.findUnique({
      where: { id: ticketId },
      include: {
        org: { select: { id: true, name: true, email: true, status: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!ticket) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

    res.json({ ticket });
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
    // La page consommatrice attend des blocs détaillés : renvoyer de simples
    // nombres la faisait planter sur stats.revenue.total.
    const [
      totalMerchants,
      activeMerchants,
      suspendedMerchants,
      totalStores,
      activeStores,
      totalOrders,
      pendingOrders,
      completedOrders,
      revenueTotale,
      revenueTerminee,
      totalUsers,
      totalCustomers,
      paiementsEnAttente,
      paiementsReussis,
      totalProducts,
      produitsBrouillon,
      ticketsOuverts,
      ticketsCritiques,
      config,
    ] = await Promise.all([
      db.organization.count(),
      db.organization.count({ where: { status: "ACTIVE" } }),
      db.organization.count({ where: { status: "SUSPENDED" } }),
      db.store.count({ where: { deletedAt: null } }),
      db.store.count({ where: { deletedAt: null, isOpen: true } }),
      db.order.count({ where: { deletedAt: null } }),
      db.order.count({ where: { deletedAt: null, status: "PENDING" } }),
      db.order.count({ where: { deletedAt: null, status: "COMPLETED" } }),
      db.order.aggregate({ where: { deletedAt: null }, _sum: { totalAmount: true } }),
      db.order.aggregate({
        where: { deletedAt: null, status: "COMPLETED" },
        _sum: { totalAmount: true },
      }),
      db.user.count(),
      db.customer.count({ where: { deletedAt: null } }),
      db.order.count({ where: { deletedAt: null, paymentStatus: "PENDING" } }),
      db.order.count({ where: { deletedAt: null, paymentStatus: "SUCCEEDED" } }),
      db.product.count({ where: { deletedAt: null } }),
      db.product.count({ where: { deletedAt: null, status: "DRAFT" } }),
      db.merchantTicket.count({ where: { status: "OPEN" } }),
      db.merchantTicket.count({ where: { status: "OPEN", priority: "CRITICAL" } }),
      db.systemConfig.findFirst(),
    ]);

    res.json({
      merchants: { total: totalMerchants, active: activeMerchants, suspended: suspendedMerchants },
      stores: { total: totalStores, active: activeStores },
      orders: { total: totalOrders, pending: pendingOrders, completed: completedOrders },
      // Montants en euros : les colonnes sont des Decimal(10,2).
      revenue: {
        total: Number(revenueTotale._sum.totalAmount) || 0,
        completed: Number(revenueTerminee._sum.totalAmount) || 0,
      },
      users: { total: totalUsers },
      customers: { total: totalCustomers },
      payments: { pending: paiementsEnAttente, successful: paiementsReussis },
      products: { total: totalProducts, draft: produitsBrouillon },
      tickets: { open: ticketsOuverts, critical: ticketsCritiques },
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
