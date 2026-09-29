import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { voitLesFinances } from "../auth/permissions-plateforme.service";
import { SystemHealthService } from "../monitoring/system-health.service";
import { isSuperOwner } from "./shared";

const router = Router();

// GET /superowner/dashboard - Superowner dashboard stats
router.get("/dashboard", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);

    const [
      organizations,
      users,
      revenusTotaux,
      revenusMois,
      revenusMoisPrecedent,
      alertesCritiques,
      systemConfig,
      auditLogs,
      sante,
    ] = await Promise.all([
      db.organization.findMany({ select: { status: true } }),
      db.user.count(),
      // Agréger en base : sommer les 10 dernières commandes donnait un
      // chiffre d'affaires faux dès la onzième commande.
      db.order.aggregate({ where: { deletedAt: null }, _sum: { totalAmount: true } }),
      db.order.aggregate({
        where: { deletedAt: null, createdAt: { gte: debutMois } },
        _sum: { totalAmount: true },
      }),
      db.order.aggregate({
        where: { deletedAt: null, createdAt: { gte: debutMoisPrecedent, lt: debutMois } },
        _sum: { totalAmount: true },
      }),
      db.merchantTicket.count({ where: { status: "OPEN", priority: "CRITICAL" } }),
      db.systemConfig.findFirst(),
      db.systemAuditLog.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
      // La carte « Santé Système » lisait un champ que personne n'envoyait :
      // elle affichait 0 % en rouge quoi qu'il arrive. Seul le chiffre est
      // rendu ici ; le détail a sa page, /superowner/health.
      SystemHealthService.score(),
    ]);

    const totalRevenue = Number(revenusTotaux._sum.totalAmount) || 0;
    const caMois = Number(revenusMois._sum.totalAmount) || 0;
    const caMoisPrecedent = Number(revenusMoisPrecedent._sum.totalAmount) || 0;
    const platformFee = Number(systemConfig?.platformFeePercent || 5);

    const stats = {
      totalRevenue,
      platformFee: totalRevenue * (platformFee / 100),
      activeOrganizations: organizations.filter((o) => o.status === "ACTIVE").length,
      totalUsers: users,
      criticalAlerts: alertesCritiques,
      systemHealth: sante,
      // Revenu du mois en cours, et non une extrapolation du total sur 12 mois.
      monthlyRecurring: caMois,
      // Croissance réelle d'un mois sur l'autre.
      growth:
        caMoisPrecedent > 0
          ? Number((((caMois - caMoisPrecedent) / caMoisPrecedent) * 100).toFixed(1))
          : 0,
    };

    if (!(await voitLesFinances(req.compte))) {
      const masque = { ...stats, totalRevenue: null, platformFee: null, monthlyRecurring: null, growth: null };
      res.json({ stats: masque, recentLogs: auditLogs, finances: false });
      return;
    }

    res.json({ stats, recentLogs: auditLogs, finances: true });
  } catch (err) {
    next(err);
  }
});

export default router;
