import { db } from "../../services/db";
import type { Prisma } from "@prisma/client";

/** Rapports d'administration en lecture seule : commissions, accès, statistiques, audit. */
export const AdminReportsService = {
  /** Historique des commissions, éventuellement pour une période. */
  async commissions({ period, limit, offset }: { period: string; limit: number; offset: number }) {
    const where: Prisma.CommissionHistoryWhereInput = {};
    if (period) where.period = period;

    const commissions = (await db.commissionHistory.findMany({
      where,
      skip: offset,
      take: limit,
      include: { org: { select: { id: true, name: true } } },
      orderBy: { period: "desc" },
    }));

    const total = await db.commissionHistory.count({ where });
    const totalAmount = await db.commissionHistory.aggregate({
      _sum: { amount: true },
      where,
    });

    return {
      commissions,
      summary: {
        totalAmount: totalAmount._sum.amount || 0,
        count: total,
      },
      pagination: { total, limit, offset },
    };
  },

  /** Journal des accès (connexions, actions sensibles). */
  async journalDesAcces({ statut, limit, offset }: { statut: string | undefined; limit: number; offset: number }) {
    const where: Prisma.SecurityEventWhereInput = {};
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

    return {
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
    };
  },

  /**
   * Statistiques du système. `voitLesFinances` : le demandeur a-t-il le droit
   * « Facturation » ? Sinon le chiffre d'affaires est masqué.
   */
  async statistiques(voitLesFinances: () => Promise<boolean>) {
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

    return {
      merchants: { total: totalMerchants, active: activeMerchants, suspended: suspendedMerchants },
      stores: { total: totalStores, active: activeStores },
      orders: { total: totalOrders, pending: pendingOrders, completed: completedOrders },
      // Montants en euros : les colonnes sont des Decimal(10,2).
      // Réservé aux rôles qui ont « Facturation » (voir voitLesFinances).
      revenue: (await voitLesFinances())
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
    };
  },

  /** Journal d'audit de l'administration. */
  async journalDAudit({ limit, offset }: { limit: number; offset: number }) {
    const logs = await db.systemAuditLog.findMany({
      skip: offset,
      take: limit,
      include: { admin: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    const total = await db.systemAuditLog.count();

    return {
      logs,
      pagination: { total, limit, offset },
    };
  },
};
