import { Router, Request, Response, NextFunction } from "express";
import { horsReversements, reversementsDepuis } from "../payouts/merchant-payout.service";
import { db } from "../../services/db";
import { authMiddleware } from "../auth/auth.middleware";
import { PlanService, nombreOuNull } from "../plans/plan.service";
import { fraisDusALaPlateforme, fraisDeServiceDus } from "../delivery/delivery-mode.service";
import { isSuperOwner } from "./shared";
import { detailFacturation, moisDe } from "./billing-detail.service";

const router = Router();

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
              // Les commandes réglées par les reversements du lundi ne se
              // facturent plus : la commission y est déjà retenue.
              where: { storeId: { in: storeIds }, createdAt: { gte: debutMois }, AND: [horsReversements()] },
              select: {
                totalAmount: true,
                feesAmount: true,
                serviceFeeAmount: true,
                status: true,
                deliveryMode: true,
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
        // Un taux négocié avec le commerçant prime sur celui de sa formule.
        const tauxDuJour =
          nombreOuNull(org.customCommissionPercent) ?? tauxParFormule.get(org.tier) ?? tauxParDefaut;

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

        // Les frais des courses faites par les livreurs de la plateforme : le
        // client les a payés au commerçant, ils reviennent à la plateforme.
        const fraisLivraison = commandes.reduce((somme, c) => somme + fraisDusALaPlateforme(c), 0);
        // Les frais de service payés par ses clients : à la plateforme aussi.
        const fraisService = commandes.reduce((somme, c) => somme + fraisDeServiceDus(c), 0);

        const dejaFacture = org.commissionHistory.length > 0;

        return {
          id: org.id,
          organization: org.name,
          tier: org.tier,
          amount: Number(commission.toFixed(2)),
          // Frais de livraison encaissés par le commerçant pour la plateforme.
          deliveryFeesDue: Number(fraisLivraison.toFixed(2)),
          // Frais de service encaissés par le commerçant pour la plateforme.
          serviceFeesDue: Number(fraisService.toFixed(2)),
          // Ce que le commerçant doit au total : commission et frais.
          totalDue: Number((commission + fraisLivraison + fraisService).toFixed(2)),
          status: dejaFacture
            ? "PAID"
            : commission + fraisLivraison + fraisService > 0
              ? "PENDING"
              : "PAID",
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
        deliveryFeesDue: Number(lignes.reduce((s, l) => s + l.deliveryFeesDue, 0).toFixed(2)),
        serviceFeesDue: Number(lignes.reduce((s, l) => s + l.serviceFeesDue, 0).toFixed(2)),
        activeSubscriptions: organisations.filter((o) => o.status === "ACTIVE").length,
      },
      pagination: { total: lignes.length, limit, offset },
      // À partir de cette date, la commission se retient sur les reversements
      // du lundi : elle n'apparaît plus ici.
      reversementsDepuis: reversementsDepuis(),
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
    res.json(await detailFacturation(req.params.orgId as string, req.query.period as string | undefined));
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

export default router;
