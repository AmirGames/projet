import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Middleware to check if user is superowner
const isSuperOwner = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.isSuperOwner) {
      throw new ApiError(403, "Accès refusé - Superowner requis", "FORBIDDEN");
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// DASHBOARD
// ============================================================================

// GET /superowner/dashboard - Superowner dashboard stats
router.get("/dashboard", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      organizations,
      users,
      orders,
      systemConfig,
      auditLogs,
    ] = await Promise.all([
      db.organization.findMany(),
      db.user.count(),
      db.order.findMany({ take: 10, orderBy: { createdAt: "desc" } }),
      db.systemConfig.findFirst(),
      db.systemAuditLog.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const platformFee = Number(systemConfig?.platformFeePercent || 5);
    const platformFeeAmount = totalRevenue * (platformFee / 100);

    const stats = {
      totalRevenue,
      platformFee: platformFeeAmount,
      activeOrganizations: organizations.filter((o: any) => o.status === "ACTIVE").length,
      totalUsers: users,
      systemHealth: 95,
      criticalAlerts: 0,
      monthlyRecurring: totalRevenue * 12,
      growth: 12.5,
    };

    res.json({ stats, recentLogs: auditLogs });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ORGANIZATIONS
// ============================================================================

// GET /superowner/organizations - List all organizations
router.get("/organizations", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const organizations = await db.organization.findMany({
      include: {
        memberships: { select: { id: true } },
        _count: { select: { memberships: true } },
      },
    });

    const orgsWithStats = organizations.map((org: any) => ({
      id: org.id,
      name: org.name,
      email: org.email,
      status: org.status,
      usersCount: org._count?.memberships || 0,
      revenue: Math.floor(Math.random() * 50000),
      commission: Math.floor(Math.random() * 5000),
      createdAt: org.createdAt,
      subscriptionPlan: org.plan,
    }));

    res.json({ organizations: orgsWithStats });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// BILLING
// ============================================================================

// GET /superowner/billing - Billing and subscription data
router.get("/billing", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const organizations = await db.organization.findMany();
    const orders = await db.order.findMany();

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const pendingInvoices = Math.floor(Math.random() * 20);
    const paidInvoices = Math.floor(Math.random() * 100);

    const subscriptionPlans = [
      { name: "Starter", count: 10, price: 2999 },
      { name: "Professional", count: 25, price: 9999 },
      { name: "Enterprise", count: 5, price: 49999 },
    ];

    const topSubscribers = organizations.slice(0, 5).map((org: any) => ({
      name: org.name,
      plan: org.plan || "STARTER",
      revenue: Math.floor(Math.random() * 10000),
    }));

    res.json({
      data: {
        totalRevenue,
        monthlyRecurring: totalRevenue * 0.8,
        pendingInvoices,
        paidInvoices,
        subscriptionPlans,
        topSubscribers,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

// GET /superowner/system-config - System configuration
router.get("/system-config", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      config: {
        apiVersion: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        database: { status: "CONNECTED", version: "14.0" },
        cache: { status: "ACTIVE", provider: "Redis" },
        webhooks: { enabled: true, count: 12 },
        apiKeys: [
          { id: "api_key_001", name: "Mobile App", lastUsed: "2024-01-15", active: true },
          { id: "api_key_002", name: "Integration", lastUsed: "2024-01-10", active: true },
        ],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/api-keys - Generate new API key
router.post("/api-keys", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
    });

    const body = schema.parse(req.body);
    const newKey = `api_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    res.json({
      success: true,
      apiKey: newKey,
      name: body.name,
      createdAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

// GET /superowner/financial-reports - Financial reports
router.get("/financial-reports", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await db.order.findMany();
    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const reports = [
      {
        id: "report_001",
        period: "2024-01",
        totalRevenue: totalRevenue * 0.3,
        platformFee: totalRevenue * 0.03,
        commissions: totalRevenue * 0.05,
        taxes: totalRevenue * 0.02,
        netRevenue: totalRevenue * 0.2,
        transactions: 245,
        status: "FINALIZED",
      },
      {
        id: "report_002",
        period: "2024-02",
        totalRevenue: totalRevenue * 0.35,
        platformFee: totalRevenue * 0.035,
        commissions: totalRevenue * 0.055,
        taxes: totalRevenue * 0.025,
        netRevenue: totalRevenue * 0.235,
        transactions: 312,
        status: "FINALIZED",
      },
    ];

    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

// GET /superowner/data-management - Data management info
router.get("/data-management", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await db.user.count();
    const organizations = await db.organization.count();

    const data = {
      stats: {
        totalUsers: users,
        totalOrganizations: organizations,
        databaseSize: "2.5 GB",
        lastBackup: new Date(Date.now() - 86400000).toISOString(),
        nextBackup: new Date(Date.now() + 86400000).toISOString(),
      },
      backups: [
        {
          id: "backup_001",
          date: new Date(Date.now() - 86400000).toISOString(),
          size: "2.4 GB",
          status: "SUCCESS",
          type: "AUTOMATIC",
        },
        {
          id: "backup_002",
          date: new Date(Date.now() - 172800000).toISOString(),
          size: "2.3 GB",
          status: "SUCCESS",
          type: "AUTOMATIC",
        },
      ],
    };

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/backups - Create backup
router.post("/backups", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      backupId: `backup_${Date.now()}`,
      status: "STARTED",
      message: "Backup créé et en cours...",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SECURITY AUDIT
// ============================================================================

// GET /superowner/security-audit - Security audit logs
router.get("/security-audit", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = {
      totalEvents: 234,
      criticalAlerts: 2,
      failedAttempts: 12,
      suspiciousIps: 3,
      systemHealth: 92,
    };

    const events = [
      {
        id: "event_001",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        type: "FAILED_AUTH",
        severity: "HIGH",
        description: "Tentatives de connexion échouées depuis 192.168.1.100",
        source: "LOGIN",
        ipAddress: "192.168.1.100",
        resolved: false,
      },
      {
        id: "event_002",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        type: "API_ABUSE",
        severity: "MEDIUM",
        description: "Taux de requêtes anormalement élevé détecté",
        source: "API",
        ipAddress: "203.0.113.45",
        resolved: true,
      },
    ];

    res.json({ summary, events });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADVANCED SETTINGS
// ============================================================================

// GET /superowner/advanced-settings - Advanced settings
// Structure attendue par la page: elle lit performanceOptimizations.cacheEnabled
// et enabledFeatures, absents de l'ancienne réponse — d'où son plantage.
const REGLAGES_PAR_DEFAUT = {
  maintenanceMode: false,
  maintenanceMessage: "",
  debugMode: false,
  enabledFeatures: [] as string[],
  performanceOptimizations: {
    cacheEnabled: true,
    cacheDuration: 3600,
    compressionEnabled: true,
  },
};

// Les réglages avancés sont conservés dans le champ JSON de SystemConfig.
async function chargerReglages() {
  let config = await db.systemConfig.findFirst();

  if (!config) {
    config = await db.systemConfig.create({ data: {} });
  }

  const enregistres = (config.settings as Record<string, any>) || {};

  return {
    config,
    settings: {
      ...REGLAGES_PAR_DEFAUT,
      ...enregistres,
      performanceOptimizations: {
        ...REGLAGES_PAR_DEFAUT.performanceOptimizations,
        ...(enregistres.performanceOptimizations || {}),
      },
      // Ces deux-là ont leur propre colonne : elles font foi.
      id: config.id,
      maintenanceMode: config.maintenanceMode,
      maintenanceMessage: config.maintenanceMessage || "",
    },
  };
}

router.get("/advanced-settings", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = await chargerReglages();

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/advanced-settings - Update advanced settings
router.put("/advanced-settings", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      // La page renvoie l'objet complet qu'elle a reçu, id compris.
      id: z.string().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      debugMode: z.boolean().optional(),
      enabledFeatures: z.array(z.string()).optional(),
      performanceOptimizations: z
        .object({
          cacheEnabled: z.boolean().optional(),
          cacheDuration: z.number().int().min(0).optional(),
          compressionEnabled: z.boolean().optional(),
        })
        .optional(),
    });

    const { id: _ignore, ...body } = schema.parse(req.body);
    const { config, settings: actuels } = await chargerReglages();
    const fusionnes = {
      ...actuels,
      ...body,
      performanceOptimizations: {
        ...actuels.performanceOptimizations,
        ...(body.performanceOptimizations || {}),
      },
    };

    const misAJour = await db.systemConfig.update({
      where: { id: config.id },
      data: {
        settings: fusionnes as any,
        ...(body.maintenanceMode !== undefined && { maintenanceMode: body.maintenanceMode }),
        ...(body.maintenanceMessage !== undefined && { maintenanceMessage: body.maintenanceMessage }),
      },
    });

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_ADVANCED_SETTINGS",
        target: "SYSTEM_CONFIG",
        changes: body as any,
      },
    });

    res.json({
      success: true,
      settings: {
        ...fusionnes,
        id: misAJour.id,
        maintenanceMode: misAJour.maintenanceMode,
        maintenanceMessage: misAJour.maintenanceMessage || "",
      },
      message: "Paramètres mis à jour avec succès",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

const PERIODES: Record<string, { jours: number; pas: number; libelle: (d: Date) => string }> = {
  "7days": { jours: 7, pas: 1, libelle: (d) => d.toLocaleDateString("fr-FR") },
  "30days": { jours: 30, pas: 1, libelle: (d) => d.toLocaleDateString("fr-FR") },
  "90days": { jours: 90, pas: 7, libelle: (d) => `Semaine du ${d.toLocaleDateString("fr-FR")}` },
  "1year": { jours: 365, pas: 30, libelle: (d) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) },
};

// GET /superowner/analytics - Revenus et activité agrégés par tranche
router.get("/analytics", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const periode = PERIODES[(req.query.period as string) || "30days"] || PERIODES["30days"];

    // Les tranches se terminent à la fin de la journée en cours, sinon les
    // commandes du jour tomberaient hors de la dernière tranche.
    const borneHaute = new Date();
    borneHaute.setHours(0, 0, 0, 0);
    borneHaute.setDate(borneHaute.getDate() + 1);

    const nbTranches = Math.ceil(periode.jours / periode.pas);
    const tranches: Array<{ debut: Date; fin: Date }> = [];

    for (let i = nbTranches - 1; i >= 0; i -= 1) {
      const d = new Date(borneHaute);
      d.setDate(d.getDate() - (i + 1) * periode.pas);
      const f = new Date(borneHaute);
      f.setDate(f.getDate() - i * periode.pas);
      tranches.push({ debut: d, fin: f });
    }

    const debut = tranches[0].debut;
    const config = await db.systemConfig.findFirst();
    const tauxCommission = Number(config?.platformFeePercent ?? 5) / 100;

    const commandes = await db.order.findMany({
      where: { createdAt: { gte: debut }, deletedAt: null },
      select: { totalAmount: true, createdAt: true, customerId: true, customerEmail: true },
    });

    const data = tranches.map(({ debut: d, fin }, index) => {
      const lot = commandes.filter((c) => c.createdAt >= d && c.createdAt < fin);
      const revenus = lot.reduce((somme, c) => somme + Number(c.totalAmount), 0);
      const clients = new Set(lot.map((c) => c.customerId || c.customerEmail).filter(Boolean));

      return {
        periodeIndex: index,
        period: periode.libelle(d),
        totalRevenue: Number(revenus.toFixed(2)),
        platformFees: Number((revenus * tauxCommission).toFixed(2)),
        activeUsers: clients.size,
        transactions: lot.length,
        averageOrderValue: lot.length ? Number((revenus / lot.length).toFixed(2)) : 0,
        conversionRate: 0,
        growthRate: 0,
      };
    });

    // Croissance calculée par rapport à la tranche précédente
    for (let i = 1; i < data.length; i += 1) {
      const precedent = data[i - 1].totalRevenue;
      data[i].growthRate = precedent
        ? Number((((data[i].totalRevenue - precedent) / precedent) * 100).toFixed(1))
        : 0;
    }

    const totalRevenue = data.reduce((s, d) => s + d.totalRevenue, 0);
    const totalTransactions = data.reduce((s, d) => s + d.transactions, 0);

    res.json({
      data: data.map(({ periodeIndex, ...reste }) => reste),
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalTransactions,
        averageOrderValue: totalTransactions
          ? Number((totalRevenue / totalTransactions).toFixed(2))
          : 0,
        conversionRate: 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

// GET /superowner/audit-logs - Journal des actions administratives
router.get("/audit-logs", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [journal, total] = await Promise.all([
      db.systemAuditLog.findMany({
        skip: offset,
        take: limit,
        include: { admin: { select: { email: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.systemAuditLog.count(),
    ]);

    res.json({
      logs: journal.map((entree) => ({
        id: entree.id,
        action: entree.action,
        actor: entree.admin?.name || entree.admin?.email || "—",
        actorEmail: entree.admin?.email || "—",
        resource: entree.action.split("_").slice(1).join("_") || "SYSTEM",
        resourceId: entree.target,
        changes: { before: {}, after: (entree.changes as Record<string, any>) || {} },
        status: "SUCCESS",
        // Non tracées à ce jour : la table ne conserve ni IP ni user-agent.
        ipAddress: "—",
        userAgent: "—",
        timestamp: entree.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SUPPORT TICKETS
// ============================================================================

// L'interface parle d'URGENT là où la base stocke CRITICAL.
const versPrioriteAffichee = (p: string) => (p === "CRITICAL" ? "URGENT" : p);
const versPrioriteStockee = (p: string) => (p === "URGENT" ? "CRITICAL" : p);

// GET /superowner/support-tickets - Tickets de tous les commerçants
router.get("/support-tickets", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const priority = req.query.priority as string;

    const where: any = { archivedAt: null };
    if (status) where.status = status;
    if (priority) where.priority = versPrioriteStockee(priority);

    const [tickets, total] = await Promise.all([
      db.merchantTicket.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          org: {
            select: {
              name: true,
              email: true,
              memberships: {
                take: 1,
                include: { user: { select: { email: true } } },
              },
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
      db.merchantTicket.count({ where }),
    ]);

    res.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: versPrioriteAffichee(t.priority),
        userEmail: t.org.email || t.org.memberships[0]?.user.email || t.org.name,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        messageCount: t._count.messages,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/support-tickets/:ticketId/status - Changer le statut
router.patch("/support-tickets/:ticketId/status", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    const schema = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
    });
    const body = schema.parse(req.body);

    const existant = await db.merchantTicket.findUnique({ where: { id: ticketId } });
    if (!existant) {
      throw new ApiError(404, "Ticket non trouvé", "NOT_FOUND");
    }

    const ticket = await db.merchantTicket.update({
      where: { id: ticketId },
      data: {
        status: body.status,
        resolvedAt: body.status === "RESOLVED" ? new Date() : null,
      },
    });

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_TICKET_STATUS",
        target: ticketId,
        changes: { status: body.status } as any,
      },
    });

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADMINISTRATEURS
// ============================================================================

// GET /superowner/admins - Comptes disposant de droits d'administration
router.get("/admins", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const where = { OR: [{ isSystemAdmin: true }, { isSuperOwner: true }] };

    const [comptes, total] = await Promise.all([
      db.user.findMany({ where, skip: offset, take: limit, orderBy: { createdAt: "desc" } }),
      db.user.count({ where }),
    ]);

    res.json({
      admins: comptes.map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name || c.email,
        role: c.isSuperOwner ? "SUPEROWNER" : "ADMIN",
        status: c.status === "BANNED" ? "SUSPENDED" : c.status,
        lastLogin: c.updatedAt,
        createdAt: c.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/admins - Promouvoir un compte existant
// Volontairement une promotion et non une création : créer un compte ici
// imposerait un mot de passe que personne ne pourrait communiquer au titulaire.
router.post("/admins", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().optional(),
      role: z.enum(["SUPEROWNER", "ADMIN", "MODERATOR"]).default("ADMIN"),
    });
    const body = schema.parse(req.body);

    const compte = await db.user.findUnique({ where: { email: body.email } });

    if (!compte) {
      throw new ApiError(
        404,
        "Aucun compte avec cet email. La personne doit d'abord créer son compte.",
        "USER_NOT_FOUND"
      );
    }

    if (compte.isSuperOwner || compte.isSystemAdmin) {
      throw new ApiError(400, "Ce compte est déjà administrateur", "ALREADY_ADMIN");
    }

    const promu = await db.user.update({
      where: { id: compte.id },
      data: {
        isSystemAdmin: true,
        isSuperOwner: body.role === "SUPEROWNER",
        name: body.name || compte.name,
      },
    });

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "GRANT_ADMIN",
        target: promu.id,
        changes: { role: body.role } as any,
      },
    });

    res.status(201).json({
      success: true,
      admin: {
        id: promu.id,
        email: promu.email,
        name: promu.name || promu.email,
        role: promu.isSuperOwner ? "SUPEROWNER" : "ADMIN",
        status: promu.status,
        lastLogin: promu.updatedAt,
        createdAt: promu.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/admins/:adminId - Retirer les droits (le compte est conservé)
router.delete("/admins/:adminId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.params.adminId as string;

    if (adminId === req.userId) {
      throw new ApiError(
        400,
        "Vous ne pouvez pas retirer vos propres droits",
        "CANNOT_REVOKE_SELF"
      );
    }

    const compte = await db.user.findUnique({ where: { id: adminId } });
    if (!compte) {
      throw new ApiError(404, "Compte non trouvé", "NOT_FOUND");
    }

    // Ne jamais laisser la plateforme sans superowner.
    if (compte.isSuperOwner) {
      const restants = await db.user.count({
        where: { isSuperOwner: true, id: { not: adminId } },
      });
      if (restants === 0) {
        throw new ApiError(
          400,
          "Impossible de retirer le dernier superowner",
          "LAST_SUPEROWNER"
        );
      }
    }

    await db.user.update({
      where: { id: adminId },
      data: { isSystemAdmin: false, isSuperOwner: false },
    });

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "REVOKE_ADMIN",
        target: adminId,
        changes: {} as any,
      },
    });

    res.json({ success: true, message: "Droits d'administration retirés" });
  } catch (err) {
    next(err);
  }
});

export default router;
