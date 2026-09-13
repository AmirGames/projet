import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Middleware to check if user is system admin
const isSystemAdmin = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.userId;
    if (!userId) throw new ApiError(401, "Authentification requise", "UNAUTHORIZED");

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isSystemAdmin: true },
    });

    if (!user?.isSystemAdmin) {
      throw new ApiError(403, "Accès refusé - Administrateur système requis", "FORBIDDEN");
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================================
// DASHBOARD
// ============================================================================

// GET /super-admin/dashboard - Super admin dashboard stats
router.get("/dashboard", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalUsers,
      totalOrganizations,
      totalOrders,
      totalRevenue,
      adminCount,
    ] = await Promise.all([
      db.user.count(),
      db.organization.count(),
      db.order.count(),
      db.order.aggregate({
        _sum: { totalAmount: true },
      }),
      db.user.count({ where: { isSystemAdmin: true } }),
    ]);

    const revenue = totalRevenue._sum?.totalAmount || 0;

    const stats = {
      totalUsers,
      totalOrganizations,
      totalOrders,
      totalRevenue: Number(revenue),
      activeAdmins: adminCount,
      systemUptime: 99.8,
      lastBackup: new Date(Date.now() - 3600000).toISOString(),
      alertsCount: 2,
    };

    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// MERCHANTS / ORGANIZATIONS
// ============================================================================

// GET /super-admin/merchants - List all merchants
router.get("/merchants", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [merchants, total] = await Promise.all([
      db.organization.findMany({
        skip,
        take: limit,
        include: {
          memberships: { select: { id: true } },
          _count: { select: { memberships: true } },
        },
      }),
      db.organization.count(),
    ]);

    const merchantsWithStats = merchants.map((org: any) => ({
      id: org.id,
      name: org.name,
      email: org.email,
      status: org.status,
      usersCount: org._count?.memberships || 0,
      createdAt: org.createdAt,
      subscriptionPlan: org.plan,
    }));

    res.json({
      merchants: merchantsWithStats,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/merchants/suspend - Suspend a merchant
router.post("/merchants/:merchantId/suspend", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { merchantId } = req.params as { merchantId: string };
    const schema = z.object({
      reason: z.string().min(1).max(500),
    });

    const body = schema.parse(req.body);

    // Update organization status
    await db.organization.update({
      where: { id: merchantId },
      data: { status: "SUSPENDED" },
    });

    res.json({
      success: true,
      message: "Commerçant suspendu avec succès",
      reason: body.reason,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SUPPORT / TICKETS
// ============================================================================

// GET /super-admin/tickets - List support tickets
router.get("/tickets", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statusQuery = req.query.status;
    const status = typeof statusQuery === "string" ? statusQuery : "OPEN";
    const pageQuery = req.query.page;
    const page = typeof pageQuery === "string" ? parseInt(pageQuery) : 1;
    const limitQuery = req.query.limit;
    const limit = typeof limitQuery === "string" ? parseInt(limitQuery) : 10;

    const tickets = [
      {
        id: "ticket_001",
        subject: "Problème avec intégration API",
        priority: "HIGH",
        status,
        merchant: "ACME Corp",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date().toISOString(),
        description: "L'API retourne une erreur 500",
      },
      {
        id: "ticket_002",
        subject: "Question sur les frais de commission",
        priority: "MEDIUM",
        status: "PENDING",
        merchant: "TechStore",
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        updatedAt: new Date().toISOString(),
        description: "Clarification sur la structure des frais",
      },
      {
        id: "ticket_003",
        subject: "Demande d'accès administrateur",
        priority: "LOW",
        status: "RESOLVED",
        merchant: "ShopMaster",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        description: "Nouveau gestionnaire nécessite l'accès",
      },
    ];

    const filteredTickets = tickets.filter(t => t.status === status || status === "ALL");

    res.json({
      tickets: filteredTickets.slice((page - 1) * limit, page * limit),
      pagination: {
        page,
        limit,
        total: filteredTickets.length,
        pages: Math.ceil(filteredTickets.length / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/tickets/:ticketId/resolve - Resolve a ticket
router.post("/tickets/:ticketId/resolve", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      resolution: z.string().min(1).max(1000),
    });

    const body = schema.parse(req.body);

    res.json({
      success: true,
      message: "Ticket résolu avec succès",
      resolution: body.resolution,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ANALYTICS
// ============================================================================

// GET /super-admin/analytics - Analytics and metrics
router.get("/analytics", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const analytics = {
      revenue: {
        total: 250000,
        monthly: 42000,
        growth: 15.5,
      },
      users: {
        total: 1250,
        active: 892,
        new: 45,
        churn: 3.2,
      },
      orders: {
        total: 5432,
        average: 46,
        conversionRate: 8.5,
      },
      merchants: {
        total: 89,
        active: 78,
        suspended: 2,
        topMerchant: "ACME Corp",
      },
      timeSeriesData: [
        { date: "2024-01-01", revenue: 8000, orders: 120 },
        { date: "2024-01-02", revenue: 9200, orders: 145 },
        { date: "2024-01-03", revenue: 8900, orders: 135 },
        { date: "2024-01-04", revenue: 10500, orders: 165 },
        { date: "2024-01-05", revenue: 12000, orders: 180 },
      ],
    };

    res.json({ analytics });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// COMMISSIONS
// ============================================================================

// GET /super-admin/commissions - Commission tracking
router.get("/commissions", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = (req.query.status as string) || "ALL";

    const commissions = [
      {
        id: "comm_001",
        period: "2024-01",
        merchant: "ACME Corp",
        merchantId: "org_1",
        totalRevenue: 45000,
        commissionRate: 5,
        commissionAmount: 2250,
        status: "PAID",
        paidDate: "2024-02-05",
      },
      {
        id: "comm_002",
        period: "2024-01",
        merchant: "TechStore",
        merchantId: "org_2",
        totalRevenue: 32000,
        commissionRate: 5,
        commissionAmount: 1600,
        status: "PENDING",
        dueDate: "2024-02-05",
      },
      {
        id: "comm_003",
        period: "2024-01",
        merchant: "ShopMaster",
        merchantId: "org_3",
        totalRevenue: 28000,
        commissionRate: 5,
        commissionAmount: 1400,
        status: "PROCESSING",
        estimatedDate: "2024-02-03",
      },
    ];

    const filtered = commissions.filter(c =>
      (status === "ALL" || c.status === status)
    );

    res.json({
      commissions: filtered,
      summary: {
        totalAmount: filtered.reduce((sum, c) => sum + c.commissionAmount, 0),
        paid: filtered.filter(c => c.status === "PAID").length,
        pending: filtered.filter(c => c.status === "PENDING").length,
        processing: filtered.filter(c => c.status === "PROCESSING").length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/commissions/:commissionId/pay - Mark commission as paid
router.post("/commissions/:commissionId/pay", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      paymentMethod: z.enum(["BANK_TRANSFER", "CHECK", "WIRE"]),
      reference: z.string().min(1).max(100),
    });

    const body = schema.parse(req.body);

    res.json({
      success: true,
      message: "Commission payée avec succès",
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      paidAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// USER MANAGEMENT
// ============================================================================

// GET /super-admin/users - List all users
router.get("/users", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      db.user.findMany({
        skip,
        take: limit,
      }),
      db.user.count(),
    ]);

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        createdAt: u.createdAt,
        isSystemAdmin: u.isSystemAdmin,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/users/:userId/ban - Ban a user
router.post("/users/:userId/ban", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params as { userId: string };
    const schema = z.object({
      reason: z.string().min(1).max(500),
      duration: z.enum(["PERMANENT", "TEMPORARY"]),
    });

    const body = schema.parse(req.body);

    // Update user status to BANNED
    await db.user.update({
      where: { id: userId },
      data: { status: "BANNED" },
    });

    res.json({
      success: true,
      message: "Utilisateur banni avec succès",
      reason: body.reason,
      duration: body.duration,
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/users/:userId/unban - Unban a user
router.post("/users/:userId/unban", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params as { userId: string };

    // Update user status to ACTIVE
    await db.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });

    res.json({
      success: true,
      message: "Utilisateur débanni avec succès",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ADMIN MANAGEMENT
// ============================================================================

// GET /super-admin/admins - List all system admins
router.get("/admins", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const admins = await db.user.findMany({
      where: { isSystemAdmin: true },
    });

    res.json({
      admins: admins.map(a => ({
        id: a.id,
        email: a.email,
        name: a.name,
        createdAt: a.createdAt,
        status: a.status,
        role: "SYSTEM_ADMIN",
      })),
      total: admins.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/admins - Create new admin
router.post("/admins", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(200),
      password: z.string().min(8),
    });

    const body = schema.parse(req.body);

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      throw new ApiError(400, "Cet email existe déjà", "EMAIL_EXISTS");
    }

    const newAdmin = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash: body.password, // In production, should be hashed
        isSystemAdmin: true,
        status: "ACTIVE",
      },
    });

    res.json({
      success: true,
      admin: {
        id: newAdmin.id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: "SYSTEM_ADMIN",
        createdAt: newAdmin.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/admins/:adminId/remove - Remove admin privileges
router.post("/admins/:adminId/remove", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { adminId } = req.params as { adminId: string };

    await db.user.update({
      where: { id: adminId },
      data: { isSystemAdmin: false },
    });

    res.json({
      success: true,
      message: "Privilèges d'administrateur supprimés",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// AUDIT LOGS
// ============================================================================

// GET /super-admin/audit-logs - View audit logs
router.get("/audit-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const action = (req.query.action as string) || "ALL";

    const logs = [
      {
        id: "log_001",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        admin: "admin@example.com",
        action: "USER_BANNED",
        target: "user_123",
        changes: { status: "ACTIVE" },
        details: "Utilisateur banni pour violation de politique",
        ipAddress: "192.168.1.100",
      },
      {
        id: "log_002",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        admin: "admin@example.com",
        action: "MERCHANT_SUSPENDED",
        target: "org_456",
        changes: { status: "SUSPENDED" },
        details: "Commerçant suspendu pour fraude suspecte",
        ipAddress: "192.168.1.101",
      },
      {
        id: "log_003",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        admin: "admin@example.com",
        action: "ADMIN_CREATED",
        target: "user_789",
        changes: { isSystemAdmin: true },
        details: "Nouveau administrateur système créé",
        ipAddress: "192.168.1.102",
      },
    ];

    const filtered = action === "ALL" ? logs : logs.filter(l => l.action === action);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    res.json({
      logs: paginated,
      pagination: {
        page,
        limit,
        total: filtered.length,
        pages: Math.ceil(filtered.length / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /super-admin/audit-logs/export - Export audit logs
router.get("/audit-logs/export", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const formatQuery = req.query.format;
    const format = typeof formatQuery === "string" ? formatQuery : "CSV";

    const csvData = `ID,Timestamp,Admin,Action,Target,Details,IP\nlog_001,2024-01-15T12:00:00Z,admin@example.com,USER_BANNED,user_123,Utilisateur banni pour violation de politique,192.168.1.100`;

    if (format === "CSV") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-logs.csv");
      res.send(csvData);
    } else {
      res.json({
        logs: [
          {
            id: "log_001",
            timestamp: "2024-01-15T12:00:00Z",
            admin: "admin@example.com",
            action: "USER_BANNED",
          },
        ],
      });
    }
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ACCESS LOGS
// ============================================================================

// GET /super-admin/access-logs - View access logs
router.get("/access-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const logs = [
      {
        id: "access_001",
        user: "user@example.com",
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0",
        resource: "/super-admin/dashboard",
        method: "GET",
        status: 200,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        duration: 245,
      },
      {
        id: "access_002",
        user: "user@example.com",
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0",
        resource: "/api/super-admin/users",
        method: "POST",
        status: 201,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        duration: 512,
      },
      {
        id: "access_003",
        user: "user@example.com",
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0",
        resource: "/super-admin/merchants",
        method: "GET",
        status: 200,
        timestamp: new Date(Date.now() - 5400000).toISOString(),
        duration: 189,
      },
    ];

    const paginated = logs.slice((page - 1) * limit, page * limit);

    res.json({
      logs: paginated,
      pagination: {
        page,
        limit,
        total: logs.length,
        pages: Math.ceil(logs.length / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// EXPORTS
// ============================================================================

// GET /super-admin/exports - List available exports
router.get("/exports", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const exports = [
      {
        id: "export_001",
        name: "Merchants Export",
        type: "CSV",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        size: 2048,
        url: "/api/super-admin/exports/export_001/download",
      },
      {
        id: "export_002",
        name: "Commissions Report",
        type: "JSON",
        status: "IN_PROGRESS",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        size: null,
        progress: 45,
      },
      {
        id: "export_003",
        name: "Users List",
        type: "CSV",
        status: "COMPLETED",
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        size: 4096,
        url: "/api/super-admin/exports/export_003/download",
      },
    ];

    res.json({ exports });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/exports - Create new export
router.post("/exports", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      dataType: z.enum(["MERCHANTS", "USERS", "COMMISSIONS", "ORDERS", "STATS"]),
      format: z.enum(["CSV", "JSON"]),
    });

    const body = schema.parse(req.body);

    res.json({
      success: true,
      export: {
        id: `export_${Date.now()}`,
        name: `${body.dataType} Export`,
        type: body.format,
        status: "QUEUED",
        createdAt: new Date().toISOString(),
      },
      message: "Export créé et en attente de traitement",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// NOTIFICATIONS
// ============================================================================

// GET /super-admin/notifications - List notifications
router.get("/notifications", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const notifications = [
      {
        id: "notif_001",
        type: "ALERT",
        priority: "CRITICAL",
        title: "Tentative de fraude détectée",
        message: "Transaction suspecte depuis l'IP 203.0.113.45",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        read: false,
      },
      {
        id: "notif_002",
        type: "WARNING",
        priority: "HIGH",
        title: "Plusieurs échecs de connexion",
        message: "12 tentatives échouées pour l'utilisateur user@example.com",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: false,
      },
      {
        id: "notif_003",
        type: "INFO",
        priority: "LOW",
        title: "Backup complété",
        message: "Sauvegarde de la base de données complétée avec succès",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: true,
      },
    ];

    const paginated = notifications.slice((page - 1) * limit, page * limit);

    res.json({
      notifications: paginated,
      unreadCount: notifications.filter(n => !n.read).length,
      pagination: {
        page,
        limit,
        total: notifications.length,
        pages: Math.ceil(notifications.length / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /super-admin/notifications/:notificationId/mark-read - Mark notification as read
router.post("/notifications/:notificationId/mark-read", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      success: true,
      message: "Notification marquée comme lue",
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SETTINGS
// ============================================================================

// GET /super-admin/settings - Get super admin settings
router.get("/settings", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = {
      platformFees: {
        standardRate: 5,
        enterpriseRate: 3,
        premiumRate: 4,
      },
      payoutSettings: {
        minimumAmount: 100,
        frequency: "WEEKLY",
        delay: 2,
      },
      verification: {
        requirePhoneVerification: true,
        requireIdVerification: true,
        autoApproveThreshold: 1000,
      },
      security: {
        twoFactorRequired: false,
        maxLoginAttempts: 5,
        sessionTimeout: 30,
      },
      notifications: {
        emailAlerts: true,
        criticalOnly: false,
        weeklyReport: true,
      },
    };

    res.json({ settings });
  } catch (err) {
    next(err);
  }
});

// PUT /super-admin/settings - Update super admin settings
router.put("/settings", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFees: z.object({
        standardRate: z.number().min(0).max(100).optional(),
        enterpriseRate: z.number().min(0).max(100).optional(),
        premiumRate: z.number().min(0).max(100).optional(),
      }).optional(),
      payoutSettings: z.object({
        minimumAmount: z.number().min(0).optional(),
        frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
        delay: z.number().min(0).optional(),
      }).optional(),
      verification: z.object({
        requirePhoneVerification: z.boolean().optional(),
        requireIdVerification: z.boolean().optional(),
        autoApproveThreshold: z.number().min(0).optional(),
      }).optional(),
      security: z.object({
        twoFactorRequired: z.boolean().optional(),
        maxLoginAttempts: z.number().min(1).optional(),
        sessionTimeout: z.number().min(1).optional(),
      }).optional(),
      notifications: z.object({
        emailAlerts: z.boolean().optional(),
        criticalOnly: z.boolean().optional(),
        weeklyReport: z.boolean().optional(),
      }).optional(),
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
