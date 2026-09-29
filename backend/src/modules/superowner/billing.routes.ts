import { Router, Request, Response, NextFunction } from "express";
import { horsReversements, reversementsDepuis } from "../payouts/merchant-payout.service";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { authMiddleware } from "../../middleware/auth";
import { PlanService } from "../../services/plan.service";
import { fraisDusALaPlateforme, fraisDeServiceDus } from "../delivery/delivery-mode.service";
import { isSuperOwner } from "./shared";

const router = Router();

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
            // Réglées par les reversements du lundi : déjà retenues.
            AND: [horsReversements()],
          },
          select: {
            id: true,
            storeId: true,
            createdAt: true,
            totalAmount: true,
            discountAmount: true,
            feesAmount: true,
            serviceFeeAmount: true,
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
        // La part de ces frais que le commerçant a encaissée pour la plateforme.
        livraisonDue: fraisDusALaPlateforme(commande),
        // Les frais de service que le client a payés, à la plateforme.
        serviceDu: fraisDeServiceDus(commande),
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
        deliveryFees: Number(lignes.reduce((somme, ligne) => somme + ligne.livraisonDue, 0).toFixed(2)),
        serviceFees: Number(lignes.reduce((somme, ligne) => somme + ligne.serviceDu, 0).toFixed(2)),
        totalDue: Number(
          lignes
            .reduce((somme, ligne) => somme + ligne.commission + ligne.livraisonDue + ligne.serviceDu, 0)
            .toFixed(2)
        ),
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

export default router;
