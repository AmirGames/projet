import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { ApiKeyService } from "../services/api-key.service";
import { WebhookService, EVENEMENTS_DISPONIBLES } from "../services/webhook.service";
import { BackupService } from "../services/backup.service";
import { SecurityEventService } from "../services/security-event.service";
import { invalidateMaintenanceCache } from "../middleware/maintenance";

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

    // Le jeton ne porte pas l'email : on l'expose pour les journaux.
    (req as any).actorEmail = user.email;

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
      // Revenu du mois en cours, et non une extrapolation du total sur 12 mois.
      monthlyRecurring: caMois,
      // Croissance réelle d'un mois sur l'autre.
      growth:
        caMoisPrecedent > 0
          ? Number((((caMois - caMoisPrecedent) / caMoisPrecedent) * 100).toFixed(1))
          : 0,
    };

    res.json({ stats, recentLogs: auditLogs });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// ORGANIZATIONS
// ============================================================================

// GET /superowner/organizations - Commerçants avec leur activité réelle
router.get("/organizations", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status ? { status } : {};

    const [organisations, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          stores: { select: { id: true } },
          _count: { select: { memberships: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.organization.count({ where }),
    ]);

    const lignes = await Promise.all(
      organisations.map(async (org) => {
        const storeIds = org.stores.map((s) => s.id);

        const commandes = storeIds.length
          ? await db.order.findMany({
              where: { storeId: { in: storeIds } },
              select: { totalAmount: true },
            })
          : [];

        return {
          id: org.id,
          name: org.name,
          email: org.email || "",
          status: org.status,
          tier: org.tier,
          createdAt: org.createdAt,
          activeUsers: org._count.memberships,
          revenue: Number(
            commandes.reduce((somme, c) => somme + Number(c.totalAmount), 0).toFixed(2)
          ),
        };
      })
    );

    res.json({ organizations: lignes, pagination: { total, limit, offset } });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// BILLING
// ============================================================================

// Facturation et rapports partagent le même découpage mensuel.
function moisDe(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// GET /superowner/billing - Commissions dues par commerçant sur le mois courant
router.get("/billing", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const config = await db.systemConfig.findFirst();
    const taux = Number(config?.platformFeePercent ?? 5) / 100;

    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const periode = moisDe(debutMois);

    const prochaineEcheance = new Date(debutMois);
    prochaineEcheance.setMonth(prochaineEcheance.getMonth() + 1);

    const organisations = await db.organization.findMany({
      include: {
        stores: { select: { id: true } },
        commissionHistory: { where: { period: periode }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    const lignes = await Promise.all(
      organisations.map(async (org) => {
        const storeIds = org.stores.map((s) => s.id);

        const commandes = storeIds.length
          ? await db.order.findMany({
              where: { storeId: { in: storeIds }, createdAt: { gte: debutMois } },
              select: { totalAmount: true },
            })
          : [];

        const chiffreAffaires = commandes.reduce((somme, c) => somme + Number(c.totalAmount), 0);
        const commission = chiffreAffaires * taux;
        const dejaFacture = org.commissionHistory.length > 0;

        return {
          id: org.id,
          organization: org.name,
          tier: org.tier,
          amount: Number(commission.toFixed(2)),
          status: dejaFacture ? "PAID" : commission > 0 ? "PENDING" : "PAID",
          period: periode,
          nextBillingDate: prochaineEcheance,
          createdAt: org.createdAt,
          revenue: Number(chiffreAffaires.toFixed(2)),
        };
      })
    );

    const page = lignes.slice(offset, offset + limit);

    res.json({
      billings: page,
      summary: {
        totalRevenue: Number(lignes.reduce((s, l) => s + l.amount, 0).toFixed(2)),
        pendingAmount: Number(
          lignes.filter((l) => l.status === "PENDING").reduce((s, l) => s + l.amount, 0).toFixed(2)
        ),
        activeSubscriptions: organisations.filter((o) => o.status === "ACTIVE").length,
      },
      pagination: { total: lignes.length, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/financial-reports - Synthèse mensuelle des douze derniers mois
router.get("/financial-reports", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 12, 36);
    const offset = parseInt(req.query.offset as string) || 0;

    const config = await db.systemConfig.findFirst();
    const taux = Number(config?.platformFeePercent ?? 5) / 100;

    const debut = new Date();
    debut.setMonth(debut.getMonth() - 11);
    debut.setDate(1);
    debut.setHours(0, 0, 0, 0);

    const commandes = await db.order.findMany({
      where: { createdAt: { gte: debut } },
      select: { totalAmount: true, createdAt: true, status: true },
    });

    const parMois = new Map<string, { revenus: number; remboursements: number; nombre: number }>();

    for (let i = 0; i < 12; i += 1) {
      const d = new Date(debut);
      d.setMonth(d.getMonth() + i);
      parMois.set(moisDe(d), { revenus: 0, remboursements: 0, nombre: 0 });
    }

    for (const commande of commandes) {
      const cle = moisDe(commande.createdAt);
      const ligne = parMois.get(cle);
      if (!ligne) continue;

      const montant = Number(commande.totalAmount);

      // Faute de modèle de remboursement, les commandes rejetées en tiennent lieu.
      if (commande.status === "REJECTED") {
        ligne.remboursements += montant;
      } else {
        ligne.revenus += montant;
        ligne.nombre += 1;
      }
    }

    const rapports = [...parMois.entries()]
      .reverse()
      .map(([periode, valeurs]) => {
        const fraisPlateforme = valeurs.revenus * taux;

        return {
          id: periode,
          period: periode,
          totalRevenue: Number(valeurs.revenus.toFixed(2)),
          platformFees: Number(fraisPlateforme.toFixed(2)),
          refunds: Number(valeurs.remboursements.toFixed(2)),
          netRevenue: Number(
            (valeurs.revenus - fraisPlateforme - valeurs.remboursements).toFixed(2)
          ),
          transactionCount: valeurs.nombre,
          averageOrderValue: valeurs.nombre
            ? Number((valeurs.revenus / valeurs.nombre).toFixed(2))
            : 0,
          createdAt: new Date(`${periode}-01T00:00:00.000Z`),
        };
      });

    res.json({
      reports: rapports.slice(offset, offset + limit),
      pagination: { total: rapports.length, limit, offset },
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

// GET /superowner/api-keys - Clés existantes (valeur masquée)
router.get("/api-keys", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    res.json(await ApiKeyService.list(limit, offset));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/api-keys - Générer une clé (visible une seule fois)
router.post("/api-keys", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ name: z.string().min(1).max(100) });
    const body = schema.parse(req.body);

    const cle = await ApiKeyService.create(body.name, req.userId);

    SecurityEventService.record({
      action: "API_KEY_CREATED",
      actor: (req as any).actorEmail || "inconnu",
      target: cle.id,
      severity: "MEDIUM",
      details: `Clé « ${body.name} » générée`,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, key: cle });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/api-keys/:keyId/revoke - Révoquer une clé
router.post("/api-keys/:keyId/revoke", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const keyId = req.params.keyId as string;
    const cle = await ApiKeyService.revoke(keyId);

    SecurityEventService.record({
      action: "API_KEY_REVOKED",
      actor: (req as any).actorEmail || "inconnu",
      target: keyId,
      severity: "HIGH",
      details: `Clé « ${cle.name} » révoquée`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: "Clé révoquée" });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// WEBHOOKS
// ============================================================================

// GET /superowner/webhooks - Abonnements enregistrés
router.get("/webhooks", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    res.json(await WebhookService.list(limit, offset));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/webhooks - Créer un abonnement
router.post("/webhooks", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      url: z.string().url("URL invalide"),
      events: z.array(z.string()).min(1, "Au moins un événement"),
    });
    const body = schema.parse(req.body);

    const abonnement = await WebhookService.create({
      url: body.url,
      events: body.events,
      createdById: req.userId,
    });

    SecurityEventService.record({
      action: "WEBHOOK_CREATED",
      actor: (req as any).actorEmail || "inconnu",
      target: abonnement.id,
      severity: "MEDIUM",
      details: `Webhook vers ${body.url}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      webhook: {
        id: abonnement.id,
        url: abonnement.url,
        events: abonnement.events,
        status: abonnement.status,
        // Le secret sert à vérifier la signature : il n'est montré qu'ici.
        secret: abonnement.secret,
        lastTriggered: abonnement.lastTriggered,
        retryCount: abonnement.retryCount,
        createdAt: abonnement.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/webhooks/:webhookId - Supprimer un abonnement
router.delete("/webhooks/:webhookId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    await WebhookService.remove(webhookId);

    SecurityEventService.record({
      action: "WEBHOOK_DELETED",
      actor: (req as any).actorEmail || "inconnu",
      target: webhookId,
      severity: "MEDIUM",
      ipAddress: req.ip,
    });

    res.json({ success: true, message: "Webhook supprimé" });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/webhooks/:webhookId/deliveries - Historique des envois
router.get("/webhooks/:webhookId/deliveries", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    const envois = await WebhookService.deliveries(webhookId);

    res.json({ deliveries: envois, availableEvents: EVENEMENTS_DISPONIBLES });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

// GET /superowner/data-management - Data management info
router.get("/data-management", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // La page lit stats et backups à la racine de la réponse.
    res.json(await BackupService.list());
  } catch (err) {
    next(err);
  }
});

// POST /superowner/backups - Produire une sauvegarde
router.post("/backups", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sauvegarde = await BackupService.create(req.userId);

    SecurityEventService.record({
      action: "BACKUP_CREATED",
      actor: (req as any).actorEmail || "inconnu",
      target: sauvegarde.id,
      severity: "MEDIUM",
      details: sauvegarde.name,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      backupId: sauvegarde.id,
      status: sauvegarde.status,
      message: "Sauvegarde terminée",
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/backups/:backupId/download - Télécharger le fichier
router.get("/backups/:backupId/download", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    const { nom, contenu } = await BackupService.read(backupId);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);
    res.send(contenu);
  } catch (err) {
    next(err);
  }
});

// POST /superowner/backups/:backupId/restore - Réinjecter le contenu
router.post("/backups/:backupId/restore", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    const resultats = await BackupService.restore(backupId);

    SecurityEventService.record({
      action: "BACKUP_RESTORED",
      actor: (req as any).actorEmail || "inconnu",
      target: backupId,
      severity: "CRITICAL",
      details: `Restaurés : ${Object.entries(resultats).map(([k, v]) => `${v} ${k}`).join(", ")}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, restored: resultats, message: "Sauvegarde restaurée" });
  } catch (err) {
    next(err);
  }
});

// DELETE /superowner/backups/:backupId - Supprimer la sauvegarde et son fichier
router.delete("/backups/:backupId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const backupId = req.params.backupId as string;
    await BackupService.remove(backupId);

    SecurityEventService.record({
      action: "BACKUP_DELETED",
      actor: (req as any).actorEmail || "inconnu",
      target: backupId,
      severity: "HIGH",
      ipAddress: req.ip,
    });

    res.json({ success: true, message: "Sauvegarde supprimée" });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// SECURITY AUDIT
// ============================================================================

// GET /superowner/security-audit - Journal des événements de sécurité
router.get("/security-audit", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resultat = await SecurityEventService.list({
      limit: parseInt(req.query.limit as string) || 20,
      offset: parseInt(req.query.offset as string) || 0,
      severity: (req.query.severity as string) || undefined,
    });

    res.json(resultat);
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

    // Sans cela, le mode maintenance ne prendrait effet qu'au bout du cache.
    invalidateMaintenanceCache();

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
