import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { voitLesFinances } from "../auth/permissions-plateforme.service";
import { authMiddleware } from "../auth/auth.middleware";
import { getQueryString, isSystemAdmin } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";

const router = Router();

// GET /admin/commissions - Get commission history
router.get("/commissions", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 10000);
    const offset = decalage(req.query.offset);
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

// GET /admin/access-logs - Journal des accès (connexions, actions sensibles)
router.get("/access-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 100, 500);
    const offset = decalage(req.query.offset);
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

// GET /admin/stats - Get system statistics
router.get("/stats", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
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
      // Réservé aux rôles qui ont « Facturation » (voir voitLesFinances).
      revenue: (await voitLesFinances(req.compte))
        ? {
            total: Number(revenueTotale._sum.totalAmount) || 0,
            completed: Number(revenueTerminee._sum.totalAmount) || 0,
          }
        : null,
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
    const limit = limiteBornee(req.query.limit, 50, 200);
    const offset = decalage(req.query.offset);

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
