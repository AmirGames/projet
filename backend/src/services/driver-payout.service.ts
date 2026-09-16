import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../config/logger";
import { emitNotification } from "../config/socket";

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

  /** Le relevé d'un livreur : ce qui est dû, et l'historique de ses versements. */
  static async situation(driverId: string) {
    const [dues, releves] = await Promise.all([
      this.coursesDues(driverId),
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
      duNonArrete: dues.reduce((somme, course) => somme + gainDeLaCourse(course), 0),
      enAttenteDeVersement: arretes,
      verse: verses,
      coursesDues: dues.length,
      courses: dues.map((course) => ({
        id: course.id,
        orderId: course.orderId,
        deliveredAt: course.deliveryTime || course.updatedAt,
        montant: gainDeLaCourse(course),
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

    const courses = await this.coursesDues(driverId, { debut: periodStart, fin: periodEnd });

    if (courses.length === 0) {
      throw new ApiError(
        400,
        "Aucune course à payer sur cette période : rien à arrêter",
        "NOTHING_TO_PAY"
      );
    }

    const montant = courses.reduce((somme, course) => somme + gainDeLaCourse(course), 0);

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

      return cree;
    });

    logger.info("Driver payout drawn up", { driverId, payoutId: releve.id, montant });

    await this.prevenir(
      driverId,
      "Votre relevé est arrêté",
      `${courses.length} course${courses.length > 1 ? "s" : ""} pour ${montant.toFixed(2)} €. Le versement suit.`
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

    const releves = [];

    for (const ligne of aPayer) {
      if (!ligne.driverId) continue;

      releves.push(await this.arreter(ligne.driverId, periodStart, periodEnd));
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
    const dues = await db.orderDelivery.findMany({
      where: { status: "DELIVERED", payoutId: null, driverId: { not: null } },
      select: { driverId: true, driverPayout: true, order: { select: { feesAmount: true } } },
    });

    return {
      montant: dues.reduce((somme, course) => somme + gainDeLaCourse(course), 0),
      courses: dues.length,
      livreurs: new Set(dues.map((course) => course.driverId)).size,
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
