import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware, oublierCompte } from "../middleware/auth";
import { ApiKeyService } from "../services/api-key.service";
import { WebhookService, EVENEMENTS_WEBHOOK } from "../services/webhook.service";
import { BackupService } from "../services/backup.service";
import { SecurityEventService } from "../services/security-event.service";
import { invalidateMaintenanceCache } from "../middleware/maintenance";
import { MerchantClosureService } from "../services/merchant-closure.service";
import { PlanService, promoSansCommissionActive } from "../services/plan.service";
import {
  DriverApprovalService,
  libelleDuDocument,
  piecesAttendues,
} from "../services/driver-approval.service";
import {
  DriverPayoutService,
  MOYENS_VERSEMENT,
  semainePrecedente,
} from "../services/driver-payout.service";
import { StoreSupportService, libelleDuChamp } from "../services/store-support.service";
import { MerchantProfileService } from "../services/merchant-profile.service";
import { MerchantApprovalService } from "../services/merchant-approval.service";
import { SystemHealthService } from "../services/system-health.service";
import { ReviewModerationService } from "../services/review-moderation.service";

const LIBELLES_STATUT: Record<string, string> = {
  OPEN: "rouvert",
  IN_PROGRESS: "pris en charge par le support",
  RESOLVED: "résolu",
  CLOSED: "clôturé",
};

const LIBELLES_PRIORITE: Record<string, string> = {
  LOW: "basse",
  MEDIUM: "normale",
  HIGH: "haute",
  CRITICAL: "urgente",
};
import { TicketMessageService } from "../services/ticket-message.service";
import { logger } from "../config/logger";
import { DriverSupportService, LONGUEUR_MAX } from "../services/driver-support.service";

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

    res.json({ stats, recentLogs: auditLogs });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/system-health - Le détail de la santé, relevé par relevé
//
// Le tableau de bord n'affiche que le pourcentage ; ce qui le compose, et ce
// qu'il faut faire pour le remonter, tient sur sa propre page.
router.get("/system-health", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await SystemHealthService.etat() });
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
    // « ?validation=attente » : les commerces qui attendent qu'on examine
    // leur dossier, ce que la plateforme cherche en premier.
    const enAttente = req.query.validation === "attente";

    const where = {
      ...(status ? { status } : {}),
      ...(enAttente ? { approvedAt: null } : {}),
    };

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
          approvedAt: org.approvedAt,
          activeUsers: org._count.memberships,
          // La promo « zéro commission » : réglée, et en cours ou non.
          commissionFree: {
            active: org.commissionFreeActive,
            until: org.commissionFreeUntil,
            note: org.commissionFreeNote,
            enCours: promoSansCommissionActive(org),
          },
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

    /**
     * Le taux de commission vient de la formule du commerçant.
     *
     * Il était unique et global : le même prélèvement pour tout le monde, quel
     * que soit l'abonnement payé. Le réglage global sert désormais de repli pour
     * une formule qui n'aurait pas de taux.
     */
    const config = await db.systemConfig.findFirst();
    const tauxParDefaut = Number(config?.platformFeePercent ?? 5);
    const grille = await PlanService.grille();
    const tauxParFormule = new Map(grille.map((formule) => [formule.code, formule.commission]));

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
              select: {
                totalAmount: true,
                commissionPercent: true,
                commissionAmount: true,
                tierAtOrder: true,
                commissionWaived: true,
                // commissionFrozen n'existe en base qu'après la migration
                // add_tax_per_item_and_invoice_seq. On le traite en mémoire.
              },
            })
          : [];

        const chiffreAffaires = commandes.reduce((somme, c) => somme + Number(c.totalAmount), 0);

        /**
         * La commission se lit sur chaque commande, où elle a été figée.
         *
         * Elle se recalculait ici au taux de la formule *actuelle* : changer la
         * formule d'un commerçant refacturait tout son mois — et tout mois
         * rouvert plus tard — au nouveau taux. La plateforme perdait de l'argent
         * dans un sens, en réclamait indûment dans l'autre.
         *
         * Les commandes antérieures à ce changement n'ont pas de taux figé : on
         * retombe alors sur la formule du jour, faute de mieux.
         */
        const tauxDuJour = tauxParFormule.get(org.tier) ?? tauxParDefaut;

        const commission = commandes.reduce((somme, c) => {
          /**
           * commissionFrozen = true → le montant a été calculé au serveur au
           * moment de la commande : on l'utilise tel quel, même s'il vaut 0
           * (formule FREE à 0 %, vente annulée, etc.).
           *
           * commissionFrozen = false → commande antérieure à ce champ, ou
           * sans tierAtOrder. On recalcule avec le taux du plan *d'alors*
           * (tierAtOrder) si disponible, sinon avec le taux du jour.
           */
          // commissionFrozen n'est pas en base tant que la migration n'est pas
          // appliquée. On considère que commissionAmount > 0 signifie qu'il est figé.
          if (Number(c.commissionAmount) > 0) return somme + Number(c.commissionAmount);
          // Passée pendant une promo « zéro commission » : rien à facturer.
          if (c.commissionWaived) return somme;

          // Ancienne commande : tierAtOrder contient le code du plan qui
          // valait ce jour-là ; tauxParFormule le convertit en taux.
          const tauxHistorique = (c as any).tierAtOrder
            ? tauxParFormule.get((c as any).tierAtOrder) ?? tauxDuJour
            : tauxDuJour;

          return somme + (Number(c.totalAmount) * tauxHistorique) / 100;
        }, 0);

        // Les taux réellement appliqués sur la période : plusieurs en cas de
        // changement de formule en cours de mois, et c'est exactement ce que
        // l'écran doit pouvoir montrer.
        const tauxAppliques = [
          ...new Set(
            commandes
              .map((c) => Number(c.commissionPercent))
              .filter((t) => t > 0)
          ),
        ].sort((a: number, b: number) => a - b);

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
          // D'où vient le montant : l'écran n'affichait qu'un total, sans dire
          // qu'il s'agissait d'un pourcentage des ventes du mois.
          revenue: Number(chiffreAffaires.toFixed(2)),
          ordersCount: commandes.length,
          // Le taux effectivement appliqué. Plusieurs valeurs quand la formule a
          // changé en cours de mois : les anciennes commandes gardent l'ancien.
          commissionPercent: tauxAppliques.length === 1 ? tauxAppliques[0] : tauxDuJour,
          commissionRates: tauxAppliques,
          tierChangedDuringPeriod: tauxAppliques.length > 1,
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

/**
 * GET /superowner/billing/:orgId - Le détail de la commission d'un commerçant
 *
 * La page ne montrait qu'un montant par commerçant, sans le détail : impossible
 * de savoir quelles commandes le composaient, ni ce qui avait été prélevé sur
 * chacune. Ici, commande par commande, avec sa part.
 */
router.get("/billing/:orgId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const organisation = await db.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        tier: true,
        // L'identité de facturation : une facture sans raison sociale, adresse
        // ni numéro de TVA n'en est pas une.
        legalName: true,
        vatNumber: true,
        registrationNumber: true,
        billingAddress: true,
        billingPostalCode: true,
        billingCity: true,
        billingCountry: true,
        stores: {
          select: {
            id: true,
            name: true,
            legalName: true,
            vatNumber: true,
            registrationNumber: true,
          },
        },
      },
    });

    if (!organisation) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // Le mois demandé, ou le mois courant.
    const demande = (req.query.period as string) || "";
    const debutMois = /^\d{4}-\d{2}$/.test(demande)
      ? new Date(`${demande}-01T00:00:00`)
      : new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    const finMois = new Date(debutMois);
    finMois.setMonth(finMois.getMonth() + 1);

    const config = await db.systemConfig.findFirst();
    const formule = await PlanService.formule(organisation.tier);
    const taux = formule.commission ?? Number(config?.platformFeePercent ?? 5);

    const storeIds = organisation.stores.map((boutique) => boutique.id);
    const nomDeLaBoutique = new Map(organisation.stores.map((b) => [b.id, b.name]));

    const commandes = storeIds.length
      ? await db.order.findMany({
          where: {
            storeId: { in: storeIds },
            createdAt: { gte: debutMois, lt: finMois },
            deletedAt: null,
          },
          select: {
            id: true,
            storeId: true,
            createdAt: true,
            totalAmount: true,
            discountAmount: true,
            feesAmount: true,
            status: true,
            paymentStatus: true,
            customerName: true,
            commissionPercent: true,
            commissionAmount: true,
            commissionWaived: true,
            deliveryMode: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const lignes = commandes.map((commande) => {
      const montant = Number(commande.totalAmount);
      // La commission figée à la commande fait foi — son taux dépend de la
      // formule d'alors et de qui livrait. Les commandes antérieures au figeage
      // retombent sur le taux du jour.
      // Une commande passée pendant une promo est figée à 0.
      const figee = Number(commande.commissionAmount) > 0 || commande.commissionWaived;

      return {
        id: commande.id,
        numero: commande.id.slice(-8).toUpperCase(),
        date: commande.createdAt,
        boutique: nomDeLaBoutique.get(commande.storeId) || "—",
        client: commande.customerName,
        status: commande.status,
        paymentStatus: commande.paymentStatus,
        total: montant,
        remise: Number(commande.discountAmount),
        livraison: Number(commande.feesAmount),
        // OWN : frais gardés par le commerçant. PLATFORM : reversés au livreur.
        modeLivraison: commande.deliveryMode,
        tauxCommission: figee ? Number(commande.commissionPercent) : taux,
        // Ce que la plateforme prélève sur cette commande.
        commission: figee
          ? Number(commande.commissionAmount)
          : Number(((montant * taux) / 100).toFixed(2)),
      };
    });

    const chiffreAffaires = lignes.reduce((somme, ligne) => somme + ligne.total, 0);

    res.json({
      organization: {
        id: organisation.id,
        name: organisation.name,
        tier: organisation.tier,
        legalName: organisation.legalName,
        vatNumber: organisation.vatNumber,
        registrationNumber: organisation.registrationNumber,
        billingAddress: organisation.billingAddress,
        billingPostalCode: organisation.billingPostalCode,
        billingCity: organisation.billingCity,
        billingCountry: organisation.billingCountry,
        /**
         * Les boutiques qui facturent sous leur propre identité.
         *
         * Trois commerces peuvent relever de trois sociétés : présenter une
         * seule raison sociale pour le mois entier serait faux.
         */
        identitesParBoutique: organisation.stores
          .filter((boutique) => boutique.legalName || boutique.vatNumber)
          .map((boutique) => ({
            id: boutique.id,
            name: boutique.name,
            legalName: boutique.legalName || organisation.legalName,
            vatNumber: boutique.vatNumber || organisation.vatNumber,
            registrationNumber: boutique.registrationNumber || organisation.registrationNumber,
          })),
        // Ce qui empêcherait d'émettre la facture, dit avant de l'éditer.
        manquePourFacturer: [
          !organisation.legalName && "la raison sociale",
          !organisation.billingAddress && "l'adresse de facturation",
          !organisation.vatNumber && "le numéro de TVA",
        ].filter(Boolean),
      },
      period: moisDe(debutMois),
      commissionPercent: taux,
      tierLabel: formule.libelle,
      orders: lignes,
      summary: {
        ordersCount: lignes.length,
        revenue: Number(chiffreAffaires.toFixed(2)),
        // Somme des parts, et non pourcentage du total : les arrondis par
        // commande doivent correspondre à ce que la ligne affiche.
        commission: Number(lignes.reduce((somme, ligne) => somme + ligne.commission, 0).toFixed(2)),
      },
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
    // Cette réponse était entièrement fabriquée (version de base en dur, cache
    // Redis inexistant, clés API fictives). Elle reflète désormais l'état réel.
    let config = await db.systemConfig.findFirst();
    if (!config) config = await db.systemConfig.create({ data: {} });

    const [versionBase, nbWebhooks, nbWebhooksActifs, cles] = await Promise.all([
      db.$queryRaw<{ version: string }[]>`SELECT version() as version`.catch(() => []),
      db.webhook.count(),
      db.webhook.count({ where: { status: "ACTIVE" } }),
      ApiKeyService.list(),
    ]);

    const version = versionBase[0]?.version?.match(/PostgreSQL ([\d.]+)/)?.[1] || "inconnue";

    res.json({
      config: {
        apiVersion: process.env.npm_package_version || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        apiUrl: process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`,
        webhookUrl: `${process.env.API_URL || ""}/api/webhooks`,
        database: { status: versionBase.length ? "CONNECTED" : "UNREACHABLE", version },
        webhooks: { enabled: nbWebhooksActifs > 0, count: nbWebhooks, active: nbWebhooksActifs },
        apiKeys: cles,
        // Réglages modifiables de la plateforme.
        platformFeePercent: Number(config.platformFeePercent),
        minOrderAmount: Number(config.minOrderAmount),
        maxOrderAmount: Number(config.maxOrderAmount),
        maintenanceMode: config.maintenanceMode,
        maintenanceMessage: config.maintenanceMessage || "",
        driverMaxRadiusKm: config.driverMaxRadiusKm,
        driverOfferSeconds: config.driverOfferSeconds,
        driverBaseFee: Number(config.driverBaseFee),
        driverPerKmFee: Number(config.driverPerKmFee),
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

// GET /superowner/webhooks/evenements - La liste des événements qui existent
// vraiment. L'écran proposait sa propre liste, qui avait divergé de celle du
// serveur : neuf des dix événements offerts n'étaient émis par personne.
router.get("/webhooks/evenements", authMiddleware, isSuperOwner, async (_req: Request, res: Response) => {
  res.json({ availableEvents: EVENEMENTS_WEBHOOK });
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
    });

    res.json({ success: true, message: "Webhook supprimé" });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/webhooks/:webhookId - Mettre en pause, ou remettre en marche
// un abonnement coupé après cinq abandons. Sans cette route, il fallait le
// supprimer et le recréer — donc changer le secret chez le destinataire.
router.patch("/webhooks/:webhookId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });
    const body = schema.parse(req.body);
    const webhookId = req.params.webhookId as string;

    const abonnement = await WebhookService.setStatus(webhookId, body.status);

    res.json({
      success: true,
      message: body.status === "ACTIVE" ? "Webhook réactivé" : "Webhook mis en pause",
      webhook: { id: abonnement.id, status: abonnement.status, retryCount: abonnement.retryCount },
    });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/webhooks/:webhookId/essai - Envoi d'essai
// La seule façon de savoir si son destinataire répondait correctement était
// d'attendre un vrai événement — et de le manquer s'il ne répondait pas.
router.post("/webhooks/:webhookId/essai", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    const envoi = await WebhookService.essayer(webhookId);

    res.json({
      success: true,
      envoi,
      message: envoi.success
        ? `Votre serveur a répondu ${envoi.statusCode}.`
        : `Échec : ${envoi.error}. Une relance est programmée.`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/webhooks/:webhookId/deliveries - Historique des envois
router.get("/webhooks/:webhookId/deliveries", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const webhookId = req.params.webhookId as string;
    const envois = await WebhookService.deliveries(webhookId);

    res.json({ deliveries: envois, availableEvents: EVENEMENTS_WEBHOOK });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// FINANCIAL REPORTS
// ============================================================================


// Journalise une action d'administration sur la plateforme.
async function journaliser(req: Request, action: string, target: string, changes?: unknown) {
  await db.systemAuditLog.create({
    data: {
      adminId: (req as any).userId,
      action,
      target,
      changes: (changes ?? {}) as any,
    },
  });
}

// PATCH /superowner/support-tickets/:ticketId/priority - Changer la priorité
router.patch("/support-tickets/:ticketId/priority", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ticketId = req.params.ticketId as string;
    // La page affiche URGENT là où la base stocke CRITICAL.
    const schema = z.object({ priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]) });
    const body = schema.parse(req.body);
    const priorite = body.priority === "URGENT" ? "CRITICAL" : body.priority;

    const existant = await db.merchantTicket.findUnique({ where: { id: ticketId } });

    if (!existant) {
      throw new ApiError(404, "Ticket introuvable", "NOT_FOUND");
    }

    const ticket = await db.merchantTicket.update({
      where: { id: ticketId },
      data: { priority: priorite },
    });

    await journaliser(req, "TICKET_PRIORITY_CHANGED", ticketId, {
      avant: existant.priority,
      apres: priorite,
    });

    if (existant.priority !== priorite) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Priorité de votre ticket modifiée",
        `Ticket « ${ticket.title} » : priorité ${LIBELLES_PRIORITE[priorite] || priorite}.`
      );
    }

    res.json({
      message: "Priorité mise à jour",
      ticket: { ...ticket, priority: ticket.priority === "CRITICAL" ? "URGENT" : ticket.priority },
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/support-tickets/:ticketId/messages - Fil de discussion
router.get("/support-tickets/:ticketId/messages", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const messages = await TicketMessageService.list(req.params.ticketId as string);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/support-tickets/:ticketId/messages - Répondre au commerçant
router.post("/support-tickets/:ticketId/messages", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({ body: z.string().min(1, "Message requis") });
    const body = schema.parse(req.body);

    const message = await TicketMessageService.add({
      ticketId: req.params.ticketId as string,
      authorId: (req as any).userId,
      authorRole: "ADMIN",
      body: body.body,
    });

    res.status(201).json({ message: "Réponse envoyée", data: message });
  } catch (err) {
    next(err);
  }
});

// ---- La grille des formules ----
// Tarifs, quotas et arguments de vente étaient écrits dans le code : changer
// un prix demandait une mise en production.

// GET /superowner/plans - La grille complète
router.get("/plans", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const grille = await PlanService.grille();

    // Combien de commerçants sur chaque formule : baisser un quota sans le
    // savoir se paie en tickets de support.
    const repartition = await db.organization.groupBy({
      by: ["tier"],
      _count: { _all: true },
    });

    res.json({
      success: true,
      data: grille.map((formule) => ({
        ...formule,
        abonnes: repartition.find((ligne) => ligne.tier === formule.code)?._count._all ?? 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/plans/:code - Régler une formule
router.patch("/plans/:code", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schemaCode = z.enum(["FREE", "PREMIUM", "PRO"]);
    const code = schemaCode.parse((req.params.code as string)?.toUpperCase());

    const schema = z.object({
      libelle: z.string().min(2, "Nom minimum 2 caractères").optional(),
      maxBoutiques: z.number().int().min(1, "Au moins une boutique").optional(),
      prixMensuel: z.number().min(0, "Tarif négatif impossible").optional(),
      commission: z
        .number()
        .min(0, "Commission négative impossible")
        .max(100, "Une commission ne dépasse pas 100 %")
        .optional(),
      commissionLivreursPlateforme: z
        .number()
        .min(0, "Commission négative impossible")
        .max(100, "Une commission ne dépasse pas 100 %")
        .optional(),
      avantages: z.array(z.string().min(1)).max(12, "Douze arguments suffisent").optional(),
      ordre: z.number().int().min(0).optional(),
    });

    const analyse = schema.safeParse(req.body);

    if (!analyse.success) {
      throw new ApiError(
        400,
        analyse.error.issues[0]?.message || "Réglage invalide",
        "INVALID_PLAN"
      );
    }

    const body = analyse.data;
    const formule = await PlanService.enregistrer(code, body);

    await journaliser(req, "PLAN_TIER_UPDATED", code, body);

    res.json({ message: `Formule ${formule.libelle} enregistrée`, data: formule });
  } catch (err) {
    next(err);
  }
});

// ---- Actions de gestion sur un commerçant ----
// Elles s'appuient sur le même service que l'espace d'administration, pour que
// suspension et fermeture se comportent exactement de la même façon.

// PATCH /superowner/organizations/:orgId/tier - Changer la formule
router.patch("/organizations/:orgId/tier", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ tier: z.enum(["FREE", "PREMIUM", "PRO"]) });
    const body = schema.parse(req.body);

    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { tier: true },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // Rétrograder en dessous du nombre de boutiques ouvertes créerait un
    // commerçant hors quota : on le signale au lieu de l'accepter en silence.
    const formuleCible = await PlanService.formule(body.tier);
    const quotaCible = formuleCible.maxBoutiques;
    const boutiques = await db.store.count({ where: { orgId, deletedAt: null } });

    if (boutiques > quotaCible) {
      throw new ApiError(
        400,
        `Ce commerçant exploite ${boutiques} boutiques ; la formule ${formuleCible.libelle} en autorise ${quotaCible}. Fermez d'abord les boutiques en trop.`,
        "TIER_BELOW_USAGE"
      );
    }

    // ── Figer la commission sur les commandes non encore figées ────────────
    //
    // Si le commerçant passe de FREE (8 %) à PRO (3 %), les commandes passées
    // ce mois-ci avant le changement doivent rester à 8 %. Sans ce bloc, la
    // facturation mensuelle tombe sur le taux du jour pour toute commande dont
    // commissionFrozen = false, et recalcule l'ensemble du mois au nouveau taux.
    //
    // On fixe ici le taux de l'ancien plan sur toutes les commandes du mois
    // qui n'ont pas encore de taux figé (commissionFrozen = false).
    // Les commandes récentes ont déjà commissionFrozen = true : elles ne sont
    // pas touchées.
    const ancienTaux = await db.planTier.findUnique({
      where: { code: existante.tier as any },
      select: { commissionPercent: true },
    });

    if (ancienTaux) {
      const debutMois = new Date();
      debutMois.setDate(1);
      debutMois.setHours(0, 0, 0, 0);

      const storeIds = (await db.store.findMany({
        where: { orgId },
        select: { id: true },
      })).map((s) => s.id);

      if (storeIds.length > 0) {
        // On récupère les commandes non figées du mois pour recalculer
        // commissionAmount au centime près avant de les figer.
        // commissionFrozen n'existe pas encore en base si la migration
        // add_tax_per_item_and_invoice_seq n'a pas été appliquée.
        // On récupère toutes les commandes du mois et on filtre en mémoire :
        // on ne retouche que celles dont commissionAmount = 0 (non figées).
        const toutesCommandes = await db.order.findMany({
          where: {
            storeId: { in: storeIds },
            createdAt: { gte: debutMois },
          },
          select: { id: true, totalAmount: true, commissionAmount: true, commissionWaived: true },
        });

        // Les commandes offertes par une promo restent à 0.
        const nonFigees = toutesCommandes.filter(
          (c) => Number(c.commissionAmount) === 0 && !c.commissionWaived
        );

        const taux = Number(ancienTaux.commissionPercent);

        await Promise.all(
          nonFigees.map((c) =>
            db.order.update({
              where: { id: c.id },
              data: {
                commissionPercent: taux,
                commissionAmount:  Number((Number(c.totalAmount) * taux / 100).toFixed(2)),
                tierAtOrder:       existante.tier,
                // commissionFrozen sera mis à true une fois la migration appliquée.
              },
            })
          )
        );
      }
    }

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: { tier: body.tier },
    });

    await journaliser(req, "MERCHANT_TIER_CHANGED", orgId, {
      avant: existante.tier,
      apres: body.tier,
      commandesFigees: typeof ancienTaux !== 'undefined' ? true : false,
    });

    res.json({
      message: `Formule passée en ${formuleCible.libelle}`,
      organization: { id: organisation.id, tier: organisation.tier },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /superowner/organizations/:orgId/commission-promo
 *
 * Offre (ou retire) la promo « zéro commission » à un commerçant. Seules les
 * commandes passées pendant la promo en profitent : celles d'avant gardent
 * leur commission.
 */
router.patch("/organizations/:orgId/commission-promo", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({
      active: z.boolean(),
      // Date de fin incluse (AAAA-MM-JJ). Absente : jusqu'à nouvel ordre.
      until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide")
        .nullable()
        .optional(),
      note: z.string().max(200).nullable().optional(),
    });
    const body = schema.parse(req.body);

    const existante = await db.organization.findUnique({
      where: { id: orgId },
      select: { commissionFreeActive: true, commissionFreeUntil: true },
    });

    if (!existante) {
      throw new ApiError(404, "Commerçant introuvable", "ORG_NOT_FOUND");
    }

    // La date de fin est incluse : la promo court jusqu'au soir de ce jour.
    const fin = body.active && body.until ? new Date(`${body.until}T23:59:59.999`) : null;

    if (fin && fin <= new Date()) {
      throw new ApiError(400, "La date de fin est déjà passée", "PROMO_END_IN_PAST");
    }

    const organisation = await db.organization.update({
      where: { id: orgId },
      data: {
        commissionFreeActive: body.active,
        commissionFreeUntil: fin,
        commissionFreeNote: body.active ? body.note?.trim() || null : null,
      },
    });

    await journaliser(req, body.active ? "COMMISSION_PROMO_GRANTED" : "COMMISSION_PROMO_REMOVED", orgId, {
      avant: existante,
      apres: { active: body.active, until: fin, note: organisation.commissionFreeNote },
    });

    res.json({
      message: body.active ? "Promo zéro commission activée" : "Promo zéro commission retirée",
      commissionFree: {
        active: organisation.commissionFreeActive,
        until: organisation.commissionFreeUntil,
        note: organisation.commissionFreeNote,
        enCours: promoSansCommissionActive(organisation),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/suspend", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ reason: z.string().min(1, "La raison est requise") });
    const body = schema.parse(req.body);

    const organisation = await MerchantClosureService.suspend(orgId, body.reason);
    await journaliser(req, "SUSPEND_MERCHANT", orgId, { reason: body.reason });

    logger.info("Merchant suspended by superowner", { orgId, reason: body.reason });
    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/unsuspend", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;

    const organisation = await MerchantClosureService.unsuspend(orgId);
    await journaliser(req, "UNSUSPEND_MERCHANT", orgId);

    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

router.post("/organizations/:orgId/close", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.params.orgId as string;
    const schema = z.object({ reason: z.string().min(1, "La raison est requise") });
    const body = schema.parse(req.body);

    const organisation = await MerchantClosureService.close(orgId, body.reason);
    await journaliser(req, "CLOSE_MERCHANT", orgId, { reason: body.reason });

    logger.info("Merchant closed by superowner", { orgId, reason: body.reason });
    res.json(organisation);
  } catch (err) {
    next(err);
  }
});

// PUT /superowner/system-config - Modifier la configuration de la plateforme
router.put("/system-config", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      minOrderAmount: z.number().min(0).optional(),
      maxOrderAmount: z.number().min(0).optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      // Attribution des courses aux livreurs
      driverMaxRadiusKm: z.number().min(1).max(50).optional(),
      driverOfferSeconds: z.number().int().min(10).max(600).optional(),
      driverBaseFee: z.number().min(0).optional(),
      driverPerKmFee: z.number().min(0).optional(),
    });
    const body = schema.parse(req.body);

    if (
      body.minOrderAmount !== undefined &&
      body.maxOrderAmount !== undefined &&
      body.minOrderAmount > body.maxOrderAmount
    ) {
      throw new ApiError(400, "Le montant minimum doit rester inférieur au maximum", "INVALID_RANGE");
    }

    let config = await db.systemConfig.findFirst();
    if (!config) config = await db.systemConfig.create({ data: {} });

    const misAJour = await db.systemConfig.update({
      where: { id: config.id },
      data: body,
    });

    // Le mode maintenance est mis en cache : sans cela le changement
    // mettrait jusqu'à quinze secondes à s'appliquer.
    invalidateMaintenanceCache();
    await journaliser(req, "SYSTEM_CONFIG_UPDATED", config.id, body);

    res.json({
      message: "Configuration enregistrée",
      config: {
        platformFeePercent: Number(misAJour.platformFeePercent),
        minOrderAmount: Number(misAJour.minOrderAmount),
        maxOrderAmount: Number(misAJour.maxOrderAmount),
        maintenanceMode: misAJour.maintenanceMode,
        maintenanceMessage: misAJour.maintenanceMessage || "",
        driverMaxRadiusKm: misAJour.driverMaxRadiusKm,
        driverOfferSeconds: misAJour.driverOfferSeconds,
        driverBaseFee: Number(misAJour.driverBaseFee),
        driverPerKmFee: Number(misAJour.driverPerKmFee),
      },
    });
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
      data: duPlusRecent.map(({ periodeIndex, ...reste }) => reste),
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
    /**
     * Les tickets archivés, sur demande.
     *
     * Clore un ticket l'archive : la liste, qui excluait les archivés sans
     * alternative, le faisait donc disparaître pour de bon. La plateforme ne
     * pouvait plus ni le relire ni le rouvrir.
     */
    const archives = req.query.archived === "true";

    const where: any = { archivedAt: archives ? { not: null } : null };
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
        // Pour que l'écran sache lequel est archivé, et depuis quand.
        archivedAt: t.archivedAt,
        organization: t.org.name,
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

    // Clore archive le ticket : sans cela, le commerçant le voyait encore actif
    // et sa réponse le rouvrait aussitôt.
    const { ticket, precedent } = await TicketMessageService.changerEtat(ticketId, body.status);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "UPDATE_TICKET_STATUS",
        target: ticketId,
        changes: { status: body.status } as any,
      },
    });

    if (precedent !== body.status) {
      await TicketMessageService.notifierChangementEtat(
        ticketId,
        "Votre ticket a changé d'état",
        `Ticket « ${ticket.title} » : ${LIBELLES_STATUT[body.status] || body.status}.`
      );
    }

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});


// ============================================================================
// LIVREURS
// ============================================================================

/**
 * GET /superowner/drivers - Les livreurs, et où en est leur dossier
 *
 * La plateforme n'avait aucune page sur ses livreurs : elle ne pouvait ni les
 * voir, ni les valider, ni les écarter. N'importe qui s'inscrivait et recevait
 * une course dans la minute.
 */
router.get("/drivers", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const statut = req.query.status as string;

    const where = statut && statut !== "ALL" ? { status: statut } : {};

    const [livreurs, total, parEtat] = await Promise.all([
      db.driver.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          documents: { select: { type: true, status: true, expiryDate: true } },
          _count: { select: { deliveries: true } },
        },
        // Les dossiers à traiter d'abord : c'est ce que la plateforme vient
        // faire ici.
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      db.driver.count({ where }),
      db.driver.groupBy({ by: ["status"], _count: true }),
    ]);

    res.json({
      drivers: livreurs.map((livreur) => {
        const attendues = piecesAttendues(livreur.vehicleType);
        const validees = new Set(
          livreur.documents.filter((piece) => piece.status === "APPROVED").map((p) => p.type)
        );

        return {
          id: livreur.id,
          name: livreur.name,
          email: livreur.email,
          phone: livreur.phone,
          vehicleType: livreur.vehicleType,
          vehiclePlate: livreur.vehiclePlate,
          status: livreur.status,
          statusReason: livreur.statusReason,
          approvedAt: livreur.approvedAt,
          isOnline: livreur.isOnline,
          // Nul tant que personne ne l'a noté : classer les livreurs sur un 5
          // par défaut revenait à ne pas les classer du tout.
          rating: livreur.totalRatings > 0 ? Number(livreur.rating) : null,
          avis: livreur.totalRatings,
          totalDeliveries: livreur.totalDeliveries,
          totalEarnings: Number(livreur.totalEarnings),
          courses: livreur._count.deliveries,
          // De quoi voir d'un coup d'œil ce qu'il reste à examiner.
          piecesDeposees: livreur.documents.length,
          piecesValidees: validees.size,
          piecesAttendues: attendues.length,
          dossierComplet: attendues.every((type) => validees.has(type)),
          createdAt: livreur.createdAt,
        };
      }),
      counts: Object.fromEntries(parEtat.map((ligne) => [ligne.status, ligne._count])),
      pagination: { total, limit, offset },
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/drivers/:driverId - Le dossier complet d'un livreur
router.get("/drivers/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dossier = await DriverApprovalService.dossier(req.params.driverId as string);

    res.json({
      driver: {
        id: dossier.id,
        name: dossier.name,
        email: dossier.email,
        phone: dossier.phone,
        vehicleType: dossier.vehicleType,
        vehiclePlate: dossier.vehiclePlate,
        status: dossier.status,
        statusReason: dossier.statusReason,
        approvedAt: dossier.approvedAt,
        isOnline: dossier.isOnline,
        rating: dossier.totalRatings > 0 ? Number(dossier.rating) : null,
        avis: dossier.totalRatings,
        totalDeliveries: dossier.totalDeliveries,
        totalEarnings: Number(dossier.totalEarnings),
        createdAt: dossier.createdAt,
      },
      documents: dossier.documents.map((piece) => ({
        id: piece.id,
        type: piece.type,
        libelle: libelleDuDocument(piece.type),
        documentUrl: piece.documentUrl,
        expiryDate: piece.expiryDate,
        status: piece.status,
        reviewNote: piece.reviewNote,
        reviewedAt: piece.reviewedAt,
        createdAt: piece.createdAt,
      })),
      piecesAttendues: dossier.piecesAttendues.map((type) => ({
        type,
        libelle: libelleDuDocument(type),
      })),
      piecesManquantes: dossier.piecesManquantes,
      dossierComplet: dossier.dossierComplet,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /superowner/drivers/:driverId/documents/:documentId - Statuer sur une pièce
router.patch(
  "/drivers/:driverId/documents/:documentId",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        approuve: z.boolean(),
        note: z.string().max(500).optional(),
      });
      const body = schema.parse(req.body);

      const piece = await DriverApprovalService.examinerPiece(
        req.params.driverId as string,
        req.params.documentId as string,
        body
      );

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: body.approuve ? "APPROVE_DRIVER_DOCUMENT" : "REJECT_DRIVER_DOCUMENT",
          target: req.params.driverId as string,
          changes: { type: piece.type, note: body.note } as any,
        },
      });

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

// POST /superowner/drivers/:driverId/approve - Valider le livreur
router.post("/drivers/:driverId/approve", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await DriverApprovalService.valider(
      req.params.driverId as string,
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "APPROVE_DRIVER",
        target: livreur.id,
        changes: { status: "ACTIVE" } as any,
      },
    });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/drivers/:driverId/reject - Refuser ou suspendre
router.post("/drivers/:driverId/reject", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      // Refus d'un dossier, suspension d'un livreur en activité, ou mise en
      // sommeil : trois gestes, une seule mécanique.
      etat: z.enum(["REJECTED", "SUSPENDED", "INACTIVE"]).default("REJECTED"),
      raison: z.string().min(3, "Dites au livreur pourquoi"),
    });
    const body = schema.parse(req.body);

    const livreur = await DriverApprovalService.ecarter(
      req.params.driverId as string,
      body.etat,
      body.raison,
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "SET_ASIDE_DRIVER",
        target: livreur.id,
        changes: { status: body.etat, raison: body.raison } as any,
      },
    });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/drivers/:driverId/reactivate - Rétablir un livreur suspendu
router.post("/drivers/:driverId/reactivate", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await DriverApprovalService.reactiver(
      req.params.driverId as string,
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "REACTIVATE_DRIVER",
        target: livreur.id,
        changes: { status: "ACTIVE" } as any,
      },
    });

    res.json({ success: true, driver: livreur });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// FICHE D'UNE BOUTIQUE
// ============================================================================

/**
 * La liste des boutiques était un cul-de-sac : des noms et des compteurs, sans
 * pouvoir ouvrir une fiche ni corriger quoi que ce soit.
 *
 * La plateforme corrige une liste courte et assumée — adresse, coordonnées,
 * adresse publique, téléphone, e-mail. Le catalogue, les prix et les horaires
 * restent au commerçant : c'est lui qui répond de ce que paie un client.
 *
 * Ces routes vivent ici, et non sous /api/stores, parce que le cloisonnement y
 * refuse — à raison — un compte qui n'appartient pas à l'organisation.
 */

// GET /superowner/stores/:storeId - La fiche d'une boutique
router.get("/stores/:storeId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, store: await StoreSupportService.fiche(req.params.storeId as string) });
  } catch (err) {
    next(err);
  }
});

const correctionSchema = z
  .object({
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    postalCode: z.string().optional().nullable(),
    latitude: z.union([z.number(), z.string()]).optional().nullable(),
    longitude: z.union([z.number(), z.string()]).optional().nullable(),
    slug: z.string().optional(),
    phone: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
  })
  // Les champs inconnus ne sont pas retirés en silence : le service les refuse
  // en nommant celui qui appartient au commerçant.
  .passthrough();

// PATCH /superowner/stores/:storeId - Corriger les champs de support
router.patch("/stores/:storeId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = correctionSchema.parse(req.body);

    if (Object.keys(corps).length === 0) {
      throw new ApiError(400, "Aucun champ à corriger", "NOTHING_TO_CHANGE");
    }

    const { boutique, changements, situeeAutomatiquement } = await StoreSupportService.corriger(
      req.params.storeId as string,
      corps as any,
      req.userId as string
    );

    // Le journal garde l'avant et l'après : une correction de la plateforme doit
    // pouvoir se retrouver et s'expliquer.
    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CORRECT_STORE",
        target: boutique.id,
        changes: changements as any,
      },
    });

    res.json({
      success: true,
      message: `${Object.keys(changements).map(libelleDuChamp).join(", ")} corrigé${
        Object.keys(changements).length > 1 ? "s" : ""
      }${situeeAutomatiquement ? ", et la boutique a été située" : ""}`,
      store: boutique,
      changements,
      situeeAutomatiquement,
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// VERSEMENTS AUX LIVREURS
// ============================================================================

/**
 * Les gains d'un livreur s'accumulaient sans que rien ne les paie. Arrêter un
 * relevé prend les courses dues d'une période ; le payer marque le relevé
 * versé. Une course déjà portée par un relevé n'est jamais reprise.
 */

// GET /superowner/payouts - Les relevés, filtrés par état
router.get("/payouts", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const liste = await DriverPayoutService.lister({
      status: req.query.status as string | undefined,
      driverId: req.query.driverId as string | undefined,
    });

    res.json({
      ...liste,
      // Ce que la plateforme doit et qu'aucun relevé ne porte encore : le
      // chiffre qui n'existait nulle part.
      reste: await DriverPayoutService.resteADevoir(),
      // La période que l'écran propose par défaut, pour ne pas la saisir
      // chaque semaine à la main.
      periodeProposee: semainePrecedente(),
      moyens: MOYENS_VERSEMENT,
    });
  } catch (err) {
    next(err);
  }
});

const arreteSchema = z.object({
  periodStart: z.string().min(1, "Donnez le début de la période"),
  periodEnd: z.string().min(1, "Donnez la fin de la période"),
  driverId: z.string().optional(),
});

// POST /superowner/payouts/draw - Arrêter les relevés d'une période
router.post("/payouts/draw", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = arreteSchema.parse(req.body);
    const debut = new Date(corps.periodStart);
    const fin = new Date(corps.periodEnd);

    if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime())) {
      throw new ApiError(400, "Période illisible", "INVALID_PERIOD");
    }

    const releves = corps.driverId
      ? [await DriverPayoutService.arreter(corps.driverId, debut, fin)]
      : await DriverPayoutService.arreterTous(debut, fin);

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "DRAW_DRIVER_PAYOUTS",
        target: corps.driverId || "all",
        changes: { periodStart: debut, periodEnd: fin, releves: releves.length } as any,
      },
    });

    res.status(201).json({
      success: true,
      message:
        releves.length === 0
          ? "Aucune course à payer sur cette période"
          : `${releves.length} relevé${releves.length > 1 ? "s" : ""} arrêté${releves.length > 1 ? "s" : ""}`,
      payouts: releves.length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/payouts/:payoutId - Le détail d'un relevé
router.get("/payouts/:payoutId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, payout: await DriverPayoutService.detail(req.params.payoutId as string) });
  } catch (err) {
    next(err);
  }
});

const versementSchema = z.object({
  method: z.string().min(1, "Choisissez un moyen de versement"),
  reference: z.string().optional(),
  note: z.string().optional(),
});

// POST /superowner/payouts/:payoutId/pay - Marquer un relevé versé
router.post("/payouts/:payoutId/pay", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const corps = versementSchema.parse(req.body);
    const releve = await DriverPayoutService.payer(
      req.params.payoutId as string,
      corps,
      req.userId as string
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "PAY_DRIVER_PAYOUT",
        target: releve.id,
        changes: { amount: Number(releve.amount), method: corps.method, reference: corps.reference } as any,
      },
    });

    res.json({ success: true, payout: releve });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/payouts/:payoutId/cancel - Annuler un relevé non versé
router.post("/payouts/:payoutId/cancel", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const releve = await DriverPayoutService.annuler(
      req.params.payoutId as string,
      (req.body?.raison as string) || ""
    );

    await db.systemAuditLog.create({
      data: {
        adminId: req.userId as string,
        action: "CANCEL_DRIVER_PAYOUT",
        target: releve.id,
        changes: { raison: releve.note } as any,
      },
    });

    res.json({ success: true, payout: releve });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /superowner/stores/:storeId/ouverture - Ouvrir ou fermer un commerce
 *
 * Le commerçant a ce bouton dans son espace ; la plateforme n'avait que le tout
 * ou rien de la suspension du compte, qui est autre chose.
 */
router.post(
  "/stores/:storeId/ouverture",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({ ouvert: z.boolean(), motif: z.string().max(300).optional() });
      const body = schema.parse(req.body);

      const { boutique, ouvert, motif } = await StoreSupportService.basculerLOuverture(
        req.params.storeId as string,
        body.ouvert,
        body.motif
      );

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: ouvert ? "OPEN_STORE" : "CLOSE_STORE",
          target: boutique.id,
          changes: { isOpen: ouvert, motif } as any,
        },
      });

      res.json({
        success: true,
        message: ouvert ? "Boutique rouverte" : "Boutique fermée",
        store: boutique,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// DOSSIER DU COMMERÇANT
// ============================================================================

/**
 * Le dossier d'un commerçant : son identité de facturation et ses pièces.
 *
 * La plateforme lui facture une commission sans jamais avoir vu un
 * justificatif. Ces routes lui permettent de statuer sur ce qu'il a déposé.
 */

// GET /superowner/organizations/:orgId/profile - Le dossier d'un commerçant
router.get(
  "/organizations/:orgId/profile",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: await MerchantProfileService.dossier(req.params.orgId as string),
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /superowner/organizations/:orgId/documents/:documentId - Statuer sur une pièce
router.patch(
  "/organizations/:orgId/documents/:documentId",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = z.object({
        approuve: z.boolean(),
        note: z.string().max(500).optional(),
      });
      const body = schema.parse(req.body);

      const piece = await MerchantProfileService.examinerPiece(
        req.params.orgId as string,
        req.params.documentId as string,
        body
      );

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: body.approuve ? "APPROVE_MERCHANT_DOCUMENT" : "REJECT_MERCHANT_DOCUMENT",
          target: req.params.orgId as string,
          changes: { type: piece.type, note: body.note } as any,
        },
      });

      res.json({ success: true, document: piece });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /superowner/organizations/:orgId/approve - Valider un commerce
 *
 * Il pourra ouvrir sa boutique et recevoir des commandes. Refusé tant qu'une
 * pièce exigée n'est pas validée.
 */
router.post(
  "/organizations/:orgId/approve",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const org = await MerchantApprovalService.valider(orgId, req.userId as string);

      await db.systemAuditLog.create({
        data: {
          adminId: req.userId as string,
          action: "APPROVE_MERCHANT",
          target: orgId,
          changes: { approvedAt: org.approvedAt } as any,
        },
      });

      res.json({ success: true, message: "Commerce validé", organization: org });
    } catch (err) {
      next(err);
    }
  }
);

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

    // Le compte est gardé trente secondes : sans cet oubli, le nouvel
    // administrateur attendrait avant d'entrer.
    oublierCompte(compte.id);

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

    oublierCompte(adminId);

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

// ============================================================================
// MEMBERS (CLIENTS, MERCHANTS, DELIVERIES, DRIVERS)
// ============================================================================

// GET /superowner/members/clients - Liste des clients
router.get("/members/clients", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = {
      deletedAt: null,
      ...(status && status !== 'all' ? { status } : {})
    };

    const [clients, total] = await Promise.all([
      db.customer.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          totalOrders: true,
          totalSpent: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.customer.count({ where })
    ]);

    res.json({
      clients: clients.map(c => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        status: c.status,
        joinDate: c.createdAt,
        totalOrders: c.totalOrders,
        totalSpent: Number(c.totalSpent),
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/merchants - Liste des commerçants
router.get("/members/merchants", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [merchants, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          tier: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.organization.count({ where })
    ]);

    res.json({
      merchants: merchants.map(m => ({
        id: m.id,
        name: m.name,
        email: m.email,
        storeName: m.name,
        status: m.status,
        joinDate: m.createdAt,
        tier: m.tier,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/deliveries - Liste des livreurs
router.get("/members/deliveries", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [deliveries, total] = await Promise.all([
      db.driver.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          totalDeliveries: true,
          rating: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.driver.count({ where })
    ]);

    res.json({
      deliveries: deliveries.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        companyName: undefined,
        status: d.status,
        joinDate: d.createdAt,
        deliveries: d.totalDeliveries,
        rating: d.rating ? Number(d.rating) : undefined,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/members/drivers - Liste des drivers (VTC/Taxi/Coursiers)
router.get("/members/drivers", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    const where = status && status !== 'all' ? { status } : {};

    const [drivers, total] = await Promise.all([
      db.driver.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          vehicleType: true,
          status: true,
          createdAt: true,
          totalDeliveries: true,
          rating: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      db.driver.count({ where })
    ]);

    res.json({
      drivers: drivers.map(d => ({
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        vehicleType: d.vehicleType,
        status: d.status,
        joinDate: d.createdAt,
        deliveries: d.totalDeliveries,
        rating: d.rating ? Number(d.rating) : undefined,
      })),
      pagination: { total, limit, offset }
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// CHAT SUPPORT LIVREURS
// ============================================================================

// GET /superowner/driver-support - Conversations avec les livreurs
router.get("/driver-support", authMiddleware, isSuperOwner, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await DriverSupportService.conversations() });
  } catch (err) {
    next(err);
  }
});

// GET /superowner/driver-support/:driverId - Le fil d'un livreur
router.get("/driver-support/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverId = req.params.driverId as string;
    const [messages, livreur] = await Promise.all([
      DriverSupportService.fil(driverId),
      db.driver.findUnique({
        where: { id: driverId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isOnline: true,
          currentOrderId: true,
          latitude: true,
          longitude: true,
          lastLocationUpdate: true,
          gpsLostAt: true,
        },
      }),
    ]);

    if (!livreur) throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");

    await DriverSupportService.marquerLu(driverId, "SUPPORT");
    res.json({ success: true, data: { driver: livreur, messages } });
  } catch (err) {
    next(err);
  }
});

// POST /superowner/driver-support/:driverId - Répondre à un livreur
router.post("/driver-support/:driverId", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ body: z.string().min(1).max(LONGUEUR_MAX) }).parse(req.body);
    const message = await DriverSupportService.envoyer(req.params.driverId as string, "SUPPORT", body.body, {
      authorId: (req as any).userId,
    });
    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// AVIS SIGNALÉS
// ============================================================================

// GET /superowner/review-reports?etat=EN_ATTENTE|TRAITES - Les avis signalés
router.get("/review-reports", authMiddleware, isSuperOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const etat = req.query.etat === "TRAITES" ? "TRAITES" : "EN_ATTENTE";
    const skip = parseInt((req.query.skip as string) || "0") || 0;
    const take = Math.min(parseInt((req.query.take as string) || "50") || 50, 100);

    res.json(await ReviewModerationService.lister(etat, skip, take));
  } catch (err) {
    next(err);
  }
});

// POST /superowner/review-reports/:reportId/decision - Conserver ou retirer l'avis
router.post(
  "/review-reports/:reportId/decision",
  authMiddleware,
  isSuperOwner,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          decision: z.enum(["KEPT", "REMOVED"]),
          note: z.string().max(1000).optional(),
        })
        .parse(req.body);

      const signalement = await ReviewModerationService.decider(
        req.params.reportId as string,
        body.decision,
        body.note,
        req.userId as string
      );

      res.json({ success: true, signalement });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
