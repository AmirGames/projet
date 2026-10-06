import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint, Point } from "../../utils/geo";
import { emitDeliveryUpdate, emitDriverEvent } from "../realtime/socket";
import { positionLivreurVisible } from "../orders/suivi-commande.service";
import { genererCode, quitteLAdressePendantLAttente } from "./delivery-proof.service";
import { obfusquerAdresse } from "../../utils/address-obfuscation";
import { Notifier, enArrierePlan } from "../notifications/notifier.service";
import { randomUUID } from "crypto";
import {
  detourPourRejoindre,
  ordonner,
  REGLES_TOURNEE_PAR_DEFAUT,
  ReglesTournee,
  versCourseTournee,
} from "./tournee.service";
import { exceptionOuverte, limiteVehiculeKm, peutLivrer } from "./vehicule-distance.service";

/** Les statuts d'une course qu'un livreur a encore sur les bras. */
export const STATUTS_EN_COURSE = ["ACCEPTED", "PICKED_UP"];

/** Ce qu'il faut d'une course pour la proposer. */
const COURSE_A_PROPOSER = {
  offers: {
    select: { driverId: true, status: true, attempts: true, expiresAt: true, respondedAt: true },
  },
  order: {
    select: {
      deliveryAddress: true,
      deliveryCity: true,
      deliveryPostal: true,
      totalAmount: true,
      feesAmount: true,
      tipAmount: true,
      deliveryMode: true,
      status: true,
      store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
    },
  },
} as const;

/**
 * Attribution des courses aux livreurs.
 *
 * Une course part au livreur disponible le plus proche du point de retrait.
 * Il a un délai pour répondre ; passé ce délai elle va au suivant, et ainsi de
 * suite jusqu'à ce que quelqu'un accepte ou que la liste soit épuisée.
 *
 * Quand tout le monde a été sollicité, un nouveau tour commence : la course
 * revient au plus proche, mais jamais à quelqu'un qui vient de répondre
 * (délai de RELANCE_APRES_MS) ni plus de MAX_SOLLICITATIONS fois au même
 * livreur. Auparavant un livreur sollicité était écarté pour toujours : si
 * les dix livreurs du quartier laissaient passer la course, elle restait
 * bloquée, même relancée à la main.
 */

/** En deçà, le client est prévenu que le livreur arrive et peut descendre. */
export const RAYON_APPROCHE_KM = 0.3;

/** Délai avant de reproposer une course à un livreur qui a refusé ou laissé expirer. */
export const RELANCE_APRES_MS = 3 * 60000;
/** Au-delà, la course n'est plus proposée d'office à ce livreur. */
export const MAX_SOLLICITATIONS = 3;
/** Une recherche sans preneur est relancée automatiquement pendant cette durée. */
export const RECHERCHE_MAX_MS = 3 * 60 * 60000;

interface Sollicitation {
  driverId: string;
  status: string;
  attempts: number;
  expiresAt: Date;
  respondedAt: Date | null;
}

/** Quand ce livreur pourra de nouveau recevoir la course d'office, ou null s'il ne la recevra plus. */
function libreA(offre: Sollicitation, maintenant: number): number | null {
  if (offre.status === "PENDING" && offre.expiresAt.getTime() > maintenant) return null;
  if (offre.attempts >= MAX_SOLLICITATIONS) return null;
  const derniere = (offre.respondedAt ?? offre.expiresAt).getTime();
  return derniere + RELANCE_APRES_MS;
}

export interface Reglages {
  baseFee: number;
  perKmFee: number;
  offerSeconds: number;
  maxRadiusKm: number;
  /** Distance de livraison maximale selon le véhicule : voir vehicule-distance.service.ts. */
  bikeMaxKm: number;
  scooterMaxKm: number;
  /** Délai avant d'ouvrir une course sans preneur aux véhicules hors limite. */
  exceptionSeconds: number;
  /** Plusieurs courses à la fois : voir tournee.service.ts. */
  tournee: ReglesTournee;
}

const REGLAGES_PAR_DEFAUT: Reglages = {
  baseFee: 2.5,
  perKmFee: 0.8,
  offerSeconds: 30,
  maxRadiusKm: 8,
  bikeMaxKm: 4,
  scooterMaxKm: 7,
  exceptionSeconds: 180,
  tournee: REGLES_TOURNEE_PAR_DEFAUT,
};

/** Le trajet commerce → client d'une course, ou null si l'adresse n'est pas géolocalisée. */
function trajetDe(c: { pickupLat: number | null; pickupLng: number | null; deliveryLat: number | null; deliveryLng: number | null }) {
  const depart = { latitude: c.pickupLat, longitude: c.pickupLng };
  const arrivee = { latitude: c.deliveryLat, longitude: c.deliveryLng };
  return estUnPoint(depart) && estUnPoint(arrivee) ? distanceKm(depart, arrivee) : null;
}

export class DispatchService {
  /** Réglages de la plateforme, avec repli si la configuration n'existe pas. */
  static async reglages(): Promise<Reglages> {
    const config = await db.systemConfig.findFirst();

    if (!config) return REGLAGES_PAR_DEFAUT;

    return {
      baseFee: Number(config.driverBaseFee),
      perKmFee: Number(config.driverPerKmFee),
      offerSeconds: config.driverOfferSeconds,
      maxRadiusKm: config.driverMaxRadiusKm,
      bikeMaxKm: config.driverBikeMaxKm,
      scooterMaxKm: config.driverScooterMaxKm,
      exceptionSeconds: config.driverExceptionSeconds,
      tournee: {
        maxCourses: config.driverMaxCourses,
        rayonClientsKm: config.driverGroupClientKm,
        detourMaxKm: config.driverGroupDetourKm,
      },
    };
  }

  /**
   * Ce que touche le livreur pour une course, et ce qui reste à la plateforme.
   *
   * `distance` est le trajet de livraison, du commerce à l'adresse du client —
   * pas le chemin du livreur jusqu'au commerce : deux livreurs qui prennent la
   * même course sont payés pareil, qu'ils soient à 200 m ou à 5 km du retrait.
   *
   * Le calcul ne dépend pas des frais payés par le client : une course longue
   * doit être payée comme telle même si le commerçant offre la livraison.
   */
  static remuneration(distance: number, reglages: Reglages) {
    const brut = reglages.baseFee + distance * reglages.perKmFee;
    const payout = Number(brut.toFixed(2));

    return { payout, distance };
  }

  /**
   * Crée la course d'une commande, prête à être proposée.
   *
   * Idempotent : une commande n'a qu'une course, et redemander sa création
   * renvoie l'existante plutôt que d'échouer.
   */
  static async creerCourse(orderId: string) {
    const existante = await db.orderDelivery.findUnique({ where: { orderId } });
    if (existante) return existante;

    const commande = await db.order.findUnique({
      where: { id: orderId },
      include: { store: { select: { latitude: true, longitude: true } } },
    });

    if (!commande) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    if (commande.deliveryType !== "DELIVERY") {
      throw new ApiError(
        400,
        "Cette commande est à emporter : elle n'a pas de course",
        "NOT_A_DELIVERY"
      );
    }

    // Le commerçant a choisi de livrer lui-même : la commande n'a été ni
    // tarifée ni commissionnée pour un livreur de la plateforme.
    if (commande.deliveryMode === "OWN") {
      throw new ApiError(
        400,
        "Cette commande est livrée par vos propres livreurs : elle n'est pas proposée aux livreurs de la plateforme.",
        "OWN_DELIVERY"
      );
    }

    // Générer l'adresse obfusquée dès la création
    let deliveryLatObfusquee = null;
    let deliveryLngObfusquee = null;

    if (commande.deliveryLat && commande.deliveryLng) {
      const adresseObfusquee = obfusquerAdresse(
        commande.deliveryLat,
        commande.deliveryLng
      );
      deliveryLatObfusquee = adresseObfusquee.latitude;
      deliveryLngObfusquee = adresseObfusquee.longitude;
    }

    return db.orderDelivery.create({
      data: {
        orderId,
        status: "PENDING",
        // Les deux bouts du trajet sont figés à la création de la course : la
        // boutique d'où l'on retire, l'adresse où l'on dépose.
        pickupLat: commande.store?.latitude ?? null,
        pickupLng: commande.store?.longitude ?? null,
        deliveryLat: commande.deliveryLat ?? null,
        deliveryLng: commande.deliveryLng ?? null,
        // Adresse obfusquée
        deliveryLatObfusquee,
        deliveryLngObfusquee,
        // Le code de remise naît avec la course : le client le lit sur son
        // suivi, et le donne au livreur à la porte.
        deliveryCode: genererCode(),
      },
    });
  }

  /**
   * Livreurs éligibles pour une course, du plus proche au plus loin.
   *
   * Un livreur sans position connue est écarté : on ne peut pas juger s'il est
   * à portée, et lui envoyer la course revient à la retarder du délai
   * d'expiration.
   */
  static async livreursEligibles(retrait: Point, reglages: Reglages, exclus: string[] = []) {
    const candidats = await db.courier.findMany({
      where: {
        id: { notIn: exclus },
        status: "ACTIVE",
        isOnline: true,
        isAvailable: true,
        currentOrderId: null,
        // Filet de sécurité : une pause écarte le livreur même si un autre
        // chemin l'avait remis disponible.
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
        // Une position figée depuis des minutes ne dit plus où est le livreur.
        gpsLostAt: null,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        vehicleType: true,
        email: true,
        user: { select: { email: true } },
      },
    });

    return candidats
      .filter((livreur) => estUnPoint(livreur))
      .map((livreur) => ({
        ...livreur,
        distance: distanceKm(retrait, livreur as Point),
      }))
      .filter((livreur) => livreur.distance <= reglages.maxRadiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Où en est la tournée du livreur.
   *
   * Tant qu'une commande attend au commerce, aucun client n'est révélé ni
   * livrable. Ensuite, un seul à la fois : l'ordre des remises est figé
   * (ordreRemise) depuis la position du livreur au dernier retrait, pour
   * qu'il ne change pas en route, et seule la première se montre.
   */
  static async etatTournee(driverId: string) {
    const actives = await db.orderDelivery.findMany({
      where: { driverId, status: { in: STATUTS_EN_COURSE } },
      select: {
        id: true,
        status: true,
        ordreRemise: true,
        pickupLat: true,
        pickupLng: true,
        deliveryLat: true,
        deliveryLng: true,
      },
    });
    const retraitsRestants = actives.filter((c) => c.status === "ACCEPTED").length;
    let remiseCourante: string | null = null;

    if (actives.length > 0 && retraitsRestants === 0) {
      const sansOrdre = actives.filter((c) => c.ordreRemise == null);
      if (sansOrdre.length > 0) {
        const livreur = await db.courier.findUnique({ where: { id: driverId }, select: { latitude: true, longitude: true } });
        const depart = livreur && estUnPoint(livreur) ? (livreur as Point) : null;
        const { arrets } = ordonner(depart, sansOrdre.map(versCourseTournee));
        const base = Math.max(0, ...actives.map((c) => c.ordreRemise ?? 0));
        await db.$transaction(
          arrets.map((a, i) => db.orderDelivery.update({ where: { id: a.deliveryId }, data: { ordreRemise: base + i + 1 } }))
        );
        for (const [i, a] of arrets.entries()) {
          const c = actives.find((x) => x.id === a.deliveryId);
          if (c) c.ordreRemise = base + i + 1;
        }
      }
      remiseCourante = [...actives].sort((a, b) => (a.ordreRemise ?? 0) - (b.ordreRemise ?? 0))[0].id;
    }

    return { courses: actives.length, retraitsRestants, remiseCourante, ordre: actives };
  }

  /**
   * Le client de cette course est-il masqué au livreur ? RETRAITS : d'autres
   * commandes attendent au commerce ; ORDRE : une autre remise passe avant.
   * Une course seule n'est jamais masquée.
   */
  static masquage(
    etat: { courses: number; retraitsRestants: number; remiseCourante: string | null },
    deliveryId: string
  ): "RETRAITS" | "ORDRE" | null {
    if (etat.courses < 2) return null;
    if (etat.retraitsRestants > 0) return "RETRAITS";
    return deliveryId === etat.remiseCourante ? null : "ORDRE";
  }

  /** Refuse de révéler ou de clore une course masquée (voir masquage). */
  static async exigerTourAtteint(driverId: string, deliveryId: string) {
    const etat = await this.etatTournee(driverId);
    const raison = this.masquage(etat, deliveryId);
    if (raison === "RETRAITS") {
      throw new ApiError(
        409,
        etat.retraitsRestants > 1
          ? `Récupérez d'abord les ${etat.retraitsRestants} autres commandes de votre tournée.`
          : "Récupérez d'abord l'autre commande de votre tournée.",
        "TOURNEE_RETRAITS"
      );
    }
    if (raison === "ORDRE") {
      throw new ApiError(409, "Livrez d'abord la commande en cours de votre tournée.", "TOURNEE_ORDRE");
    }
  }

  /** Les courses que le livreur a encore à faire, dans l'ordre où il les a prises. */
  static coursesActives(driverId: string) {
    return db.orderDelivery.findMany({
      where: { driverId, status: { in: STATUTS_EN_COURSE } },
      orderBy: { assignedAt: "asc" },
    });
  }

  /**
   * Une course du livreur se termine (livrée, abandonnée, annulée) : il
   * redevient libre s'il n'en a plus d'autre. Avec une tournée, il garde les
   * suivantes, et currentOrderId pointe sur l'une d'elles.
   */
  static async liberer(driverId: string) {
    const restantes = await this.coursesActives(driverId);
    await db.courier.update({
      where: { id: driverId },
      data: { currentOrderId: restantes[0]?.id ?? null, isAvailable: restantes.length === 0 },
    });
    return restantes.length;
  }

  /**
   * Livreurs déjà en course sur le trajet de celle-ci, du plus petit détour
   * au plus grand (voir tournee.service.ts). Un livreur qui a déjà une
   * proposition en attente n'en reçoit pas une deuxième.
   */
  static async livreursEnTournee(course: {
    id: string;
    status: string;
    pickupLat: number | null;
    pickupLng: number | null;
    deliveryLat: number | null;
    deliveryLng: number | null;
  }, regles: ReglesTournee) {
    // Une course par livreur : pas de tournée.
    if (regles.maxCourses <= 1) return [];
    const nouvelle = versCourseTournee({ ...course, status: "ACCEPTED" });
    if (!estUnPoint(nouvelle.retrait) || !estUnPoint(nouvelle.remise)) return [];

    const livreurs = await db.courier.findMany({
      where: {
        status: "ACTIVE",
        isOnline: true,
        currentOrderId: { not: null },
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: new Date() } }],
        gpsLostAt: null,
        offers: { none: { status: "PENDING", expiresAt: { gt: new Date() } } },
        // Un livreur en retard ou hors trajet (voir surveillance-courses.service.ts)
        // ne reçoit pas de course en plus.
        deliveryIncidents: { none: { closedAt: null } },
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        vehicleType: true,
        email: true,
        user: { select: { email: true } },
        deliveries: {
          where: { status: { in: STATUTS_EN_COURSE } },
          select: { id: true, status: true, pickupLat: true, pickupLng: true, deliveryLat: true, deliveryLng: true },
        },
      },
    });

    return livreurs
      .map((livreur) => {
        const depart = estUnPoint(livreur) ? (livreur as Point) : null;
        const detour = detourPourRejoindre(depart, livreur.deliveries.map(versCourseTournee), nouvelle, regles);
        return {
          ...livreur,
          detour,
          distance: depart ? distanceKm(depart, nouvelle.retrait) : 0,
        };
      })
      .filter((l): l is typeof l & { detour: number } => l.detour != null)
      .sort((a, b) => a.detour - b.detour);
  }

  /**
   * Propose la course au prochain livreur.
   *
   * Dans l'ordre : le livreur désigné par le commerçant ; un livreur déjà en
   * course qui passe par là (« + 1 course sur votre trajet ») ; sinon le
   * livreur libre le plus proche, avec, s'il y en a, les autres commandes
   * qui attendent et vont au même endroit (un lot de trois au plus).
   *
   * Renvoie la proposition créée, ou null quand personne ne reste : au
   * commerçant de relancer plus tard, quand d'autres livreurs seront en ligne.
   */
  static async proposerAuSuivant(deliveryId: string, livreurPrefere?: string) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      include: COURSE_A_PROPOSER,
    });

    if (!course) {
      throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
    }

    if (course.driverId) return null;

    const retrait = { latitude: course.pickupLat, longitude: course.pickupLng };

    if (!estUnPoint(retrait)) {
      throw new ApiError(
        400,
        "La boutique n'a pas de coordonnées : impossible de chercher un livreur",
        "STORE_WITHOUT_LOCATION"
      );
    }

    // Une proposition encore ouverte bloque la suivante : deux livreurs ne
    // doivent pas pouvoir accepter la même course.
    const enCours = await db.deliveryOffer.findFirst({
      where: { deliveryId, status: "PENDING", expiresAt: { gt: new Date() } },
    });

    if (enCours) return enCours;

    const reglages = await this.reglages();
    const maintenant = Date.now();
    const disponibles = await this.livreursEligibles(retrait, reglages);

    // Le commerçant peut désigner un livreur : son choix passe outre le délai
    // de relance et la limite de sollicitations. Il l'a vu dans la liste des
    // disponibles, il sait ce qu'il fait — c'est exactement le cas où la
    // course avait expiré et ne pouvait plus lui être renvoyée.
    const prefere = livreurPrefere ? disponibles.find((c) => c.id === livreurPrefere) : undefined;

    const sollicitable = (c: { offers: Sollicitation[] }, driverId: string) => {
      const offre = c.offers.find((o) => o.driverId === driverId);
      if (!offre) return true;
      const libre = libreA(offre, maintenant);
      return libre != null && libre <= maintenant;
    };
    const candidats = disponibles.filter((c) => sollicitable(course, c.id));

    // Un livreur déjà en course passe par là : la course s'ajoute à sa
    // tournée plutôt que de mobiliser un livreur de plus.
    const toutesTournees = prefere ? [] : await this.livreursEnTournee(course, reglages.tournee);
    const enTournee = toutesTournees.filter((l) => sollicitable(course, l.id));

    // Le véhicule couvre-t-il le trajet commerce → client ? (vehicule-distance.service.ts)
    const trajet = trajetDe(course);
    const adapte = (l: { vehicleType: string }) => peutLivrer(l.vehicleType, trajet, reglages);

    // Les livreurs hors limite (un vélo pour 6 km) ne reçoivent la course
    // qu'à défaut : aucun livreur adapté dans le secteur, ou une recherche
    // qui dure. Ils acceptent ou refusent en connaissance de la distance.
    const ouverte = exceptionOuverte({
      aucunLivreurAdapte: !disponibles.some(adapte) && !toutesTournees.some(adapte),
      rechercheDepuis: course.createdAt,
      maintenant,
      limites: reglages,
    });

    if (prefere && !adapte(prefere) && !ouverte) {
      const limite = limiteVehiculeKm(prefere.vehicleType, reglages);
      throw new ApiError(
        409,
        `Ce livreur ne livre pas au-delà de ${limite.toFixed(1).replace(".", ",")} km avec son véhicule, et cette course fait ${(trajet ?? 0).toFixed(1).replace(".", ",")} km. Choisissez un livreur avec un véhicule plus adapté.`,
        "VEHICLE_TOO_LIMITED"
      );
    }

    // Les véhicules adaptés d'abord (en tournée, puis libres), les autres
    // seulement une fois l'exception ouverte.
    const choisi =
      prefere ||
      enTournee.find(adapte) ||
      candidats.find(adapte) ||
      (ouverte ? enTournee[0] || candidats[0] : undefined);

    if (!choisi) {
      logger.info("Aucun livreur disponible pour la course", {
        deliveryId,
        aPortee: disponibles.length,
      });
      return null;
    }

    const ajout = !prefere && (enTournee as unknown[]).includes(choisi);
    const expiresAt = new Date(maintenant + reglages.offerSeconds * 1000);

    // Un livreur libre : les autres commandes qui attendent et vont au même
    // endroit partent avec celle-ci, en un lot.
    // Les autres commandes du lot, elles, restent dans la limite du véhicule.
    const lot = ajout
      ? [course]
      : await this.composerLot(course, choisi.id, sollicitable, reglages.tournee, (c) =>
          peutLivrer(choisi.vehicleType, trajetDe(c), reglages)
        );
    const batchId = lot.length > 1 ? randomUUID() : null;

    const horsLimite = !adapte(choisi);

    const propositions = [];
    for (const c of lot) {
      propositions.push(
        await this.creerProposition(c, choisi, { maintenant, expiresAt, reglages, batchId, ajout })
      );
    }
    const proposition = propositions[0];
    const total = Number(propositions.reduce((t, p) => t + Number(p.payout ?? 0), 0).toFixed(2));
    const approche = Number(choisi.distance.toFixed(2));
    const trajets = propositions.reduce((t, p) => t + (p.distanceKm ?? 0), 0);
    const euros = (n: number) => n.toFixed(2).replace(".", ",");

    // L'onglet du livreur peut dormir en arrière-plan : la connexion temps
    // réel ne suffit pas à le réveiller, une notification du système si. Un
    // lot n'en fait qu'une : « Accepter » prend tout le lot.
    enArrierePlan(
      Notifier.pushLivreur(choisi.id, {
        title: ajout
          ? `+1 course sur votre trajet : ${euros(total)} €`
          : lot.length > 1
            ? `${lot.length} courses d'un coup : ${euros(total)} €`
            : `Nouvelle course : ${euros(total)} €`,
        body:
          (ajout
          ? `${course.order?.store?.name || "Commerce"}, livraison de ${trajets.toFixed(1).replace(".", ",")} km, à ajouter à votre course.`
          : lot.length > 1
            ? `${[...new Set(lot.map((c) => c.order?.store?.name).filter(Boolean))].join(", ") || "Commerce"} à ${approche.toFixed(1).replace(".", ",")} km, ${lot.length} clients au même endroit. Répondez vite !`
            : `${course.order?.store?.name || "Commerce"} à ${approche.toFixed(1).replace(".", ",")} km, livraison de ${trajets.toFixed(1).replace(".", ",")} km. Répondez vite !`) +
          // Au-delà de ce que son véhicule fait d'ordinaire : à lui de décider.
          (horsLimite ? " Plus longue que votre limite habituelle." : ""),
        url: "/driver",
        tag: "course-proposee",
        offerId: proposition.id,
      })
    );

    logger.info("Course proposée", {
      deliveryId,
      driverId: choisi.id,
      approche,
      trajet: trajets,
      ...(ajout ? { ajout: true } : {}),
      ...(horsLimite ? { horsLimite: true, vehicule: choisi.vehicleType } : {}),
      ...(batchId ? { lot: lot.map((c) => c.id) } : {}),
    });

    return proposition;
  }

  /**
   * Les commandes qui attendent un livreur et vont au même endroit que
   * celle-ci : même commerce ou commerce sur le trajet, clients proches (voir
   * tournee.service.ts). La course elle-même d'abord, trois en tout au plus.
   */
  private static async composerLot<
    C extends { id: string; status: string; pickupLat: number | null; pickupLng: number | null; deliveryLat: number | null; deliveryLng: number | null; offers: Sollicitation[] },
  >(
    course: C,
    driverId: string,
    sollicitable: (c: { offers: Sollicitation[] }, driverId: string) => boolean,
    regles: ReglesTournee,
    accepte: (c: C) => boolean = () => true
  ): Promise<C[]> {
    const lot: C[] = [course];
    if (regles.maxCourses <= 1) return lot;
    const retrait = { latitude: course.pickupLat, longitude: course.pickupLng };
    if (!estUnPoint(retrait)) return lot;

    const enAttente = (await db.orderDelivery.findMany({
      where: {
        id: { not: course.id },
        status: "PENDING",
        driverId: null,
        createdAt: { gt: new Date(Date.now() - RECHERCHE_MAX_MS) },
        order: { status: { in: ["ACCEPTED", "PREPARING", "READY"] } },
        offers: { none: { status: "PENDING", expiresAt: { gt: new Date() } } },
        pickupLat: { not: null },
        deliveryLat: { not: null },
      },
      include: COURSE_A_PROPOSER,
      orderBy: { createdAt: "asc" },
      take: 30,
    })) as unknown as C[];

    // À chaque tour, la commande qui rallonge le moins le lot.
    let restantes = enAttente.filter((c) => sollicitable(c, driverId) && accepte(c));
    while (lot.length < regles.maxCourses && restantes.length > 0) {
      const tournee = lot.map((c) => versCourseTournee({ ...c, status: "ACCEPTED" }));
      const classees = restantes
        .map((c) => ({
          c,
          detour: detourPourRejoindre(retrait as Point, tournee, versCourseTournee({ ...c, status: "ACCEPTED" }), regles),
        }))
        .filter((x): x is { c: C; detour: number } => x.detour != null)
        .sort((a, b) => a.detour - b.detour);
      if (classees.length === 0) break;
      lot.push(classees[0].c);
      restantes = restantes.filter((c) => c !== classees[0].c);
    }
    return lot;
  }

  /** Crée (ou rouvre) la proposition d'une course à un livreur, et la lui annonce. */
  private static async creerProposition(
    course: {
      id: string;
      pickupLat: number | null;
      pickupLng: number | null;
      deliveryLat: number | null;
      deliveryLng: number | null;
      deliveryLatObfusquee: number | null;
      deliveryLngObfusquee: number | null;
      order: {
        deliveryAddress: string | null;
        deliveryCity: string | null;
        deliveryPostal: string | null;
        feesAmount: unknown;
        tipAmount?: unknown;
        deliveryMode: string | null;
        store: { name: string; address: string | null; city: string | null; latitude: number | null; longitude: number | null } | null;
      } | null;
    },
    choisi: { id: string; distance: number; vehicleType: string; email: string; user: { email: string } | null },
    options: { maintenant: number; expiresAt: Date; reglages: Reglages; batchId: string | null; ajout: boolean }
  ) {
    const { maintenant, expiresAt, reglages, batchId, ajout } = options;
    const deliveryId = course.id;
    const retrait = { latitude: course.pickupLat, longitude: course.pickupLng } as Point;

    // Le paiement se calcule sur le trajet commerce → client. Sans
    // coordonnées de livraison (adresse non géolocalisée), on retombe sur la
    // distance d'approche plutôt que de ne payer que la base.
    const destination = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    const trajet = estUnPoint(destination) ? distanceKm(retrait, destination) : null;
    if (trajet == null) {
      logger.warn("Course sans coordonnées de livraison : paiement sur la distance d'approche", { deliveryId });
    }
    const distancePayee = Number((trajet ?? choisi.distance).toFixed(2));
    // Plus long que ce que son véhicule fait d'ordinaire : proposée faute de mieux.
    const horsLimite = !peutLivrer(choisi.vehicleType, trajet, reglages);
    // Chemin jusqu'au commerce de cette course, depuis la dernière position.
    const approche = Number(choisi.distance.toFixed(2));

    /**
     * Les frais payés par le client sont la paie du livreur.
     *
     * Ils ont été calculés à la commande sur la distance boutique → client,
     * avec le même barème ; la plateforme les encaisse et les reverse au
     * livreur sur son relevé. Pour une commande antérieure à ce fonctionnement,
     * on retombe sur le barème du jour.
     */
    /*
     * Le pourboire du client revient en entier au livreur : il s'ajoute à sa
     * rémunération dès la proposition, et la suit sur son relevé.
     */
    const payout = Number(
      (
        (course.order?.deliveryMode === "PLATFORM"
          ? Number(course.order.feesAmount)
          : this.remuneration(distancePayee, reglages).payout) + Number(course.order?.tipAmount || 0)
      ).toFixed(2)
    );

    // Une ligne par livreur et par course : un nouveau tour la rouvre.
    const proposition = await db.deliveryOffer.upsert({
      where: { deliveryId_driverId: { deliveryId, driverId: choisi.id } },
      create: {
        deliveryId,
        driverId: choisi.id,
        // La distance de la proposition est celle qui est payée : le trajet.
        distanceKm: distancePayee,
        payout,
        expiresAt,
        batchId,
        ajout,
        horsLimite,
      },
      update: {
        status: "PENDING",
        distanceKm: distancePayee,
        payout,
        offeredAt: new Date(maintenant),
        expiresAt,
        respondedAt: null,
        attempts: { increment: 1 },
        batchId,
        ajout,
        horsLimite,
      },
    });

    // Le salon temps réel est celui du compte connecté : l'e-mail du compte
    // peut différer de celui saisi sur la fiche livreur.
    emitDriverEvent(choisi.user?.email || choisi.email, "course-proposee", {
      offerId: proposition.id,
      deliveryId,
      // Trajet payé (commerce → client) et chemin jusqu'au commerce.
      distanceKm: distancePayee,
      approcheKm: approche,
      payout,
      expiresAt: proposition.expiresAt,
      // Lieu de prise en charge
      pickupStore: course.order?.store?.name,
      pickupAddress: course.order?.store?.address,
      pickupCity: course.order?.store?.city,
      pickupLat: course.order?.store?.latitude,
      pickupLng: course.order?.store?.longitude,
      // Lieu de livraison (ADRESSE LISIBLE MAIS COORDONNÉES OBFUSQUÉES)
      deliveryAddress: course.order?.deliveryAddress,
      deliveryCity: course.order?.deliveryCity,
      deliveryPostal: course.order?.deliveryPostal,
      // Coordonnées obfusquées que le livreur verra sur la map
      deliveryLat: course.deliveryLatObfusquee,
      deliveryLng: course.deliveryLngObfusquee,
      // Note pour clarifier
      obfuscationNote: "À ±50-100m pour votre confidentialité",
      // Plusieurs courses : proposées ensemble (lot), ou ajoutées à une
      // course déjà en route.
      batchId,
      ajout,
      // Plus longue que la limite habituelle de son véhicule : il peut refuser.
      horsLimite,
      limiteKm: horsLimite ? limiteVehiculeKm(choisi.vehicleType, reglages) : null,
    });

    return proposition;
  }

  /**
   * Où en est la recherche d'une course restée sans preneur : combien de
   * livreurs sont à portée, et quand l'un d'eux pourra la recevoir de nouveau.
   * Sert à dire au commerçant autre chose que « relancez plus tard ».
   */
  static async etatRecherche(deliveryId: string) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        pickupLat: true,
        pickupLng: true,
        offers: {
          select: { driverId: true, status: true, attempts: true, expiresAt: true, respondedAt: true },
        },
      },
    });
    const retrait = { latitude: course?.pickupLat, longitude: course?.pickupLng };
    if (!course || !estUnPoint(retrait)) return { aPortee: 0, prochaineTentative: null as Date | null };

    const disponibles = await this.livreursEligibles(retrait, await this.reglages());
    const maintenant = Date.now();
    const echeances = disponibles
      .map((d) => {
        const offre = course.offers.find((o) => o.driverId === d.id);
        return offre ? libreA(offre, maintenant) : maintenant;
      })
      .filter((t): t is number => t != null);

    return {
      aPortee: disponibles.length,
      prochaineTentative: echeances.length ? new Date(Math.max(maintenant, Math.min(...echeances))) : null,
    };
  }

  /**
   * Relance les courses qui cherchent encore un livreur.
   *
   * Sans elle, une course dont tous les livreurs avaient été sollicités
   * attendait que le commerçant pense à relancer. Elle repart désormais
   * d'elle-même dès qu'un livreur redevient sollicitable ou se connecte.
   */
  static async relancerRecherches() {
    const courses = await db.orderDelivery.findMany({
      where: {
        status: "PENDING",
        driverId: null,
        createdAt: { gt: new Date(Date.now() - RECHERCHE_MAX_MS) },
        order: { status: { in: ["ACCEPTED", "PREPARING", "READY"] } },
        offers: { none: { status: "PENDING", expiresAt: { gt: new Date() } } },
      },
      select: { id: true },
      take: 50,
    });

    let relancees = 0;
    for (const { id } of courses) {
      try {
        if (await this.proposerAuSuivant(id)) relancees += 1;
      } catch (err) {
        logger.warn("Relance de recherche impossible", {
          deliveryId: id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
    return relancees;
  }

  /**
   * Le livreur accepte : la course lui est attribuée, la rémunération figée.
   *
   * Une proposition d'un lot emporte tout le lot. Une course ajoutée rejoint
   * la tournée en cours. Jamais plus que le réglage de la plateforme à la fois.
   */
  static async accepter(offerId: string, driverId: string) {
    const proposition = await db.deliveryOffer.findUnique({
      where: { id: offerId },
      include: { delivery: true },
    });

    if (!proposition || proposition.driverId !== driverId) {
      throw new ApiError(404, "Proposition introuvable", "OFFER_NOT_FOUND");
    }

    if (proposition.status !== "PENDING") {
      throw new ApiError(409, "Cette proposition n'est plus ouverte", "OFFER_CLOSED");
    }

    if (proposition.expiresAt.getTime() < Date.now()) {
      await db.deliveryOffer.updateMany({
        where: proposition.batchId
          ? { batchId: proposition.batchId, driverId, status: "PENDING" }
          : { id: offerId },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      throw new ApiError(409, "Cette proposition a expiré", "OFFER_EXPIRED");
    }

    if (proposition.delivery.driverId) {
      throw new ApiError(409, "Cette course a déjà un livreur", "ALREADY_ASSIGNED");
    }

    // Le lot : la course acceptée d'abord, puis celles qui l'accompagnent et
    // n'ont pas trouvé preneur entre-temps.
    const compagnes = proposition.batchId
      ? await db.deliveryOffer.findMany({
          where: {
            batchId: proposition.batchId,
            driverId,
            status: "PENDING",
            id: { not: offerId },
            expiresAt: { gt: new Date() },
            delivery: { driverId: null },
          },
          include: { delivery: true },
          orderBy: { offeredAt: "asc" },
        })
      : [];

    const enCours = await db.orderDelivery.count({ where: { driverId, status: { in: STATUTS_EN_COURSE } } });
    const { maxCourses } = (await this.reglages()).tournee;
    const place = maxCourses - enCours;
    if (place <= 0) {
      throw new ApiError(
        409,
        enCours > 1
          ? `Vous avez déjà ${enCours} courses en cours : terminez-en une d'abord.`
          : "Vous avez déjà une course en cours : terminez-la d'abord.",
        "TOO_MANY_DELIVERIES"
      );
    }
    const acceptees = [proposition, ...compagnes].slice(0, place);
    const laissees = [proposition, ...compagnes].slice(place);

    const maintenant = new Date();

    // Tout d'un bloc : sans cela, une course pourrait être attribuée sans que
    // le livreur soit marqué occupé.
    await db.$transaction(async (tx) => {
      const livreur = await tx.courier.findUnique({ where: { id: driverId }, select: { currentOrderId: true, status: true } });
      if (!livreur || livreur.status !== "ACTIVE") {
        throw new ApiError(403, "Votre compte livreur n'est pas actif", "DRIVER_NOT_ACTIVE");
      }
      for (const offre of acceptees) {
        // Le contrôle initial ne suffit pas : une autre acceptation peut
        // s'intercaler. Le perdant ne doit jamais écraser l'attribution.
        const attribuee = await tx.orderDelivery.updateMany({
          where: { id: offre.deliveryId, driverId: null, status: "PENDING" },
          data: {
            driverId,
            status: "ACCEPTED",
            assignedAt: maintenant,
            distanceKm: offre.distanceKm,
            driverPayout: offre.payout,
          },
        });
        if (attribuee.count !== 1) throw new ApiError(409, "Cette course n'est plus disponible", "ALREADY_ASSIGNED");
        const ouverte = await tx.deliveryOffer.updateMany({
          where: { id: offre.id, driverId, status: "PENDING", expiresAt: { gt: new Date() } },
          data: { status: "ACCEPTED", respondedAt: maintenant },
        });
        if (ouverte.count !== 1) throw new ApiError(409, "Cette proposition n'est plus ouverte", "OFFER_CLOSED");
        // Les propositions encore ouvertes pour cette course n'ont plus lieu d'être.
        await tx.deliveryOffer.updateMany({
          where: { deliveryId: offre.deliveryId, status: "PENDING", id: { not: offre.id } },
          data: { status: "CANCELLED", respondedAt: maintenant },
        });
      }
      for (const offre of laissees) {
        await tx.deliveryOffer.updateMany({ where: { id: offre.id, driverId, status: "PENDING" }, data: { status: "CANCELLED", respondedAt: maintenant } });
      }
      await tx.courier.update({
        where: { id: driverId },
        data: { currentOrderId: livreur?.currentOrderId ?? proposition.deliveryId, isAvailable: false },
      });
    });

    for (const offre of acceptees) {
      emitDeliveryUpdate(offre.delivery.orderId, { status: "ACCEPTED" });
      enArrierePlan(Notifier.etapeLivraisonClient(offre.delivery.orderId, "ACCEPTED"));
      // Le commerçant est prévenu qu'un livreur arrive, écran ouvert ou non.
      enArrierePlan(Notifier.livreurTrouveBoutique(offre.delivery.orderId));
    }
    // Les courses du lot qui ne tenaient plus repartent chercher un livreur.
    for (const offre of laissees) {
      enArrierePlan(this.proposerAuSuivant(offre.deliveryId));
    }

    const course = await db.orderDelivery.findUniqueOrThrow({ where: { id: proposition.deliveryId } });
    return Object.assign(course, { lot: acceptees.map((o) => o.deliveryId) });
  }

  /**
   * Le livreur refuse : la course part aussitôt au suivant. Refuser une
   * course d'un lot refuse le lot entier ; chaque course repart de son côté
   * (et peut former un autre lot avec le livreur suivant).
   */
  static async refuser(offerId: string, driverId: string) {
    const proposition = await db.deliveryOffer.findUnique({ where: { id: offerId } });

    if (!proposition || proposition.driverId !== driverId) {
      throw new ApiError(404, "Proposition introuvable", "OFFER_NOT_FOUND");
    }

    if (proposition.status !== "PENDING") {
      throw new ApiError(409, "Cette proposition n'est plus ouverte", "OFFER_CLOSED");
    }

    const lot = proposition.batchId
      ? await db.deliveryOffer.findMany({
          where: { batchId: proposition.batchId, driverId, status: "PENDING" },
          select: { id: true, deliveryId: true },
        })
      : [{ id: offerId, deliveryId: proposition.deliveryId }];

    await db.deliveryOffer.updateMany({
      where: { id: { in: lot.map((o) => o.id) } },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    // Ne pas attendre le balayage : un refus est une réponse immédiate.
    let suivante = null;
    for (const offre of lot) {
      const nouvelle = await this.proposerAuSuivant(offre.deliveryId);
      if (offre.id === offerId) suivante = nouvelle;
    }
    return suivante;
  }

  /**
   * Ferme les propositions dépassées et relance les courses concernées.
   *
   * Appelé périodiquement : un livreur qui ne répond pas ne produit aucun
   * événement, il faut donc aller voir.
   */
  static async balayerPropositionsExpirees() {
    const expirees = await db.deliveryOffer.findMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      select: { id: true, deliveryId: true },
    });

    if (expirees.length === 0) return 0;

    await db.deliveryOffer.updateMany({
      where: { id: { in: expirees.map((o) => o.id) } },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });

    const courses = [...new Set(expirees.map((o) => o.deliveryId))];

    for (const deliveryId of courses) {
      try {
        await this.proposerAuSuivant(deliveryId);
      } catch (err) {
        // Une course sans coordonnées ne doit pas empêcher les autres de
        // repartir.
        logger.warn("Relance de course impossible", {
          deliveryId,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    return expirees.length;
  }

  /** Position du livreur, partagée avec la course en cours s'il en a une. */
  static async enregistrerPosition(driverId: string, position: Point) {
    const maintenant = new Date();

    const livreur = await db.courier.update({
      where: { id: driverId },
      data: {
        latitude: position.latitude,
        longitude: position.longitude,
        lastLocationUpdate: maintenant,
      },
      select: { currentOrderId: true, gpsLostAt: true, isOnline: true },
    });

    // Import tardif : le service de disponibilité dépend déjà de celui-ci.
    if (livreur.gpsLostAt) {
      const { DriverAvailabilityService } = await import("./driver-availability.service");
      await DriverAvailabilityService.signalRetabli(driverId, livreur.gpsLostAt, livreur.currentOrderId);
    }

    // enLigne : l'application qui envoie sa position téléphone rangé arrête
    // de la suivre quand le livreur est passé hors ligne ailleurs (site,
    // mise hors ligne automatique).
    if (!livreur.currentOrderId) return { suivie: false, enLigne: livreur.isOnline };

    // Toutes ses courses : chaque client d'une tournée suit la même pastille.
    const courses = await db.orderDelivery.findMany({
      where: { driverId, status: { in: STATUTS_EN_COURSE } },
      select: { id: true },
    });

    let premiere: string | null = null;
    for (const { id } of courses) {
      const course = await db.orderDelivery.update({
        where: { id },
        data: {
          driverLat: position.latitude,
          driverLng: position.longitude,
          driverLocationAt: maintenant,
        },
        select: {
          id: true,
          orderId: true,
          status: true,
          deliveryLat: true,
          deliveryLng: true,
          nearCustomerNotifiedAt: true,
          customerWaitStartedAt: true,
          customerWaitLeftAt: true,
        },
      });

      // Parti pendant l'attente du client : la marque reste, même s'il
      // revient — le dépôt en photo ne lui est plus ouvert (voir
      // exigerResteChezClient).
      if (!course.customerWaitLeftAt && quitteLAdressePendantLAttente(position, course)) {
        await db.orderDelivery.updateMany({
          where: { id: course.id, customerWaitLeftAt: null },
          data: { customerWaitLeftAt: maintenant },
        });
        logger.warn("Driver left the customer's address during the wait", { deliveryId: course.id, driverId });
      }

      // Même règle que GET /orders/:id/delivery : la position du livreur ne
      // part vers le salon de la commande qu'en route vers le client.
      emitDeliveryUpdate(course.orderId, {
        status: course.status,
        location: positionLivreurVisible(course.status)
          ? { latitude: position.latitude, longitude: position.longitude }
          : null,
      });

      await this.prevenirSiProche(course, position);
      premiere ??= course.orderId;
    }

    if (!premiere) return { suivie: false, enLigne: livreur.isOnline };
    return { suivie: true, enLigne: livreur.isOnline, orderId: premiere };
  }

  /**
   * Prévient le client que le livreur approche, pour qu'il descende.
   *
   * Une seule fois par course, dès la première position reçue à moins de
   * RAYON_APPROCHE_KM de l'adresse, et seulement une fois la commande
   * récupérée : un livreur qui passe devant chez le client en allant au
   * commerce ne doit pas le faire descendre pour rien.
   */
  static async prevenirSiProche(
    course: {
      id: string;
      orderId: string;
      status: string;
      deliveryLat: number | null;
      deliveryLng: number | null;
      nearCustomerNotifiedAt: Date | null;
    },
    position: Point
  ) {
    if (course.status !== "PICKED_UP" || course.nearCustomerNotifiedAt) return false;

    const destination = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    if (!estUnPoint(destination)) return false;
    if (distanceKm(position, destination) > RAYON_APPROCHE_KM) return false;

    // La marque se pose sous condition : deux positions reçues coup sur coup
    // ne doivent pas envoyer deux messages.
    const pose = await db.orderDelivery.updateMany({
      where: { id: course.id, nearCustomerNotifiedAt: null },
      data: { nearCustomerNotifiedAt: new Date() },
    });
    if (pose.count === 0) return false;

    emitDeliveryUpdate(course.orderId, { status: course.status, livreurProche: true });
    enArrierePlan(Notifier.livreurProcheClient(course.orderId));

    logger.info("Customer warned: driver is close", { orderId: course.orderId });
    return true;
  }
}
