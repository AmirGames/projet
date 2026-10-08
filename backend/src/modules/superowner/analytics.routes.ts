import { Router, Request, Response, NextFunction } from "express";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { isSuperOwner } from "./shared";
import { limiteBornee, decalage } from "../../utils/pagination";
import { objetJson } from "../../utils/json";

const router = Router();

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

    /**
     * Le jour en cours d'abord, puis on remonte dans le temps.
     *
     * La liste sortait du plus ancien au plus récent : il fallait la dérouler
     * jusqu'en bas pour voir la journée qui intéresse. La croissance, elle, est
     * calculée plus haut dans l'ordre chronologique, sans quoi elle se
     * comparerait au lendemain.
     */
    const duPlusRecent = [...data].reverse();

    res.json({
      data: duPlusRecent.map(({ periodeIndex: _index, ...reste }) => reste),
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

// GET /superowner/audit-logs - Journal des actions administratives
router.get("/audit-logs", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = limiteBornee(req.query.limit, 20, 100);
    const offset = decalage(req.query.offset);

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
        changes: { before: {}, after: objetJson(entree.changes) },
        status: "SUCCESS",
        // Renseignées depuis que la table les garde : la section
        // « Informations réseau » du journal était vide.
        ipAddress: entree.ipAddress || "—",
        userAgent: entree.userAgent || "—",
        timestamp: entree.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
