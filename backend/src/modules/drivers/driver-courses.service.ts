import type { Courier } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../../utils/geo";
import { DispatchService, STATUTS_EN_COURSE } from "./dispatch.service";
import { ordonner, versCourseTournee } from "./tournee.service";
import { DeliveryProofService, finAttente } from "./delivery-proof.service";
import { bilanCourse } from "./driver-activity.service";
import { courseDuLivreur } from "./driver-ownership.service";
import { adresseLivraison, adresseRetrait, gainAnnonce, masquerClient } from "./driver-course-format";

/**
 * Lecture des courses du livreur : liste, détail, propositions en cours et
 * tournée. Chaque lecture est bornée au livreur (ou à celui à qui la course
 * est proposée) : une course porte le nom, le téléphone et l'adresse du client.
 */
export const DriverCoursesService = {
  /** Les courses du livreur par statut (PENDING = ses propositions en cours). */
  async lister(livreur: Courier, status: string) {
    // Une course en attente ne regarde que le livreur à qui elle a été
    // proposée. Renvoyer toutes les courses de la plateforme laissait
    // n'importe qui prendre celle d'un autre, ce qui vide l'attribution de
    // son sens.
    const enAttente = status === "PENDING";

    // « ACTIVE » : la course en cours du livreur, acceptée ou déjà récupérée.
    // Sans ce filtre, le tableau de bord ne relevait que les courses en
    // attente : une fois acceptée, la course disparaissait de l'écran.
    const filtreStatut =
      status === "ACTIVE"
        ? { in: ["ACCEPTED", "PICKED_UP"] }
        : status.includes(",")
          ? { in: status.split(",").map((s) => s.trim()).filter(Boolean) }
          : status;

    const deliveries = await db.orderDelivery.findMany({
      where: {
        status: filtreStatut,
        ...(enAttente
          ? {
              driverId: null,
              offers: {
                some: { driverId: livreur.id, status: "PENDING", expiresAt: { gt: new Date() } },
              },
            }
          : { driverId: livreur.id }),
      },
      include: {
        order: {
          include: {
            items: {
              include: { product: true }
            },
            store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
            pourboireApres: { select: { status: true, amount: true } },
          }
        },
        // Le gain annoncé à ce livreur : la proposition en cours, ou celle
        // qu'il a acceptée.
        offers: {
          where: { driverId: livreur.id },
          select: { payout: true },
          orderBy: { offeredAt: "desc" },
          take: 1,
        },
      },
      take: 50,
      orderBy: { createdAt: "desc" }
    });

    // Les courses du livreur : celles de sa tournée qui ne sont pas encore
    // à leur tour ne montrent pas leur client.
    const etat = enAttente ? null : await DispatchService.etatTournee(livreur.id);
    return deliveries.map((d) => masquerClient({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      pickupAddress: adresseRetrait(d.order?.store),
      pickupStore: d.order?.store?.name || "",
      deliveryAddress: adresseLivraison(d.order),
      customerName: d.order?.customerName || "",
      customerPhone: d.order?.customerPhone || "",
      // Ce que la course lui rapporte. Le total payé par le client (articles,
      // livraison, frais de service) s'affichait à sa place : 20,25 € pour
      // une course qui lui rapporte 5 €. Il n'a rien à encaisser.
      payout: gainAnnonce(d, d.offers?.[0]),
      // La part du gain qui vient du pourboire du client (déjà comprise).
      pourboire: Number(d.order?.tipAmount || 0),
      pourboireApres: d.order?.pourboireApres?.status === "PAID" ? Number(d.order.pourboireApres.amount) : 0,
      distance: d.distanceKm ?? undefined,
      estimatedTime: d.estimatedTime,
      items: d.order?.items || [],
      // Les deux arrêts d'une course attribuée : l'application sait ainsi où
      // l'immobilité est normale (attendre au commerce, chez le client).
      ...(enAttente
        ? {}
        : {
            pickupLat: d.pickupLat ?? d.order?.store?.latitude ?? null,
            pickupLng: d.pickupLng ?? d.order?.store?.longitude ?? null,
            latitude: d.deliveryLat ?? null,
            longitude: d.deliveryLng ?? null,
            // La veille du téléphone lit la liste : elle doit connaître l'attente à la porte.
            attenteFinLe: finAttente(d),
          }),
    }, etat && STATUTS_EN_COURSE.includes(d.status) ? DispatchService.masquage(etat, d.id) : null));
  },

  /** Le détail d'une course attribuée au livreur, ou proposée à lui seul. */
  async detail(userId: string, deliveryId: string) {
    // Seul le livreur de la course (ou celui à qui elle est proposée) la lit :
    // elle porte le nom, le téléphone et l'adresse du client.
    const { livreur } = await courseDuLivreur(userId, deliveryId, true);

    const delivery = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            items: { include: { product: true } },
            store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
            pourboireApres: { select: { status: true, amount: true } },
          }
        },
        offers: {
          where: { driverId: livreur.id, status: "ACCEPTED" },
          select: { payout: true, distanceKm: true, respondedAt: true },
          take: 1,
        },
      }
    });

    if (!delivery) {
      throw new ApiError(404, "Delivery not found", "DELIVERY_NOT_FOUND");
    }

    // Tant que la course n'est pas attribuée, seules les coordonnées
    // obfusquées sortent. Une fois acceptée, le livreur a besoin du point
    // exact pour s'y rendre.
    const attribuee = Boolean(delivery.driverId);
    const destLat = attribuee ? delivery.deliveryLat : delivery.deliveryLatObfusquee;
    const destLng = attribuee ? delivery.deliveryLng : delivery.deliveryLngObfusquee;

    const raison =
      delivery.driverId === livreur.id && STATUTS_EN_COURSE.includes(delivery.status)
        ? DispatchService.masquage(await DispatchService.etatTournee(livreur.id), delivery.id)
        : null;

    return masquerClient({
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.status,
      // Le livreur arrive pendant la préparation : il ne prend la commande
      // qu'une fois que le commerçant l'a déclarée prête.
      orderStatus: delivery.order?.status,
      pickupStore: delivery.order?.store?.name || "",
      pickupAddress: adresseRetrait(delivery.order?.store),
      deliveryAddress: adresseLivraison(delivery.order),
      customerName: delivery.order?.customerName,
      customerPhone: delivery.order?.customerPhone,
      payout: gainAnnonce(delivery, delivery.offers[0]),
      pourboire: Number(delivery.order?.tipAmount || 0),
      pourboireApres:
        delivery.order?.pourboireApres?.status === "PAID" ? Number(delivery.order.pourboireApres.amount) : 0,
      distance: delivery.distanceKm ?? undefined,
      estimatedTime: delivery.estimatedTime,
      pickupLat: delivery.pickupLat ?? delivery.order?.store?.latitude ?? null,
      pickupLng: delivery.pickupLng ?? delivery.order?.store?.longitude ?? null,
      latitude: destLat,
      longitude: destLng,
      items: delivery.order?.items || [],
      // Le livreur doit savoir qu'un code lui sera demandé, sans jamais le
      // lire : c'est le client qui le détient.
      ...DeliveryProofService.etatDeLaPreuve(delivery),
      // Course livrée par lui : ce qu'elle lui a rapporté, en distance et
      // en temps, pour l'écran de fin de course.
      bilan:
        delivery.status === "DELIVERED" && delivery.driverId === livreur.id
          ? bilanCourse(delivery, delivery.offers[0])
          : null,
    }, raison);
  },

  /** Accepte, par la course, la proposition personnelle encore valable du livreur. */
  async accepterParCourse(userId: string, deliveryId: string) {
    const { livreur, course } = await courseDuLivreur(userId, deliveryId, true);

    if (course.driverId === livreur.id) {
      throw new ApiError(409, "Vous avez déjà accepté cette course", "ALREADY_ACCEPTED");
    }

    // On accepte une proposition, pas une course au hasard. Cette route
    // attribuait la course sans fixer la rémunération ni marquer le livreur
    // occupé : il repartait avec une course non payée et pouvait en
    // recevoir une deuxième.
    const proposition = await db.deliveryOffer.findFirst({
      where: {
        deliveryId,
        driverId: livreur.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });

    if (!proposition) {
      throw new ApiError(
        403,
        "Cette course ne vous a pas été proposée",
        "NOT_OFFERED"
      );
    }

    return DispatchService.accepter(proposition.id, livreur.id);
  },

  /** Les courses proposées au livreur, en attente de sa réponse. */
  async propositions(livreur: Courier) {
    const propositions = await db.deliveryOffer.findMany({
      where: {
        driverId: livreur.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      include: {
        delivery: {
          include: {
            order: {
              select: {
                id: true,
                deliveryAddress: true,
                deliveryCity: true,
                deliveryPostal: true,
                store: { select: { name: true, address: true, city: true, latitude: true, longitude: true } },
              },
            },
          },
        },
      },
      orderBy: { offeredAt: "asc" },
    });

    return propositions.map((proposition) => ({
      id: proposition.id,
      deliveryId: proposition.deliveryId,
      // Trajet payé, du commerce au client.
      distanceKm: proposition.distanceKm,
      // Chemin du livreur jusqu'au commerce, depuis sa dernière position.
      approcheKm: (() => {
        const store = proposition.delivery.order?.store;
        const depart = { latitude: livreur.latitude, longitude: livreur.longitude };
        const arrivee = { latitude: store?.latitude, longitude: store?.longitude };
        return estUnPoint(depart) && estUnPoint(arrivee)
          ? Number(distanceKm(depart, arrivee).toFixed(2))
          : null;
      })(),
      payout: Number(proposition.payout || 0),
      expiresAt: proposition.expiresAt,
      // Plusieurs courses : proposées ensemble (même batchId, un seul
      // « Accepter » pour tout le lot), ou ajoutée à la course en cours.
      batchId: proposition.batchId,
      ajout: proposition.ajout,
      // Plus longue que la limite habituelle de son véhicule : il peut refuser.
      horsLimite: proposition.horsLimite,
      // À enchaîner après sa livraison en cours : elle démarre quand il est libre.
      bientotLibre: proposition.bientotLibre,
      libreDansSecondes: proposition.libreDansSecondes,
      // Nouvelles données
      pickupStore: proposition.delivery.order?.store?.name,
      pickupAddress: proposition.delivery.order?.store?.address,
      pickupCity: proposition.delivery.order?.store?.city,
      pickupLat: proposition.delivery.order?.store?.latitude,
      pickupLng: proposition.delivery.order?.store?.longitude,
      deliveryAddress: proposition.delivery.order?.deliveryAddress,
      deliveryCity: proposition.delivery.order?.deliveryCity,
      deliveryPostal: proposition.delivery.order?.deliveryPostal,
      // Le point de livraison, à 50-100 m près tant que la course n'est pas
      // acceptée : de quoi tracer le trajet sur la carte de la proposition.
      deliveryLat: proposition.delivery.deliveryLatObfusquee,
      deliveryLng: proposition.delivery.deliveryLngObfusquee,
      // Anciennes données (rétrocompatibilité)
      boutique: proposition.delivery.order?.store,
      adresse: proposition.delivery.order?.deliveryAddress,
      ville: proposition.delivery.order?.deliveryCity,
      codePostal: proposition.delivery.order?.deliveryPostal,
    }));
  },

  /**
   * Les arrêts du livreur, dans l'ordre.
   *
   * Avec plusieurs courses, l'ordre des retraits et des remises ne va pas de
   * soi : le serveur le calcule depuis la position du livreur (voir
   * tournee.service.ts), un retrait toujours avant sa remise.
   */
  async tournee(livreur: Courier) {
    const courses = await db.orderDelivery.findMany({
      where: { driverId: livreur.id, status: { in: STATUTS_EN_COURSE } },
      include: {
        order: {
          select: {
            status: true,
            customerName: true,
            deliveryAddress: true,
            deliveryPostal: true,
            deliveryCity: true,
            store: { select: { name: true, address: true, city: true } },
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    });

    const depart = { latitude: livreur.latitude, longitude: livreur.longitude };
    const { arrets: tous, km } = ordonner(
      estUnPoint(depart) ? depart : null,
      courses.map(versCourseTournee)
    );
    const parId = new Map(courses.map((c) => [c.id, c]));

    // Ce que le livreur voit : les commandes à récupérer d'abord ; ensuite
    // une seule remise, celle dont c'est le tour (ordre figé au dernier
    // retrait). Les autres clients restent masqués.
    const etat = await DispatchService.etatTournee(livreur.id);
    const arrets =
      etat.retraitsRestants > 0
        ? tous.filter((a) => a.type === "RETRAIT")
        : tous.filter((a) => a.type === "REMISE" && a.deliveryId === etat.remiseCourante);
    const remisesMasquees = courses.length - (etat.retraitsRestants > 0 ? 0 : arrets.length);

    return {
      km: Number(km.toFixed(2)),
      remisesMasquees,
      arrets: arrets.map((a) => {
        const c = parId.get(a.deliveryId)!;
        const retrait = a.type === "RETRAIT";
        return {
          deliveryId: c.id,
          orderId: c.orderId,
          type: a.type,
          statutCourse: c.status,
          // Au commerce : la commande n'est à prendre qu'une fois prête.
          commandePrete: c.order?.status === "READY",
          nom: retrait ? c.order?.store?.name || "Commerce" : c.order?.customerName || "Client",
          adresse: retrait ? adresseRetrait(c.order?.store) : adresseLivraison(c.order),
          lat: a.point.latitude ?? null,
          lng: a.point.longitude ?? null,
        };
      }),
    };
  },
};
