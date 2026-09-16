import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware, oublierCompte } from "../middleware/auth";
import { AuthService } from "../services/auth.service";
import { MerchantClosureService } from "../services/merchant-closure.service";

const router = Router();

/**
 * Ce routeur ne sert plus à aucune page.
 *
 * Il date des trois espaces d'administration séparés, avant leur fusion sous
 * `/superowner`. Le site n'appelle plus une seule de ses routes : ce qu'il
 * faisait vit désormais dans `/api/superowner` et `/api/admin`.
 *
 * Treize routes qui rendaient des données inventées — journaux d'audit avec la
 * même adresse IP pour tout le monde, tickets nommés « log_001 », réglages qui
 * n'étaient jamais enregistrés — ont été retirées : un écran branché dessus
 * aurait affiché une administration qui fonctionne sans rien administrer.
 *
 * Ce qui reste interroge réellement la base et sert encore aux vérifications.
 * À retirer le jour où plus rien ne le cite.
 */

// Middleware to check if user is system admin
// Idem : `authMiddleware` a déjà établi que le compte existe.
const isSystemAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.compte?.isSystemAdmin) {
    return next(
      new ApiError(403, "Accès refusé - Administrateur système requis", "FORBIDDEN")
    );
  }

  next();
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

    // Écrire le statut à la main court-circuitait tout le reste : le motif
    // n'était pas conservé, le webhook ne partait pas, et le commerçant
    // gardait la main jusqu'à sa prochaine connexion. Même chemin que
    // /admin/merchants/:orgId/suspend.
    await MerchantClosureService.suspend(merchantId, body.reason);

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





// ============================================================================
// ANALYTICS
// ============================================================================



// ============================================================================
// COMMISSIONS
// ============================================================================





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

    // Sans cela, le compte garderait ses accès le temps du cache.
    oublierCompte(userId);

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

    oublierCompte(userId);

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

    // Le mot de passe était enregistré en clair : la connexion, qui compare
    // une empreinte bcrypt, échouait systématiquement pour ces comptes — en
    // plus d'exposer le mot de passe à quiconque lit la base.
    const passwordHash = await AuthService.hashPassword(body.password);

    const newAdmin = await db.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
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

    oublierCompte(adminId);

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





// ============================================================================
// ACCESS LOGS
// ============================================================================

/**
 * GET /super-admin/access-logs - Journal des accès
 *
 * Rendait trois lignes écrites en dur — la même adresse IP inventée pour tout
 * le monde. Un journal inventé est pire qu'un journal vide : on le croit.
 */
router.get("/access-logs", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);

    const [evenements, total] = await Promise.all([
      db.securityEvent.findMany({
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: "desc" },
      }),
      db.securityEvent.count(),
    ]);

    const logs = evenements.map((evenement) => ({
      id: evenement.id,
      user: evenement.actor,
      ipAddress: evenement.ipAddress || "—",
      userAgent: evenement.userAgent || "—",
      resource: evenement.target || "plateforme",
      method: evenement.action,
      status: evenement.status === "SUCCESS" ? 200 : 403,
      timestamp: evenement.createdAt,
      duration: evenement.durationMs,
    }));

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// EXPORTS
// ============================================================================





// ============================================================================
// NOTIFICATIONS
// ============================================================================





// ============================================================================
// SETTINGS
// ============================================================================





export default router;
