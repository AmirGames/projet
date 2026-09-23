import { db } from "./db";
import { logger } from "../config/logger";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint, Point } from "../utils/geo";
import { emitDeliveryUpdate, emitDriverEvent } from "../config/socket";
import { genererCode } from "./delivery-proof.service";
import { obfusquerAdresse } from "../utils/address-obfuscation";

/**
 * Attribution des courses aux livreurs.
 *
 * Une course part au livreur disponible le plus proche du point de retrait.
 * Il a un délai pour répondre ; passé ce délai elle va au suivant, et ainsi de
 * suite jusqu'à ce que quelqu'un accepte ou que la liste soit épuisée.
 *
 * Un livreur n'est sollicité qu'une fois par course : re-proposer à quelqu'un
 * qui vient de refuser transforme le refus en harcèlement, et retarde la
 * course d'autant.
 */

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
  static async livreursEligibles(retrait: Point, reglages: Reglages, dejaSollicites: string[]) {
    const candidats = await db.driver.findMany({
      where: {
        id: { notIn: dejaSollicites },
        status: "ACTIVE",
        isOnline: true,
        isAvailable: true,
        currentOrderId: null,
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
        offers: { select: { driverId: true } },
        order: {
          select: {
            deliveryAddress: true,
            deliveryCity: true,
            deliveryPostal: true,
            totalAmount: true,
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
    const dejaSollicites = course.offers.map((o) => o.driverId);
    const candidats = await this.livreursEligibles(retrait, reglages, dejaSollicites);

    if (candidats.length === 0) {
      logger.info("Aucun livreur disponible pour la course", { deliveryId });
      return null;
    }

    // Le commerçant peut désigner un livreur dans la liste des disponibles :
    // il reçoit la course en premier s'il est toujours éligible, sinon elle
    // part au plus proche.
    const choisi =
      (livreurPrefere && candidats.find((c) => c.id === livreurPrefere)) || candidats[0];
    const { payout } = this.remuneration(choisi.distance, reglages);

    const proposition = await db.deliveryOffer.create({
      data: {
        deliveryId,
        driverId: choisi.id,
        distanceKm: choisi.distance,
        payout,
        expiresAt: new Date(Date.now() + reglages.offerSeconds * 1000),
      },
    });

    // Le salon temps réel est celui du compte connecté : l'e-mail du compte
    // peut différer de celui saisi sur la fiche livreur.
    emitDriverEvent(choisi.user?.email || choisi.email, "course-proposee", {
      offerId: proposition.id,
      deliveryId,
      distanceKm: choisi.distance,
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

    logger.info("Course proposée", { deliveryId, driverId: choisi.id, distance: choisi.distance });

    return proposition;
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
      select: { currentOrderId: true },
    });

    if (!livreur.currentOrderId) return { suivie: false };

    const course = await db.orderDelivery.update({
      where: { id: livreur.currentOrderId },
      data: {
        driverLat: position.latitude,
        driverLng: position.longitude,
        driverLocationAt: maintenant,
      },
      select: { orderId: true, status: true },
    });

    emitDeliveryUpdate(course.orderId, {
      status: course.status,
      location: { latitude: position.latitude, longitude: position.longitude },
    });

    return { suivie: true, orderId: course.orderId };
  }
}
