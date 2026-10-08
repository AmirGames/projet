import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { logger } from "../../config/logger";
import { getEnv } from "../../config/env";
import { emitNotification } from "../realtime/socket";
import {
  AjustementRemboursement,
  LIBELLES_REVERSEMENT,
  LigneReversement,
  ajustementRemboursement,
  lignesDuReversement,
} from "../../utils/reversement";
import { dateBruxelles, ibanNormalise, ibanValide, VirementSepa } from "../../utils/sepa";
import { debutDeSemaine, semaineEcoulee } from "../../utils/semaine-bruxelles";
import { DriverPayoutService } from "./driver-payout.service";
import { MOTIF_LIVRAISON_ECHOUEE } from "../orders/order-acceptance.service";

/**
 * Les reversements aux commerçants.
 *
 * Les clients paient en ligne et l'argent arrive chez la plateforme. Le relevé
 * mensuel ne calculait que ce que le commerçant devait (commission, frais),
 * comme s'il encaissait lui-même : ce que la plateforme lui devait — ses
 * ventes — n'était calculé ni tracé nulle part.
 *
 * Chaque lundi à 00 h 00 (Bruxelles), la semaine écoulée est arrêtée : un
 * relevé par commerçant, avec ses lignes codées. La plateforme télécharge un
 * seul fichier SEPA pour tous les commerçants et livreurs, l'importe dans sa
 * banque, puis marque le lot versé.
 *
 * Une commande entre dans un relevé une fois terminée (COMPLETED), et une
 * seule fois : `Order.merchantPayoutId`. Une commande perdue en livraison par
 * un livreur de la plateforme y entre aussi : la plateforme la paie au
 * commerçant comme une vente (voir utils/reversement.ts, ligne 130). Une commande terminée après l'arrêté
 * de sa semaine passe dans le relevé suivant, elle n'est jamais perdue.
 */

const SELECTION_COMMANDE = {
  id: true,
  totalAmount: true,
  feesAmount: true,
  serviceFeeAmount: true,
  discountAmount: true,
  commissionAmount: true,
  deliveryMode: true,
  paymentId: true,
  status: true,
} as const;

/**
 * Les commandes dues au commerçant : terminées et non remboursées, ou perdues
 * en livraison par un livreur de la plateforme (remboursées au client, mais
 * dues au commerçant qui les a préparées).
 */
const DUES_AU_COMMERCANT = {
  OR: [
    // Payée en ligne mais remboursée : il n'y a rien à reverser.
    { status: "COMPLETED" as const, NOT: { paymentStatus: "REFUNDED" as const } },
    { status: "REJECTED" as const, rejectionReason: MOTIF_LIVRAISON_ECHOUEE },
  ],
};

/**
 * Le début des reversements : aucune commande d'avant n'est reprise. Sans
 * date réglée, l'arrêté automatique ne tourne pas — il ramasserait tout
 * l'historique dans un seul relevé.
 */
function debutDesReversements(): Date | null {
  const date = getEnv().PAYOUTS_START_DATE;
  // Le lundi 00 h 00 (Bruxelles) de la semaine de cette date.
  return date ? debutDeSemaine(new Date(`${date}T12:00:00Z`)) : null;
}

/**
 * Les commandes que l'ancienne facturation mensuelle peut encore réclamer.
 *
 * Depuis les reversements, la commission et les frais se retiennent chaque
 * semaine sur ce qui est reversé au commerçant : les lui facturer aussi en fin
 * de mois les lui ferait payer deux fois. La facturation ne compte plus que les
 * commandes d'avant le premier lundi des reversements.
 */
export function horsReversements() {
  const debut = debutDesReversements();
  return debut ? { createdAt: { lt: debut } } : {};
}

/** Le premier lundi des reversements, s'ils sont activés. */
export const reversementsDepuis = () => debutDesReversements();

/** Les commandes d'une organisation qui attendent d'être reversées. */
function commandesAReverser(orgId: string, fin: Date, client: Pick<typeof db, "order"> = db) {
  const debut = debutDesReversements();
  return client.order.findMany({
    where: {
      store: { orgId, org: { isDemo: false } },
      ...DUES_AU_COMMERCANT,
      merchantPayoutId: null,
      deletedAt: null,
      createdAt: { lt: fin, ...(debut ? { gte: debut } : {}) },
    },
    select: SELECTION_COMMANDE,
  }).then((commandes) => commandes.map((c) => ({ ...c, priseEnCharge: c.status === "REJECTED" })));
}

/**
 * Les remboursements clients pas encore répercutés : sur des commandes déjà
 * versées (relevé passé) ou sur celles de ce relevé. Une commande remboursée
 * avant d'être reversée n'entre pas dans les commandes dues : rien à corriger.
 */
async function remboursementsARepercuter(
  orgId: string,
  commandes: { id: string }[],
  client: Pick<typeof db, "order">,
) {
  const debut = debutDesReversements();
  const candidates = await client.order.findMany({
    where: {
      store: { orgId, org: { isDemo: false } },
      status: "COMPLETED",
      deletedAt: null,
      ...(debut ? { createdAt: { gte: debut } } : {}),
      payments: { some: { refundedAmount: { gt: 0 } } },
      OR: [{ merchantPayoutId: { not: null } }, { id: { in: commandes.map((c) => c.id) } }],
    },
    select: {
      ...SELECTION_COMMANDE,
      payments: { select: { id: true, refundedAmount: true, refundAccountedAmount: true } },
    },
  });

  const ajustement: AjustementRemboursement = { partCommercant: 0, commission: 0, nombre: 0 };
  const paiements: { id: string; ancien: number; nouveau: number }[] = [];
  for (const commande of candidates) {
    const paiement = commande.payments[0];
    if (!paiement) continue;
    const rembourse = Number(paiement.refundedAmount ?? 0);
    const ancien = Number(paiement.refundAccountedAmount ?? 0);
    if (rembourse <= ancien) continue;
    const { partCommercant, commission } = ajustementRemboursement(commande, rembourse, ancien);
    paiements.push({ id: paiement.id, ancien, nouveau: rembourse });
    if (partCommercant === 0 && commission === 0) continue;
    ajustement.partCommercant += partCommercant;
    ajustement.commission += commission;
    ajustement.nombre += 1;
  }
  return { ajustement, paiements };
}

/** La légende du relevé : chaque code présent, expliqué. */
function legende(lignes: LigneReversement[]) {
  return lignes.map((l) => ({ code: l.code, explication: LIBELLES_REVERSEMENT[l.code].explication }));
}

export class MerchantPayoutService {
  /**
   * Arrête le relevé d'un commerçant pour une période. Rien à arrêter (ni
   * commande, ni report) : `null`.
   */
  static async arreter(orgId: string, periodStart: Date, periodEnd: Date) {
    if (periodEnd <= periodStart) {
      throw new ApiError(400, "La fin de période précède son début", "INVALID_PERIOD");
    }

    const releve = await db.$transaction(async (tx) => {
      // Un seul arrêté à la fois par commerçant : deux passages simultanés
      // (deux instances, un clic double) lisaient les mêmes commandes et
      // créaient chacun un relevé. Le verrou tient jusqu'à la fin de la
      // transaction ; le second passage relit alors des commandes déjà rattachées.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`releve-commercant:${orgId}`}))`;

      const [commandes, reportes] = await Promise.all([
        commandesAReverser(orgId, periodEnd, tx),
        tx.merchantPayout.findMany({ where: { orgId, status: "CARRIED", carriedToId: null } }),
      ]);

      const { ajustement, paiements } = await remboursementsARepercuter(orgId, commandes, tx);

      if (commandes.length === 0 && reportes.length === 0 && ajustement.nombre === 0) return null;

      const report = reportes.reduce((s, r) => s + Number(r.amount), 0);
      const { lignes, net } = lignesDuReversement(commandes, report, ajustement);

      // Plus de retenues que de ventes : le solde se reporte, il ne se vire pas.
      const status = net > 0 ? "PENDING" : net < 0 ? "CARRIED" : "PAID";

      const cree = await tx.merchantPayout.create({
        data: {
          orgId,
          periodStart,
          periodEnd,
          orderCount: commandes.length,
          lines: lignes,
          amount: net,
          status,
          ...(status === "PAID" ? { paidAt: new Date(), note: "Rien à verser" } : {}),
        },
      });

      // Rattachement conditionnel : « encore non rattachée ». Si le nombre de
      // lignes touchées diffère, quelqu'un d'autre est passé : la transaction
      // est annulée plutôt que d'écraser son relevé.
      if (commandes.length > 0) {
        const { count } = await tx.order.updateMany({
          where: { id: { in: commandes.map((c) => c.id) }, merchantPayoutId: null },
          data: { merchantPayoutId: cree.id },
        });
        if (count !== commandes.length) {
          throw new ApiError(409, "Des commandes ont été rattachées à un autre relevé.", "PAYOUT_CONFLICT");
        }
      }

      if (reportes.length > 0) {
        const { count } = await tx.merchantPayout.updateMany({
          where: { id: { in: reportes.map((r) => r.id) }, carriedToId: null },
          data: { carriedToId: cree.id },
        });
        if (count !== reportes.length) {
          throw new ApiError(409, "Un solde reporté a été repris par un autre relevé.", "PAYOUT_CONFLICT");
        }
      }

      // Ces remboursements sont désormais comptés : le même ne l'est pas deux
      // fois. Conditionnel sur l'ancienne valeur, comme le rattachement.
      for (const paiement of paiements) {
        const { count } = await tx.payment.updateMany({
          where: { id: paiement.id, refundAccountedAmount: paiement.ancien },
          data: { refundAccountedAmount: paiement.nouveau },
        });
        if (count !== 1) {
          throw new ApiError(409, "Un remboursement a été répercuté par un autre relevé.", "PAYOUT_CONFLICT");
        }
      }

      return cree;
    });

    if (!releve) return null;

    logger.info("Merchant payout drawn up", { orgId, payoutId: releve.id, net: Number(releve.amount), status: releve.status });
    return releve;
  }

  /** Arrête les relevés de tous les commerçants qui ont quelque chose à reverser. */
  static async arreterTous(periodStart: Date, periodEnd: Date) {
    const [avecCommandes, avecReport, avecRemboursement] = await Promise.all([
      db.order.findMany({
        where: {
          store: { org: { isDemo: false } },
          ...DUES_AU_COMMERCANT,
          merchantPayoutId: null,
          deletedAt: null,
          createdAt: { lt: periodEnd, ...(debutDesReversements() ? { gte: debutDesReversements() as Date } : {}) },
        },
        select: { store: { select: { orgId: true } } },
        distinct: ["storeId"],
      }),
      db.merchantPayout.findMany({
        where: { status: "CARRIED", carriedToId: null },
        select: { orgId: true },
      }),
      // Un remboursement sur une commande déjà versée se corrige au relevé
      // suivant, même sans nouvelle vente. `arreter` ne crée rien si tout
      // est déjà répercuté.
      db.order.findMany({
        where: {
          store: { org: { isDemo: false } },
          status: "COMPLETED",
          deletedAt: null,
          merchantPayoutId: { not: null },
          ...(debutDesReversements() ? { createdAt: { gte: debutDesReversements() as Date } } : {}),
          payments: { some: { refundedAmount: { gt: 0 } } },
        },
        select: { store: { select: { orgId: true } } },
        distinct: ["storeId"],
      }),
    ]);

    // Reprise après échec partiel : un commerçant qui a déjà son relevé pour
    // cette période est sauté, les autres sont rattrapés.
    const dejaArretes = new Set(
      (await db.merchantPayout.findMany({ where: { periodEnd }, select: { orgId: true } })).map((r) => r.orgId)
    );
    const orgIds = [
      ...new Set([
        ...avecCommandes.map((c) => c.store.orgId),
        ...avecReport.map((r) => r.orgId),
        ...avecRemboursement.map((c) => c.store.orgId),
      ]),
    ].filter((orgId) => !dejaArretes.has(orgId));

    const releves = [];
    for (const orgId of orgIds) {
      // L'échec d'un commerçant n'empêche pas les suivants ; la relance du
      // lundi suivant (ou manuelle) reprend uniquement ceux qui manquent.
      try {
        const releve = await this.arreter(orgId, periodStart, periodEnd);
        if (releve) releves.push(releve);
      } catch (err) {
        logger.error("Merchant payout failed, will be retried", {
          orgId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    return releves;
  }

  /**
   * L'arrêté du lundi : la semaine écoulée, pour les commerçants et les
   * livreurs. Relançable : les bénéficiaires déjà arrêtés pour cette période sont
   * sautés, les autres rattrapés. Une commande terminée entre-temps attendra le
   * relevé suivant.
   */
  static async arreterLaSemaine(maintenant = new Date()) {
    const { periodStart, periodEnd } = semaineEcoulee(maintenant);
    const debut = debutDesReversements();

    // Pas encore activé, ou la première semaine n'est pas encore écoulée.
    if (!debut || periodEnd <= debut) {
      return { periodStart, periodEnd, commercants: 0, livreurs: 0, inactif: true };
    }

    // Chaque catégorie ignore elle-même les bénéficiaires déjà arrêtés : relancer
    // l'arrêté après un échec partiel rattrape ceux qui manquent.
    const commercants = await this.arreterTous(periodStart, periodEnd);
    const livreurs = await DriverPayoutService.arreterTous(periodStart, periodEnd);

    return { periodStart, periodEnd, commercants: commercants.length, livreurs: livreurs.length, inactif: false };
  }

  static async lister(filtres: { status?: string; orgId?: string; take?: number }) {
    const releves = await db.merchantPayout.findMany({
      where: {
        ...(filtres.status ? { status: filtres.status } : {}),
        ...(filtres.orgId ? { orgId: filtres.orgId } : {}),
      },
      include: { org: { select: { id: true, name: true, iban: true, accountHolder: true } } },
      orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
      take: Math.min(filtres.take ?? 100, 500),
    });

    return releves.map(({ org, ...releve }) => ({
      ...releve,
      amount: Number(releve.amount),
      organization: org.name,
      // Jamais l'IBAN entier : assez pour reconnaître le compte.
      ibanFin: org.iban ? ibanNormalise(org.iban).slice(-4) : null,
      ibanValide: ibanValide(org.iban),
    }));
  }

  /** Le relevé complet, ses lignes et la légende de ses codes. */
  static async detail(payoutId: string) {
    const releve = await db.merchantPayout.findUnique({
      where: { id: payoutId },
      include: { org: { select: { id: true, name: true, legalName: true, iban: true } } },
    });

    if (!releve) throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");

    const lignes = (releve.lines as unknown as LigneReversement[]) || [];
    const { org, ...reste } = releve;

    return {
      ...reste,
      amount: Number(releve.amount),
      organization: org.legalName || org.name,
      ibanFin: org.iban ? ibanNormalise(org.iban).slice(-4) : null,
      lines: lignes,
      legend: legende(lignes),
    };
  }

  /**
   * Les virements en attente qu'aucun lot ne porte encore : commerçants et
   * livreurs. Un bénéficiaire sans IBAN valide est écarté et signalé : le
   * fichier entier serait rejeté par la banque.
   */
  static async virementsEnAttente(client: Pick<typeof db, "merchantPayout" | "courierPayout"> = db) {
    const [commercants, livreurs] = await Promise.all([
      client.merchantPayout.findMany({
        where: { status: "PENDING", batchId: null },
        include: { org: { select: { name: true, legalName: true, iban: true, bic: true, accountHolder: true } } },
      }),
      client.courierPayout.findMany({
        where: { status: "PENDING", batchId: null },
        include: { driver: { select: { name: true, iban: true, bic: true, accountHolder: true } } },
      }),
    ]);

    const periode = (debut: Date, fin: Date) =>
      `${dateBruxelles(debut)} au ${dateBruxelles(new Date(fin.getTime() - 1))}`;

    const virements: (VirementSepa & { kind: "commercant" | "livreur"; payoutId: string })[] = [];
    const ecartes: { type: string; id: string; nom: string; montant: number; raison: string }[] = [];
    const inclus = { commercants: [] as string[], livreurs: [] as string[] };

    for (const r of commercants) {
      const nom = r.org.accountHolder || r.org.legalName || r.org.name;
      if (!ibanValide(r.org.iban)) {
        ecartes.push({ type: "commercant", id: r.id, nom, montant: Number(r.amount), raison: "IBAN manquant ou invalide" });
        continue;
      }
      virements.push({
        kind: "commercant",
        payoutId: r.id,
        id: `MP-${r.id}`,
        nom,
        iban: r.org.iban as string,
        bic: r.org.bic,
        montant: Number(r.amount),
        communication: `Reversement ventes du ${periode(r.periodStart, r.periodEnd)}`,
      });
      inclus.commercants.push(r.id);
    }

    for (const r of livreurs) {
      const nom = r.driver.accountHolder || r.driver.name;
      if (!ibanValide(r.driver.iban)) {
        ecartes.push({ type: "livreur", id: r.id, nom, montant: Number(r.amount), raison: "IBAN manquant ou invalide" });
        continue;
      }
      virements.push({
        kind: "livreur",
        payoutId: r.id,
        id: `DP-${r.id}`,
        nom,
        iban: r.driver.iban as string,
        bic: r.driver.bic,
        montant: Number(r.amount),
        communication: `Courses du ${periode(r.periodStart, r.periodEnd)}`,
      });
      inclus.livreurs.push(r.id);
    }

    return { virements, ecartes, inclus };
  }

  /**
   * Aperçu du lot à verser : ce que `PayoutBatchService.preparer` figerait
   * maintenant. Aucun effet de bord, aucun fichier : l'export se fait sur un
   * lot préparé et approuvé.
   */
  static async fichierDesVersements(maintenant = new Date()) {
    const env = getEnv();
    if (!env.SEPA_DEBTOR_IBAN || !env.SEPA_DEBTOR_NAME || !ibanValide(env.SEPA_DEBTOR_IBAN)) {
      throw new ApiError(
        400,
        "Le compte de la plateforme n'est pas réglé : renseignez SEPA_DEBTOR_NAME et SEPA_DEBTOR_IBAN.",
        "SEPA_DEBTOR_MISSING"
      );
    }

    const { virements, ecartes, inclus } = await this.virementsEnAttente();

    const aPayer = virements.filter((v) => v.montant > 0);
    const reference = `VERSEMENTS-${maintenant.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

    return {
      reference,
      total: Math.round(aPayer.reduce((s, v) => s + v.montant * 100, 0)) / 100,
      nombre: aPayer.length,
      inclus,
      ecartes,
      pret: aPayer.length > 0,
    };
  }

  /** Prévient les membres du commerçant. */
  static async prevenir(orgId: string, titre: string, corps: string) {
    try {
      const membres = await db.membership.findMany({
        where: { orgId },
        select: { user: { select: { email: true } } },
      });
      for (const m of membres) {
        if (!m.user?.email) continue;
        const notification = await db.notification.create({
          data: {
            type: "PLATFORM_ANNOUNCEMENT",
            title: titre,
            message: corps,
            recipientEmail: m.user.email,
            link: `/merchant/${orgId}/payouts`,
          },
        });
        emitNotification(m.user.email, notification);
      }
    } catch (err) {
      logger.warn("Notification de versement impossible", { orgId, error: err instanceof Error ? err.message : err });
    }
  }
}
