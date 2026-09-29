import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { horsReversements } from "../payouts/merchant-payout.service";
import { PlanService } from "../plans/plan.service";
import { fraisDusALaPlateforme, fraisDeServiceDus } from "../delivery/delivery-mode.service";

// Facturation et rapports partagent le même découpage mensuel.
export function moisDe(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Le détail de ce qu'un commerçant doit à la plateforme sur un mois : ses
 * commandes, la part de chacune, et le total.
 *
 * Partagé par l'écran de facturation et par l'émission de la facture Peppol :
 * la facture envoyée doit dire exactement ce que l'écran montrait.
 */
export async function detailFacturation(orgId: string, periodeDemandee?: string) {
  const organisation = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      email: true,
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
      peppolId: true,
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
  const demande = periodeDemandee || "";
  const debutMois = /^\d{4}-\d{2}$/.test(demande) ? new Date(`${demande}-01T00:00:00`) : new Date();
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
      commission: figee ? Number(commande.commissionAmount) : Number(((montant * taux) / 100).toFixed(2)),
    };
  });

  const chiffreAffaires = lignes.reduce((somme, ligne) => somme + ligne.total, 0);

  return {
    organization: {
      id: organisation.id,
      name: organisation.name,
      email: organisation.email,
      tier: organisation.tier,
      legalName: organisation.legalName,
      vatNumber: organisation.vatNumber,
      registrationNumber: organisation.registrationNumber,
      billingAddress: organisation.billingAddress,
      billingPostalCode: organisation.billingPostalCode,
      billingCity: organisation.billingCity,
      billingCountry: organisation.billingCountry,
      peppolId: organisation.peppolId,
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
  };
}
