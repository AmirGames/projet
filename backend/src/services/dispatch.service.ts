import { db } from "./db";
import { logger } from "../config/logger";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint, Point } from "../utils/geo";
import { emitDeliveryUpdate, emitDriverEvent } from "../config/socket";
import { genererCode } from "./delivery-proof.service";
import { obfusquerAdresse } from "../utils/address-obfuscation";
import { Notifier, enArrierePlan } from "./notifier.service";

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
}

const REGLAGES_PAR_DEFAUT: Reglages = {
  baseFee: 2.5,
  perKmFee: 0.8,
  offerSeconds: 30,
  maxRadiusKm: 8,
};

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
    const candidats = await db.driver.findMany({
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
   * Propose la course au prochain livreur.
   *
   * Renvoie la proposition créée, ou null quand personne ne reste : au
   * commerçant de relancer plus tard, quand d'autres livreurs seront en ligne.
   */
  static async proposerAuSuivant(deliveryId: string, livreurPrefere?: string) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      include: {
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
            deliveryMode: true,
            store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
          },
        },
      },
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

    const sollicitations = new Map(course.offers.map((o) => [o.driverId, o]));
    const candidats = disponibles.filter((c) => {
      const offre = sollicitations.get(c.id);
      if (!offre) return true;
      const libre = libreA(offre, maintenant);
      return libre != null && libre <= maintenant;
    });

    const choisi = prefere || candidats[0];

    if (!choisi) {
      logger.info("Aucun livreur disponible pour la course", {
        deliveryId,
        aPortee: disponibles.length,
      });
      return null;
    }

    // Le paiement se calcule sur le trajet commerce → client. Sans
    // coordonnées de livraison (adresse non géolocalisée), on retombe sur la
    // distance d'approche plutôt que de ne payer que la base.
    const destination = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    const trajet = estUnPoint(destination) ? distanceKm(retrait, destination) : null;
    if (trajet == null) {
      logger.warn("Course sans coordonnées de livraison : paiement sur la distance d'approche", { deliveryId });
    }
    const distancePayee = Number((trajet ?? choisi.distance).toFixed(2));
    const approche = Number(choisi.distance.toFixed(2));

    /**
     * Les frais payés par le client sont la paie du livreur.
     *
     * Ils ont été calculés à la commande sur la distance boutique → client,
     * avec le même barème ; la plateforme les encaisse et les reverse au
     * livreur sur son relevé. Pour une commande antérieure à ce fonctionnement,
     * on retombe sur le barème du jour.
     */
    const payout =
      course.order?.deliveryMode === "PLATFORM"
        ? Number(Number(course.order.feesAmount).toFixed(2))
        : this.remuneration(distancePayee, reglages).payout;
    const expiresAt = new Date(maintenant + reglages.offerSeconds * 1000);

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
      },
      update: {
        status: "PENDING",
        distanceKm: distancePayee,
        payout,
        offeredAt: new Date(maintenant),
        expiresAt,
        respondedAt: null,
        attempts: { increment: 1 },
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
    });

    // L'onglet du livreur peut dormir en arrière-plan : la connexion temps
    // réel ne suffit pas à le réveiller, une notification du système si.
    enArrierePlan(
      Notifier.pushLivreur(choisi.id, {
        title: `Nouvelle course : ${payout.toFixed(2).replace(".", ",")} €`,
        body: `${course.order?.store?.name || "Commerce"} à ${approche.toFixed(1).replace(".", ",")} km, livraison de ${distancePayee.toFixed(1).replace(".", ",")} km. Répondez vite !`,
        url: "/driver",
        tag: "course-proposee",
        offerId: proposition.id,
      })
    );

    logger.info("Course proposée", { deliveryId, driverId: choisi.id, approche, trajet: distancePayee });

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

  /** Le livreur accepte : la course lui est attribuée, la rémunération figée. */
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
      await db.deliveryOffer.update({
        where: { id: offerId },
        data: { status: "EXPIRED", respondedAt: new Date() },
      });

      throw new ApiError(409, "Cette proposition a expiré", "OFFER_EXPIRED");
    }

    if (proposition.delivery.driverId) {
      throw new ApiError(409, "Cette course a déjà un livreur", "ALREADY_ASSIGNED");
    }

    // Tout d'un bloc : sans cela, une course pourrait être attribuée sans que
    // le livreur soit marqué occupé, et il recevrait une deuxième course.
    const [, course] = await db.$transaction([
      db.deliveryOffer.update({
        where: { id: offerId },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      }),
      db.orderDelivery.update({
        where: { id: proposition.deliveryId },
        data: {
          driverId,
          status: "ACCEPTED",
          assignedAt: new Date(),
          distanceKm: proposition.distanceKm,
          driverPayout: proposition.payout,
        },
      }),
      db.driver.update({
        where: { id: driverId },
        data: { currentOrderId: proposition.deliveryId, isAvailable: false },
      }),
      // Les propositions encore ouvertes pour cette course n'ont plus lieu d'être.
      db.deliveryOffer.updateMany({
        where: { deliveryId: proposition.deliveryId, status: "PENDING", id: { not: offerId } },
        data: { status: "CANCELLED", respondedAt: new Date() },
      }),
    ]);

    emitDeliveryUpdate(course.orderId, { driverId, status: "ACCEPTED" });
    enArrierePlan(Notifier.etapeLivraisonClient(course.orderId, "ACCEPTED"));
    // Le commerçant est prévenu qu'un livreur arrive, écran ouvert ou non.
    enArrierePlan(Notifier.livreurTrouveBoutique(course.orderId));

    return course;
  }

  /** Le livreur refuse : la course part aussitôt au suivant. */
  static async refuser(offerId: string, driverId: string) {
    const proposition = await db.deliveryOffer.findUnique({ where: { id: offerId } });

    if (!proposition || proposition.driverId !== driverId) {
      throw new ApiError(404, "Proposition introuvable", "OFFER_NOT_FOUND");
    }

    if (proposition.status !== "PENDING") {
      throw new ApiError(409, "Cette proposition n'est plus ouverte", "OFFER_CLOSED");
    }

    await db.deliveryOffer.update({
      where: { id: offerId },
      data: { status: "DECLINED", respondedAt: new Date() },
    });

    // Ne pas attendre le balayage : un refus est une réponse immédiate.
    return this.proposerAuSuivant(proposition.deliveryId);
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

    const livreur = await db.driver.update({
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

    const course = await db.orderDelivery.update({
      where: { id: livreur.currentOrderId },
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
      },
    });

    emitDeliveryUpdate(course.orderId, {
      status: course.status,
      location: { latitude: position.latitude, longitude: position.longitude },
    });

    await this.prevenirSiProche(course, position);

    return { suivie: true, enLigne: livreur.isOnline, orderId: course.orderId };
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
