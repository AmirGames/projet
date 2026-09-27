import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { getEnv } from "../config/env";
import { emitNotification } from "../config/socket";
import { LIBELLES_REVERSEMENT, LigneReversement, lignesDuReversement } from "../utils/reversement";
import { dateBruxelles, fichierSepa, ibanNormalise, ibanValide, VirementSepa } from "../utils/sepa";
import { debutDeSemaine, semaineEcoulee } from "../utils/semaine-bruxelles";
import { DriverPayoutService, MOYENS_VERSEMENT } from "./driver-payout.service";

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
 * seule fois : `Order.merchantPayoutId`. Une commande terminée après l'arrêté
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
} as const;

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
function commandesAReverser(orgId: string, fin: Date) {
  const debut = debutDesReversements();
  return db.order.findMany({
    where: {
      store: { orgId },
      status: "COMPLETED",
      merchantPayoutId: null,
      deletedAt: null,
      createdAt: { lt: fin, ...(debut ? { gte: debut } : {}) },
      // Payée en ligne mais remboursée : il n'y a rien à reverser.
      NOT: { paymentStatus: "REFUNDED" },
    },
    select: SELECTION_COMMANDE,
  });
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

    const [commandes, reportes] = await Promise.all([
      commandesAReverser(orgId, periodEnd),
      db.merchantPayout.findMany({ where: { orgId, status: "CARRIED", carriedToId: null } }),
    ]);

    if (commandes.length === 0 && reportes.length === 0) return null;

    const report = reportes.reduce((s, r) => s + Number(r.amount), 0);
    const { lignes, net } = lignesDuReversement(commandes, report);

    // Plus de retenues que de ventes : le solde se reporte, il ne se vire pas.
    const status = net > 0 ? "PENDING" : net < 0 ? "CARRIED" : "PAID";

    const releve = await db.$transaction(async (tx) => {
      const cree = await tx.merchantPayout.create({
        data: {
          orgId,
          periodStart,
          periodEnd,
          orderCount: commandes.length,
          lines: lignes as any,
          amount: net,
          status,
          ...(status === "PAID" ? { paidAt: new Date(), note: "Rien à verser" } : {}),
        },
      });

      if (commandes.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: commandes.map((c) => c.id) } },
          data: { merchantPayoutId: cree.id },
        });
      }

      if (reportes.length > 0) {
        await tx.merchantPayout.updateMany({
          where: { id: { in: reportes.map((r) => r.id) } },
          data: { carriedToId: cree.id },
        });
      }

      return cree;
    });

    logger.info("Merchant payout drawn up", { orgId, payoutId: releve.id, net, status });
    return releve;
  }

  /** Arrête les relevés de tous les commerçants qui ont quelque chose à reverser. */
  static async arreterTous(periodStart: Date, periodEnd: Date) {
    const [avecCommandes, avecReport] = await Promise.all([
      db.order.findMany({
        where: {
          status: "COMPLETED",
          merchantPayoutId: null,
          deletedAt: null,
          createdAt: { lt: periodEnd, ...(debutDesReversements() ? { gte: debutDesReversements() as Date } : {}) },
          NOT: { paymentStatus: "REFUNDED" },
        },
        select: { store: { select: { orgId: true } } },
        distinct: ["storeId"],
      }),
      db.merchantPayout.findMany({
        where: { status: "CARRIED", carriedToId: null },
        select: { orgId: true },
      }),
    ]);

    const orgIds = [
      ...new Set([...avecCommandes.map((c) => c.store.orgId), ...avecReport.map((r) => r.orgId)]),
    ];

    const releves = [];
    for (const orgId of orgIds) {
      const releve = await this.arreter(orgId, periodStart, periodEnd);
      if (releve) releves.push(releve);
    }
    return releves;
  }

  /**
   * L'arrêté du lundi : la semaine écoulée, pour les commerçants et les
   * livreurs. Une seule fois par semaine : si un relevé de cette période existe
   * déjà, on ne refait rien — une commande terminée entre-temps attendra le
   * relevé suivant.
   */
  static async arreterLaSemaine(maintenant = new Date()) {
    const { periodStart, periodEnd } = semaineEcoulee(maintenant);
    const debut = debutDesReversements();

    // Pas encore activé, ou la première semaine n'est pas encore écoulée.
    if (!debut || periodEnd <= debut) {
      return { periodStart, periodEnd, commercants: 0, livreurs: 0, inactif: true };
    }

    const [dejaCommercants, dejaLivreurs] = await Promise.all([
      db.merchantPayout.count({ where: { periodEnd } }),
      db.driverPayout.count({ where: { periodEnd } }),
    ]);

    const commercants = dejaCommercants > 0 ? [] : await this.arreterTous(periodStart, periodEnd);
    const livreurs = dejaLivreurs > 0 ? [] : await DriverPayoutService.arreterTous(periodStart, periodEnd);

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
   * Marque des relevés versés, commerçants et livreurs ensemble : c'est un lot
   * SEPA qui part en une fois.
   */
  static async payerLeLot(
    ids: { commercants: string[]; livreurs: string[] },
    versement: { method: string; reference?: string },
    adminId: string
  ) {
    if (!MOYENS_VERSEMENT.includes(versement.method as (typeof MOYENS_VERSEMENT)[number])) {
      throw new ApiError(400, "Moyen de versement inconnu", "INVALID_METHOD");
    }

    const payes = await db.merchantPayout.updateMany({
      where: { id: { in: ids.commercants }, status: "PENDING" },
      data: {
        status: "PAID",
        method: versement.method,
        reference: versement.reference?.trim() || null,
        paidAt: new Date(),
        paidBy: adminId,
      },
    });

    const releves = await db.merchantPayout.findMany({
      where: { id: { in: ids.commercants }, status: "PAID", paidBy: adminId },
      select: { orgId: true, amount: true },
    });
    for (const r of releves) {
      await this.prevenir(r.orgId, "Versement effectué", `${Number(r.amount).toFixed(2)} € sont en route vers votre compte.`);
    }

    let livreurs = 0;
    for (const id of ids.livreurs) {
      try {
        await DriverPayoutService.payer(id, versement, adminId);
        livreurs += 1;
      } catch (err) {
        // Déjà versé ou annulé entre-temps : on n'arrête pas le lot pour ça.
        logger.warn("Relevé livreur non marqué versé", { id, error: err instanceof Error ? err.message : err });
      }
    }

    return { commercants: payes.count, livreurs };
  }

  /**
   * Le fichier SEPA de tous les versements en attente, commerçants et
   * livreurs. Un bénéficiaire sans IBAN valide est écarté et signalé : le
   * fichier entier serait rejeté par la banque.
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

    const [commercants, livreurs] = await Promise.all([
      db.merchantPayout.findMany({
        where: { status: "PENDING" },
        include: { org: { select: { name: true, legalName: true, iban: true, bic: true, accountHolder: true } } },
      }),
      db.driverPayout.findMany({
        where: { status: "PENDING" },
        include: { driver: { select: { name: true, iban: true, bic: true, accountHolder: true } } },
      }),
    ]);

    const periode = (debut: Date, fin: Date) =>
      `${dateBruxelles(debut)} au ${dateBruxelles(new Date(fin.getTime() - 1))}`;

    const virements: VirementSepa[] = [];
    const ecartes: { type: string; id: string; nom: string; montant: number; raison: string }[] = [];
    const inclus = { commercants: [] as string[], livreurs: [] as string[] };

    for (const r of commercants) {
      const nom = r.org.accountHolder || r.org.legalName || r.org.name;
      if (!ibanValide(r.org.iban)) {
        ecartes.push({ type: "commercant", id: r.id, nom, montant: Number(r.amount), raison: "IBAN manquant ou invalide" });
        continue;
      }
      virements.push({
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
        id: `DP-${r.id}`,
        nom,
        iban: r.driver.iban as string,
        bic: r.driver.bic,
        montant: Number(r.amount),
        communication: `Courses du ${periode(r.periodStart, r.periodEnd)}`,
      });
      inclus.livreurs.push(r.id);
    }

    const aPayer = virements.filter((v) => v.montant > 0);
    const reference = `VERSEMENTS-${maintenant.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

    return {
      reference,
      total: Math.round(aPayer.reduce((s, v) => s + v.montant * 100, 0)) / 100,
      nombre: aPayer.length,
      inclus,
      ecartes,
      xml:
        aPayer.length > 0
          ? fichierSepa(
              { nom: env.SEPA_DEBTOR_NAME, iban: env.SEPA_DEBTOR_IBAN, bic: env.SEPA_DEBTOR_BIC },
              aPayer,
              { reference, dateExecution: maintenant, maintenant }
            )
          : null,
    };
  }

  /** Prévient les membres du commerçant. */
  private static async prevenir(orgId: string, titre: string, corps: string) {
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
