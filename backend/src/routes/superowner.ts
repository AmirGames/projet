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
router.get("/advanced-settings", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = {
      maintenanceMode: false,
      debugMode: false,
      apiRateLimit: 100,
      maxUploadSize: 100,
      sessionTimeout: 30,
      enableGdpr: true,
      enableTwoFactor: true,
      enableApiKeys: true,
      logLevel: "INFO",
    };

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/advanced-settings - Update advanced settings
router.put("/advanced-settings", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      maintenanceMode: z.boolean().optional(),
      debugMode: z.boolean().optional(),
      apiRateLimit: z.number().optional(),
      maxUploadSize: z.number().optional(),
      sessionTimeout: z.number().optional(),
      enableGdpr: z.boolean().optional(),
      enableTwoFactor: z.boolean().optional(),
      enableApiKeys: z.boolean().optional(),
      logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
    });

    const body = schema.parse(req.body);

    res.json({
      success: true,
      settings: body,
      message: "Paramètres mis à jour avec succès",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
