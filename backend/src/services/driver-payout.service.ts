import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";
import { debutDeSemaine } from "../utils/semaine-bruxelles";
import { ibanNormalise, ibanValide } from "../utils/sepa";

/**
 * Les versements aux livreurs.
 *
 * Un livreur voyait ses gains grossir course après course — `totalEarnings` —
 * sans que rien ne les paie : ni période, ni relevé, ni trace de versement. Il
 * ne pouvait pas savoir si les 340 € annoncés étaient déjà sur son compte ou
 * toujours dus, et la plateforme n'avait aucun moyen de dire ce qu'elle devait.
 *
 * Le principe tient en une ligne : une course livrée est **due** tant qu'aucun
 * relevé ne la porte. Arrêter un relevé, c'est prendre les courses dues d'une
 * période et les rattacher ; les payer, c'est marquer ce relevé versé. Le lien
 * `OrderDelivery.payoutId` interdit qu'une course soit payée deux fois.
 */

export const ETATS_VERSEMENT = ["PENDING", "PAID", "CANCELLED"] as const;
export type EtatVersement = (typeof ETATS_VERSEMENT)[number];

/** Les moyens de versement proposés. */
export const MOYENS_VERSEMENT = ["BANK_TRANSFER", "CASH", "OTHER"] as const;

const LIBELLES_MOYEN: Record<string, string> = {
  BANK_TRANSFER: "Virement bancaire",
  CASH: "Espèces",
  OTHER: "Autre",
};

export const libelleDuMoyen = (moyen: string | null) =>
  moyen ? LIBELLES_MOYEN[moyen] || moyen : "";

/**
 * La rémunération d'une course.
 *
 * Elle est figée à l'attribution : le livreur est payé ce qu'on lui a annoncé,
 * pas les frais facturés au client. Les courses antérieures au barème n'ont
 * pas de montant figé, d'où le repli sur les frais de la commande.
 */
const gainDeLaCourse = (course: { driverPayout: unknown; order?: { feesAmount: unknown } | null }) =>
  Number((course.driverPayout as number | null) ?? (course.order?.feesAmount as number | null) ?? 0);

/** La somme de pourboires laissés après la livraison. */
const totalDesPourboires = (pourboires: { amount: unknown }[]) =>
  pourboires.reduce((somme, pourboire) => somme + Number(pourboire.amount), 0);

/**
 * La semaine écoulée, du lundi au lundi.
 *
 * C'est la période par défaut d'un arrêté : sans borne proposée, la plateforme
 * devrait les saisir à la main chaque semaine.
 */
export function semainePrecedente(reference = new Date()) {
  const jour = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const lundiCourant = new Date(jour);
  lundiCourant.setDate(jour.getDate() - ((jour.getDay() + 6) % 7));

  const debut = new Date(lundiCourant);
  debut.setDate(lundiCourant.getDate() - 7);

  return { periodStart: debut, periodEnd: lundiCourant };
}

export class DriverPayoutService {
  /**
   * Ce qui reste à verser à un livreur, et quand.
   *
   * Sert au livreur qui supprime son compte : ses courses de la semaine en
   * cours (lundi 00 h 00 → dimanche 23 h 59, Bruxelles) sont arrêtées le
   * lundi suivant avec celles de tout le monde, et versées sur son IBAN ;
   * un relevé déjà arrêté attend le prochain lot de virements.
   */
  static async soldeFinal(driverId: string, maintenant = new Date()) {
    const [dues, pourboires, enAttente, livreur] = await Promise.all([
      this.coursesDues(driverId),
      this.pourboiresDus(driverId),
      db.driverPayout.findMany({ where: { driverId, status: "PENDING" }, select: { amount: true } }),
      db.driver.findUnique({ where: { id: driverId }, select: { iban: true } }),
    ]);
    const nonArrete =
      dues.reduce((somme, course) => somme + gainDeLaCourse(course), 0) + totalDesPourboires(pourboires);
    const arrete = enAttente.reduce((somme, releve) => somme + Number(releve.amount), 0);
    // Le lundi qui vient, 00 h 00 à Bruxelles : l'arrêté de la semaine.
    const lundi = debutDeSemaine(new Date(debutDeSemaine(maintenant).getTime() + 8 * 86400000));
    return {
      montantDu: Math.round((nonArrete + arrete) * 100) / 100,
      coursesNonArretees: dues.length,
      versementLe: nonArrete + arrete > 0 ? lundi : null,
      ibanValide: ibanValide(livreur?.iban),
      ibanFin: livreur?.iban ? ibanNormalise(livreur.iban).slice(-4) : null,
    };
  }

  /**
   * Ce qui est dû à un livreur : les courses livrées qu'aucun relevé ne porte.
   */
  static async coursesDues(driverId: string, bornes?: { debut?: Date; fin?: Date }) {
    return db.orderDelivery.findMany({
      where: {
        driverId,
        status: "DELIVERED",
        payoutId: null,
        ...(bornes?.debut || bornes?.fin
          ? {
              deliveryTime: {
                ...(bornes.debut ? { gte: bornes.debut } : {}),
                ...(bornes.fin ? { lt: bornes.fin } : {}),
              },
            }
          : {}),
      },
      include: { order: { select: { id: true, totalAmount: true, feesAmount: true } } },
      orderBy: { deliveryTime: "asc" },
    });
  }

  /**
   * Les pourboires laissés après la livraison, encaissés et qu'aucun relevé
   * ne porte encore. Ils se rattachent à la période où ils ont été payés : un
   * pourboire arrivé lundi matin pour une course de dimanche part avec le
   * relevé suivant, pas avec celui déjà arrêté.
   */
  static async pourboiresDus(driverId: string, bornes?: { debut?: Date; fin?: Date }) {
    return db.driverTip.findMany({
      where: {
        driverId,
        status: "PAID",
        payoutId: null,
        ...(bornes?.debut || bornes?.fin
          ? {
              paidAt: {
                ...(bornes.debut ? { gte: bornes.debut } : {}),
                ...(bornes.fin ? { lt: bornes.fin } : {}),
              },
            }
          : {}),
      },
      select: { id: true, orderId: true, amount: true, paidAt: true },
      orderBy: { paidAt: "asc" },
    });
  }

  /** Le relevé d'un livreur : ce qui est dû, et l'historique de ses versements. */
  static async situation(driverId: string) {
    const [dues, pourboires, releves] = await Promise.all([
      this.coursesDues(driverId),
      this.pourboiresDus(driverId),
      db.driverPayout.findMany({
        where: { driverId, status: { not: "CANCELLED" } },
        orderBy: { periodStart: "desc" },
        include: { _count: { select: { deliveries: true } } },
      }),
    ]);

    const verses = releves
      .filter((releve) => releve.status === "PAID")
      .reduce((somme, releve) => somme + Number(releve.amount), 0);

    const arretes = releves
      .filter((releve) => releve.status === "PENDING")
      .reduce((somme, releve) => somme + Number(releve.amount), 0);

    return {
      // Trois montants, et non un seul « total gagné » qui ne disait pas s'il
      // était payé : ce qui n'est pas encore arrêté, ce qui l'est et attend le
      // virement, ce qui est arrivé.
      duNonArrete:
        dues.reduce((somme, course) => somme + gainDeLaCourse(course), 0) + totalDesPourboires(pourboires),
      enAttenteDeVersement: arretes,
      verse: verses,
      coursesDues: dues.length,
      courses: dues.map((course) => ({
        id: course.id,
        orderId: course.orderId,
        deliveredAt: course.deliveryTime || course.updatedAt,
        montant: gainDeLaCourse(course),
      })),
      // Les pourboires laissés après la livraison, dus avec le prochain relevé.
      pourboires: pourboires.map((pourboire) => ({
        id: pourboire.id,
        orderId: pourboire.orderId,
        paidAt: pourboire.paidAt,
        montant: Number(pourboire.amount),
      })),
      releves: releves.map((releve) => ({
        id: releve.id,
        periodStart: releve.periodStart,
        periodEnd: releve.periodEnd,
        deliveryCount: releve.deliveryCount,
        amount: Number(releve.amount),
        status: releve.status,
        method: releve.method,
        methodLibelle: libelleDuMoyen(releve.method),
        reference: releve.reference,
        paidAt: releve.paidAt,
        note: releve.note,
      })),
    };
  }

  /** Le détail d'un relevé : ses bornes, son montant, et les courses payées. */
  static async detail(payoutId: string) {
    const releve = await db.driverPayout.findUnique({
      where: { id: payoutId },
      include: {
        driver: { select: { id: true, name: true, email: true, phone: true } },
        deliveries: {
          include: { order: { select: { id: true, totalAmount: true, feesAmount: true } } },
          orderBy: { deliveryTime: "asc" },
        },
        tips: { select: { id: true, orderId: true, amount: true, paidAt: true }, orderBy: { paidAt: "asc" } },
      },
    });

    if (!releve) {
      throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");
    }

    return {
      ...releve,
      amount: Number(releve.amount),
      methodLibelle: libelleDuMoyen(releve.method),
      deliveries: releve.deliveries.map((course) => ({
        id: course.id,
        orderId: course.orderId,
        deliveredAt: course.deliveryTime || course.updatedAt,
        distanceKm: course.distanceKm,
        montant: gainDeLaCourse(course),
      })),
      pourboires: releve.tips.map((pourboire) => ({
        id: pourboire.id,
        orderId: pourboire.orderId,
        paidAt: pourboire.paidAt,
        montant: Number(pourboire.amount),
      })),
    };
  }

  /**
   * Arrête un relevé pour un livreur sur une période.
   *
   * Le montant est la somme des courses prises, calculée ici et figée : un
   * relevé dit ce qui a été arrêté ce jour-là.
   */
  static async arreter(driverId: string, periodStart: Date, periodEnd: Date) {
    if (periodEnd <= periodStart) {
      throw new ApiError(400, "La fin de période précède son début", "INVALID_PERIOD");
    }

    const livreur = await db.driver.findUnique({ where: { id: driverId } });

    if (!livreur) {
      throw new ApiError(404, "Livreur introuvable", "DRIVER_NOT_FOUND");
    }

    const [courses, pourboires] = await Promise.all([
      this.coursesDues(driverId, { debut: periodStart, fin: periodEnd }),
      this.pourboiresDus(driverId, { debut: periodStart, fin: periodEnd }),
    ]);

    if (courses.length === 0 && pourboires.length === 0) {
      throw new ApiError(
        400,
        "Aucune course à payer sur cette période : rien à arrêter",
        "NOTHING_TO_PAY"
      );
    }

    const montant = Number(
      (courses.reduce((somme, course) => somme + gainDeLaCourse(course), 0) + totalDesPourboires(pourboires)).toFixed(2)
    );

    // La création du relevé et le rattachement des courses vont ensemble : un
    // relevé sans ses courses laisserait celles-ci payables une seconde fois.
    const releve = await db.$transaction(async (tx) => {
      const cree = await tx.driverPayout.create({
        data: {
          driverId,
          periodStart,
          periodEnd,
          deliveryCount: courses.length,
          amount: montant,
          status: "PENDING",
        },
      });

      await tx.orderDelivery.updateMany({
        where: { id: { in: courses.map((course) => course.id) } },
        data: { payoutId: cree.id },
      });
      // Les pourboires aussi : sans ce lien, ils seraient versés deux fois.
      await tx.driverTip.updateMany({
        where: { id: { in: pourboires.map((pourboire) => pourboire.id) } },
        data: { payoutId: cree.id },
      });

      return cree;
    });

    logger.info("Driver payout drawn up", { driverId, payoutId: releve.id, montant });

    await this.prevenir(
      driverId,
      "Votre relevé est arrêté",
      `${courses.length} course${courses.length > 1 ? "s" : ""}${
        pourboires.length ? ` et ${pourboires.length} pourboire${pourboires.length > 1 ? "s" : ""}` : ""
      } pour ${montant.toFixed(2)} €. Le versement suit.`
    );

    return releve;
  }

  /**
   * Arrête un relevé pour tous les livreurs qui ont des courses dues sur la
   * période. Ceux qui n'en ont pas sont simplement ignorés.
   */
  static async arreterTous(periodStart: Date, periodEnd: Date) {
    if (periodEnd <= periodStart) {
      throw new ApiError(400, "La fin de période précède son début", "INVALID_PERIOD");
    }

    const aPayer = await db.orderDelivery.groupBy({
      by: ["driverId"],
      where: {
        status: "DELIVERED",
        payoutId: null,
        driverId: { not: null },
        deliveryTime: { gte: periodStart, lt: periodEnd },
      },
    });

    // Un livreur sans course sur la période peut avoir reçu un pourboire.
    const pourboires = await db.driverTip.groupBy({
      by: ["driverId"],
      where: { status: "PAID", payoutId: null, paidAt: { gte: periodStart, lt: periodEnd } },
    });

    const livreurs = new Set<string>([
      ...aPayer.map((ligne) => ligne.driverId).filter((id): id is string => Boolean(id)),
      ...pourboires.map((ligne) => ligne.driverId),
    ]);

    const releves = [];

    for (const driverId of livreurs) {
      releves.push(await this.arreter(driverId, periodStart, periodEnd));
    }

    return releves;
  }

  /** Marque un relevé versé. */
  static async payer(
    payoutId: string,
    versement: { method: string; reference?: string; note?: string },
    adminId: string
  ) {
    const releve = await db.driverPayout.findUnique({ where: { id: payoutId } });

    if (!releve) {
      throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");
    }

    if (releve.status === "PAID") {
      throw new ApiError(400, "Ce relevé est déjà versé", "ALREADY_PAID");
    }

    if (releve.status === "CANCELLED") {
      throw new ApiError(400, "Ce relevé a été annulé", "PAYOUT_CANCELLED");
    }

    if (!MOYENS_VERSEMENT.includes(versement.method as (typeof MOYENS_VERSEMENT)[number])) {
      throw new ApiError(
        400,
        `Moyen de versement inconnu (attendu : ${MOYENS_VERSEMENT.join(", ")})`,
        "INVALID_METHOD"
      );
    }

    const paye = await db.driverPayout.update({
      where: { id: payoutId },
      data: {
        status: "PAID",
        method: versement.method,
        reference: versement.reference?.trim() || null,
        note: versement.note?.trim() || null,
        paidAt: new Date(),
        paidBy: adminId,
      },
    });

    logger.info("Driver payout paid", { payoutId, adminId });

    await this.prevenir(
      releve.driverId,
      "Versement effectué",
      `${Number(releve.amount).toFixed(2)} € par ${libelleDuMoyen(versement.method).toLowerCase()}${
        versement.reference ? ` (${versement.reference})` : ""
      }.`
    );

    return paye;
  }

  /**
   * Annule un relevé non versé : ses courses redeviennent dues et repartiront
   * au prochain arrêté.
   */
  static async annuler(payoutId: string, raison: string) {
    const releve = await db.driverPayout.findUnique({ where: { id: payoutId } });

    if (!releve) {
      throw new ApiError(404, "Relevé introuvable", "PAYOUT_NOT_FOUND");
    }

    // Annuler un versement déjà parti ne le ferait pas revenir : la course
    // redeviendrait due alors qu'elle a été payée.
    if (releve.status === "PAID") {
      throw new ApiError(
        400,
        "Un relevé déjà versé ne s'annule pas : l'argent est parti",
        "ALREADY_PAID"
      );
    }

    if (!raison.trim()) {
      throw new ApiError(400, "Dites pourquoi ce relevé est annulé", "MISSING_REASON");
    }

    return db.$transaction(async (tx) => {
      await tx.orderDelivery.updateMany({
        where: { payoutId },
        data: { payoutId: null },
      });
      await tx.driverTip.updateMany({
        where: { payoutId },
        data: { payoutId: null },
      });

      return tx.driverPayout.update({
        where: { id: payoutId },
        data: { status: "CANCELLED", note: raison.trim() },
      });
    });
  }

  /** Les relevés vus de la plateforme, avec le livreur concerné. */
  static async lister(filtres: { status?: string; driverId?: string }) {
    const releves = await db.driverPayout.findMany({
      where: {
        ...(filtres.status && filtres.status !== "ALL" ? { status: filtres.status } : {}),
        ...(filtres.driverId ? { driverId: filtres.driverId } : {}),
      },
      include: { driver: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { periodStart: "desc" }],
      take: 200,
    });

    const parEtat = await db.driverPayout.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { amount: true },
    });

    const comptes: Record<string, number> = { ALL: 0 };
    const montants: Record<string, number> = {};

    for (const ligne of parEtat) {
      comptes[ligne.status] = ligne._count._all;
      comptes.ALL += ligne._count._all;
      montants[ligne.status] = Number(ligne._sum.amount || 0);
    }

    return {
      payouts: releves.map((releve) => ({
        id: releve.id,
        driverId: releve.driverId,
        driverName: releve.driver.name,
        driverEmail: releve.driver.email,
        periodStart: releve.periodStart,
        periodEnd: releve.periodEnd,
        deliveryCount: releve.deliveryCount,
        amount: Number(releve.amount),
        status: releve.status,
        method: releve.method,
        methodLibelle: libelleDuMoyen(releve.method),
        reference: releve.reference,
        paidAt: releve.paidAt,
        note: releve.note,
      })),
      counts: comptes,
      totals: montants,
    };
  }

  /**
   * Ce qui reste dû, tous livreurs confondus.
   *
   * C'est le chiffre que la plateforme n'avait nulle part : combien elle doit,
   * et à combien de livreurs.
   */
  static async resteADevoir() {
    const [dues, pourboires] = await Promise.all([
      db.orderDelivery.findMany({
        where: { status: "DELIVERED", payoutId: null, driverId: { not: null } },
        select: { driverId: true, driverPayout: true, order: { select: { feesAmount: true } } },
      }),
      db.driverTip.findMany({
        where: { status: "PAID", payoutId: null },
        select: { driverId: true, amount: true },
      }),
    ]);

    return {
      montant: dues.reduce((somme, course) => somme + gainDeLaCourse(course), 0) + totalDesPourboires(pourboires),
      courses: dues.length,
      pourboires: pourboires.length,
      livreurs: new Set([...dues.map((course) => course.driverId), ...pourboires.map((p) => p.driverId)]).size,
    };
  }

  /** Prévient le livreur. Un versement muet ne se remarque pas. */
  private static async prevenir(driverId: string, titre: string, corps: string) {
    const livreur = await db.driver.findUnique({
      where: { id: driverId },
      select: { email: true },
    });

    if (!livreur) return;

    const notification = await db.notification.create({
      data: {
        type: "PLATFORM_ANNOUNCEMENT",
        title: titre,
        message: corps,
        recipientEmail: livreur.email,
        link: "/driver/earnings",
      },
    });

    emitNotification(livreur.email, notification);
  }
}
