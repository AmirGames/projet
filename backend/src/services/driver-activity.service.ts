import { db } from "./db";

/**
 * L'activité d'un livreur : l'historique de ses courses et les chiffres qui
 * en découlent.
 *
 * Une course qu'il a annulée perd son livreur (driverId repasse à null pour
 * qu'un autre la prenne) : elle ne se retrouve que par la proposition qu'il
 * avait acceptée. L'historique part donc des deux côtés, sans quoi les
 * annulations disparaissaient.
 */

export type FiltreHistorique = "ALL" | "ACTIVE" | "DELIVERED" | "CANCELLED";

export interface OptionsHistorique {
  filtre?: FiltreHistorique;
  depuis?: Date;
  jusqua?: Date;
  page?: number;
  parPage?: number;
}

const STATUTS_EN_COURS = ["ACCEPTED", "PICKED_UP"];

/** Les courses que ce livreur a prises, qu'il les ait menées au bout ou non. */
function coursesDuLivreur(driverId: string) {
  return {
    OR: [
      { driverId },
      { offers: { some: { driverId, status: "ACCEPTED" } } },
    ],
  };
}

/** Minutes entre deux instants, ou null s'il en manque un. */
function minutesEntre(debut?: Date | null, fin?: Date | null) {
  if (!debut || !fin) return null;
  return Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
}

export class DriverActivityService {
  static async historique(driverId: string, options: OptionsHistorique = {}) {
    const parPage = Math.min(Math.max(options.parPage ?? 20, 1), 100);
    const page = Math.max(options.page ?? 1, 1);

    const filtreStatut = (() => {
      switch (options.filtre) {
        case "ACTIVE":
          return { driverId, status: { in: STATUTS_EN_COURS } };
        case "DELIVERED":
          return { driverId, status: "DELIVERED" };
        case "CANCELLED":
          // Échouée entre ses mains, ou lâchée : plus de livreur, ou reprise
          // par un autre.
          return {
            OR: [
              { status: "FAILED" },
              { driverId: null },
              { driverId: { not: driverId } },
            ],
          };
        default:
          return {};
      }
    })();

    const periode =
      options.depuis || options.jusqua
        ? {
            createdAt: {
              ...(options.depuis ? { gte: options.depuis } : {}),
              ...(options.jusqua ? { lt: options.jusqua } : {}),
            },
          }
        : {};

    const where = { AND: [coursesDuLivreur(driverId), filtreStatut, periode] };

    const [courses, total, livrees] = await Promise.all([
      db.orderDelivery.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              deliveryAddress: true,
              deliveryCity: true,
              deliveryPostal: true,
              totalAmount: true,
              store: { select: { name: true, address: true, city: true } },
            },
          },
          rating: { select: { note: true, commentaire: true } },
          offers: {
            where: { driverId, status: "ACCEPTED" },
            select: { payout: true, distanceKm: true, respondedAt: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * parPage,
        take: parPage,
      }),
      db.orderDelivery.count({ where }),
      // Le cumul porte sur toute la période filtrée, pas seulement la page.
      db.orderDelivery.aggregate({
        where: { AND: [{ driverId, status: "DELIVERED" }, periode] },
        _sum: { driverPayout: true, distanceKm: true },
        _count: true,
      }),
    ]);

    const data = courses.map((c) => {
      const offre = c.offers[0];
      const aMoi = c.driverId === driverId;
      // Une course qu'il a lâchée a pu être reprise par un autre : pour lui,
      // elle est annulée, quel que soit son statut actuel.
      const statut = !aMoi ? "CANCELLED" : c.status === "FAILED" ? "CANCELLED" : c.status;

      return {
        id: c.id,
        orderId: c.orderId,
        status: statut,
        cancelledBy: statut === "CANCELLED" ? c.cancelledBy ?? null : null,
        cancellationReason: statut === "CANCELLED" ? c.cancellationReason ?? null : null,
        store: c.order?.store?.name ?? "",
        pickupAddress: [c.order?.store?.address, c.order?.store?.city].filter(Boolean).join(", "),
        // La ville suffit dans un historique : l'adresse exacte d'un client
        // n'a plus à rester sous les yeux une fois la course finie.
        deliveryCity: [c.order?.deliveryPostal, c.order?.deliveryCity].filter(Boolean).join(" "),
        distanceKm: c.distanceKm ?? offre?.distanceKm ?? null,
        payout: aMoi && c.status === "DELIVERED" ? Number(c.driverPayout ?? offre?.payout ?? 0) : 0,
        acceptedAt: c.assignedAt ?? offre?.respondedAt ?? null,
        pickedUpAt: c.pickupTime,
        deliveredAt: c.deliveryTime,
        durationMin: minutesEntre(c.assignedAt, c.deliveryTime),
        proofType: c.proofType,
        rating: c.rating ? { note: c.rating.note, commentaire: c.rating.commentaire } : null,
        createdAt: c.createdAt,
      };
    });

    return {
      data,
      pagination: { page, parPage, total, pages: Math.max(1, Math.ceil(total / parPage)) },
      resume: {
        livrees: livrees._count,
        gains: Number(livrees._sum.driverPayout ?? 0),
        distanceKm: Number(livrees._sum.distanceKm ?? 0),
      },
    };
  }

  /**
   * Tableau de bord chiffré d'un livreur sur une période glissante.
   *
   * Les jours et les heures sont comptés à l'heure de Paris : un livreur qui
   * travaille le soir ne doit pas voir sa soirée coupée en deux à minuit UTC.
   */
  static async analytics(driverId: string, jours: number, fuseau = "Europe/Paris") {
    const maintenant = new Date();
    const depuis = new Date(maintenant.getTime() - jours * 86400000);
    const avant = new Date(depuis.getTime() - jours * 86400000);

    const [livrees, precedentes, offres, notes, livreur] = await Promise.all([
      db.orderDelivery.findMany({
        where: { driverId, status: "DELIVERED", deliveryTime: { gte: depuis } },
        select: {
          deliveryTime: true,
          assignedAt: true,
          pickupTime: true,
          distanceKm: true,
          driverPayout: true,
          order: { select: { feesAmount: true } },
        },
      }),
      db.orderDelivery.aggregate({
        where: { driverId, status: "DELIVERED", deliveryTime: { gte: avant, lt: depuis } },
        _count: true,
        _sum: { driverPayout: true },
      }),
      db.deliveryOffer.findMany({
        where: { driverId, offeredAt: { gte: depuis } },
        select: {
          status: true,
          delivery: { select: { driverId: true, status: true } },
        },
      }),
      db.driverRating.aggregate({
        where: { driverId, createdAt: { gte: depuis } },
        _avg: { note: true },
        _count: true,
      }),
      db.driver.findUnique({ where: { id: driverId }, select: { rating: true, totalRatings: true } }),
    ]);

    const gain = (c: (typeof livrees)[number]) => Number(c.driverPayout ?? c.order?.feesAmount ?? 0);

    // Clés de jour et d'heure dans le fuseau du livreur.
    const jourDe = new Intl.DateTimeFormat("fr-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit" });
    const heureDe = new Intl.DateTimeFormat("fr-FR", { timeZone: fuseau, hour: "2-digit", hourCycle: "h23" });

    const parJour = new Map<string, { date: string; livrees: number; gains: number; distanceKm: number }>();
    for (let i = jours - 1; i >= 0; i--) {
      const cle = jourDe.format(new Date(maintenant.getTime() - i * 86400000));
      parJour.set(cle, { date: cle, livrees: 0, gains: 0, distanceKm: 0 });
    }

    const parHeure = Array.from({ length: 24 }, (_, heure) => ({ heure, livrees: 0, gains: 0 }));

    let gains = 0;
    let distance = 0;
    const durees: number[] = [];
    const retraits: number[] = [];

    for (const c of livrees) {
      const montant = gain(c);
      gains += montant;
      distance += c.distanceKm ?? 0;

      if (c.deliveryTime) {
        const jour = parJour.get(jourDe.format(c.deliveryTime));
        if (jour) {
          jour.livrees += 1;
          jour.gains += montant;
          jour.distanceKm += c.distanceKm ?? 0;
        }
        // formatToParts : le format français donne « 20 h », pas « 20 ».
        const valeurHeure = heureDe.formatToParts(c.deliveryTime).find((p) => p.type === "hour")?.value;
        const heure = parHeure[Number(valeurHeure) % 24];
        heure.livrees += 1;
        heure.gains += montant;
      }

      const duree = minutesEntre(c.assignedAt, c.deliveryTime);
      if (duree != null) durees.push(duree);
      const retrait = minutesEntre(c.assignedAt, c.pickupTime);
      if (retrait != null) retraits.push(retrait);
    }

    const moyenne = (valeurs: number[]) =>
      valeurs.length ? Math.round(valeurs.reduce((a, b) => a + b, 0) / valeurs.length) : null;

    // Les propositions sans réponse de sa part (annulées par le système) ne
    // comptent pas dans le taux : le livreur n'y est pour rien.
    const compte = { ACCEPTED: 0, DECLINED: 0, EXPIRED: 0 };
    let annuleesParLui = 0;
    for (const o of offres) {
      if (o.status in compte) compte[o.status as keyof typeof compte] += 1;
      if (o.status === "ACCEPTED" && (o.delivery.driverId !== driverId || o.delivery.status === "FAILED")) {
        annuleesParLui += 1;
      }
    }
    const repondues = compte.ACCEPTED + compte.DECLINED + compte.EXPIRED;

    const minutesEnCourse = durees.reduce((a, b) => a + b, 0);
    const arrondi = (n: number) => Math.round(n * 100) / 100;

    return {
      periode: { jours, depuis, jusqua: maintenant, fuseau },
      resume: {
        livrees: livrees.length,
        gains: arrondi(gains),
        gainMoyen: livrees.length ? arrondi(gains / livrees.length) : null,
        distanceKm: arrondi(distance),
        dureeMoyenneMin: moyenne(durees),
        retraitMoyenMin: moyenne(retraits),
        // Gains rapportés au temps passé en course, pas au temps connecté.
        gainsParHeure: minutesEnCourse > 0 ? arrondi(gains / (minutesEnCourse / 60)) : null,
        annulees: annuleesParLui,
      },
      precedente: {
        livrees: precedentes._count,
        gains: arrondi(Number(precedentes._sum.driverPayout ?? 0)),
      },
      offres: {
        recues: repondues,
        acceptees: compte.ACCEPTED,
        refusees: compte.DECLINED,
        expirees: compte.EXPIRED,
        tauxAcceptation: repondues ? Math.round((compte.ACCEPTED / repondues) * 100) : null,
      },
      notes: {
        moyennePeriode: notes._avg.note != null ? arrondi(notes._avg.note) : null,
        avisPeriode: notes._count,
        moyenneGlobale: livreur && livreur.totalRatings > 0 ? Number(livreur.rating) : null,
        avisTotal: livreur?.totalRatings ?? 0,
      },
      parJour: [...parJour.values()].map((j) => ({ ...j, gains: arrondi(j.gains), distanceKm: arrondi(j.distanceKm) })),
      parHeure: parHeure.map((h) => ({ ...h, gains: arrondi(h.gains) })),
    };
  }
}
