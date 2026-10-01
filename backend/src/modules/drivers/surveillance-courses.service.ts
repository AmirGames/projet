import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint, Point } from "../../utils/geo";
import {
  emitDeliveryUpdate,
  emitDriverEvent,
  emitMerchantEvent,
  emitNotification,
  emitSupportEvent,
} from "../realtime/socket";
import { Notifier, enArrierePlan } from "../notifications/notifier.service";
import { lienDeSuivi } from "../orders/suivi-commande.service";
import { prevenirPlateforme } from "../monitoring/vigie.service";
import { DispatchService, MAX_SOLLICITATIONS, STATUTS_EN_COURSE } from "./dispatch.service";
import { GPS_PERDU_APRES_MS } from "./driver-availability.service";

/**
 * Surveillance des courses acceptées.
 *
 * Une fois la course acceptée, plus rien ne la regardait : un livreur parti
 * dans la mauvaise direction, ou qui ne livrait pas, gardait la commande
 * indéfiniment. Le commerçant ne pouvait pas la confier à un autre (« cette
 * course a déjà un livreur »), la plateforme non plus, et le client voyait
 * seulement la pastille s'éloigner.
 *
 * Deux situations, deux réponses :
 *
 * - **La commande est encore au commerce (ACCEPTED).** Rien n'est perdu : le
 *   livreur est d'abord averti, puis, s'il ne vient toujours pas, la course
 *   lui est retirée et repart chercher un autre livreur. Elle ne lui sera plus
 *   proposée d'office.
 * - **La commande est dans son sac (PICKED_UP).** La retirer ne la ramène pas :
 *   on alerte le livreur, le commerce, le client et l'équipe de la plateforme,
 *   qui décide (contacter le livreur, déclarer la course échouée, rembourser).
 *
 * Chaque constat est enregistré une seule fois par attribution
 * (DeliveryIncident) : la surveillance passe toutes les 30 secondes, elle ne
 * doit pas renvoyer le même message à chaque passage.
 */

/** Les seuils, en un seul endroit. Des minutes et des kilomètres à vol d'oiseau. */
export const SEUILS_COURSE = {
  /** Au commerce : passé ce délai sans y être, le livreur est prévenu qu'on l'attend. */
  avertirRetraitMin: 20,
  /** Toujours pas au commerce : la course part à un autre livreur. */
  retirerRetraitMin: 30,
  /** En deçà, le livreur est au commerce : il attend la commande, il n'est pas en retard. */
  rayonCommerceKm: 0.3,
  /**
   * Commande pas encore prête : un livreur à moins de cette distance du
   * commerce patiente à côté, on ne lui retire pas la course.
   */
  rayonAttenteKm: 2,
  /**
   * Il s'éloigne du commerce : au-delà du rayon d'attribution plus cette
   * marge, il n'est plus en chemin (il a été choisi dans ce rayon).
   */
  margeEcartRetraitKm: 3,
  /**
   * En route vers le client : le détour toléré (distance livreur → commerce
   * + livreur → client − trajet). Plus large que celui d'une tournée (2 km de
   * détour, clients à 2 km l'un de l'autre) pour ne pas la prendre pour un écart.
   */
  ecartLivraisonKm: 5,
  /** Durée d'un écart avant d'avertir : un détour d'une minute n'est pas un écart. */
  ecartAvertirMin: 5,
  /** Durée d'un écart avant de retirer la course (commande encore au commerce seulement). */
  ecartRetirerMin: 10,
  /** Livraison : jamais moins d'une demi-heure après la récupération. */
  livraisonMinMin: 30,
  /** Quatre minutes par kilomètre (15 km/h en ville, la route étant plus longue que le vol d'oiseau)… */
  minutesParKm: 4,
  /** … plus dix minutes pour se garer, monter, trouver la porte. */
  margeLivraisonMin: 10,
  /** Chaque autre commande de la tournée à remettre en route. */
  minutesParAutreRemise: 10,
};

export type TypeIncident =
  | "RETARD_RETRAIT"
  | "ECART_RETRAIT"
  | "RETARD_LIVRAISON"
  | "ECART_LIVRAISON"
  | "COURSE_RETIREE"
  | "COURSE_ECHOUEE";

/** AVERTIR : le livreur seul. RETIRER : la course part à un autre. ALERTER : tout le monde. */
export interface Constat {
  type: TypeIncident;
  action: "AVERTIR" | "RETIRER" | "ALERTER";
  minutes: number;
  distanceKm: number | null;
  detail: string;
}

/** Ce qu'il faut savoir d'une course pour juger si elle dérape. */
export interface CourseSurveillee {
  status: string;
  assignedAt: Date;
  pickupTime: Date | null;
  pickupLat: number | null;
  pickupLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  driftStartedAt: Date | null;
  customerWaitStartedAt: Date | null;
  /** La commande est prête au commerce. */
  commandePrete: boolean;
  /** Les autres commandes de la tournée déjà récupérées (à remettre aussi). */
  autresRemises: number;
}

/** Délai accordé pour livrer, en minutes, depuis la récupération. */
export function delaiLivraisonMin(trajetKm: number | null, autresRemises = 0) {
  const s = SEUILS_COURSE;
  const trajet = trajetKm == null ? 0 : Math.round(trajetKm * s.minutesParKm + s.margeLivraisonMin);
  return Math.max(s.livraisonMinMin, trajet) + autresRemises * s.minutesParAutreRemise;
}

const minutesDepuis = (debut: Date, maintenant: Date) =>
  Math.max(0, Math.floor((maintenant.getTime() - debut.getTime()) / 60000));

const km = (n: number) => n.toFixed(1).replace(".", ",");

/**
 * Juge une course, sans rien écrire : ce qui est constaté, et si le livreur
 * est en ce moment hors de son trajet (pour poser ou effacer driftStartedAt).
 *
 * `position` est nulle quand on ne sait pas où est le livreur (signal perdu,
 * position trop ancienne) : on ne conclut alors à aucun écart, seul le temps
 * compte.
 */
export function evaluerCourse(
  course: CourseSurveillee,
  position: Point | null,
  maintenant: Date,
  rayonAttributionKm: number
): { ecart: boolean; ecartKm: number | null; constats: Constat[] } {
  const s = SEUILS_COURSE;
  const constats: Constat[] = [];
  const commerce = { latitude: course.pickupLat, longitude: course.pickupLng };
  const client = { latitude: course.deliveryLat, longitude: course.deliveryLng };
  const dureeEcart = (ecart: boolean) =>
    ecart && course.driftStartedAt ? minutesDepuis(course.driftStartedAt, maintenant) : 0;

  if (course.status === "ACCEPTED") {
    const minutes = minutesDepuis(course.assignedAt, maintenant);
    const versCommerce = position && estUnPoint(commerce) ? distanceKm(position, commerce) : null;

    // Au commerce, il attend la commande : ce n'est pas lui qui est en retard.
    if (versCommerce != null && versCommerce <= s.rayonCommerceKm) {
      return { ecart: false, ecartKm: null, constats };
    }

    const ecart = versCommerce != null && versCommerce > rayonAttributionKm + s.margeEcartRetraitKm;
    const ecartMin = dureeEcart(ecart);

    // Commande pas encore prête et livreur tout près : il patiente, rien ne presse.
    const patiente = !course.commandePrete && versCommerce != null && versCommerce <= s.rayonAttenteKm;

    if (!patiente && minutes >= s.retirerRetraitMin) {
      constats.push({
        type: "RETARD_RETRAIT",
        action: "RETIRER",
        minutes,
        distanceKm: versCommerce,
        detail:
          versCommerce == null
            ? `Toujours pas au commerce ${minutes} min après avoir accepté (position inconnue).`
            : `Toujours pas au commerce ${minutes} min après avoir accepté, à ${km(versCommerce)} km.`,
      });
    } else if (ecart && ecartMin >= s.ecartRetirerMin) {
      constats.push({
        type: "ECART_RETRAIT",
        action: "RETIRER",
        minutes,
        distanceKm: versCommerce,
        detail: `S'éloigne du commerce : à ${km(versCommerce!)} km depuis ${ecartMin} min.`,
      });
    } else {
      if (!patiente && minutes >= s.avertirRetraitMin) {
        constats.push({
          type: "RETARD_RETRAIT",
          action: "AVERTIR",
          minutes,
          distanceKm: versCommerce,
          detail: `Pas encore au commerce ${minutes} min après avoir accepté.`,
        });
      }
      if (ecart && ecartMin >= s.ecartAvertirMin) {
        constats.push({
          type: "ECART_RETRAIT",
          action: "AVERTIR",
          minutes,
          distanceKm: versCommerce,
          detail: `S'éloigne du commerce : à ${km(versCommerce!)} km depuis ${ecartMin} min.`,
        });
      }
    }

    return { ecart, ecartKm: ecart ? versCommerce : null, constats };
  }

  if (course.status === "PICKED_UP") {
    // À la porte, le client ne répond pas : l'attente a sa propre procédure.
    if (course.customerWaitStartedAt) return { ecart: false, ecartKm: null, constats };

    const minutes = minutesDepuis(course.pickupTime ?? course.assignedAt, maintenant);
    const trajet = estUnPoint(commerce) && estUnPoint(client) ? distanceKm(commerce, client) : null;
    const delai = delaiLivraisonMin(trajet, course.autresRemises);

    let ecartKm: number | null = null;
    if (position && trajet != null) {
      const detour = distanceKm(position, commerce as Point) + distanceKm(position, client as Point) - trajet;
      if (detour > s.ecartLivraisonKm) ecartKm = Number(detour.toFixed(2));
    }
    const ecart = ecartKm != null;

    if (minutes >= delai) {
      constats.push({
        type: "RETARD_LIVRAISON",
        action: "ALERTER",
        minutes,
        distanceKm: ecartKm,
        detail: `Pas encore livrée ${minutes} min après la récupération (délai prévu : ${delai} min).`,
      });
    }
    const ecartMin = dureeEcart(ecart);
    if (ecart && ecartMin >= s.ecartAvertirMin) {
      constats.push({
        type: "ECART_LIVRAISON",
        action: "ALERTER",
        minutes,
        distanceKm: ecartKm,
        detail: `Hors du trajet vers le client : ${km(ecartKm!)} km de détour depuis ${ecartMin} min.`,
      });
    }

    return { ecart, ecartKm, constats };
  }

  return { ecart: false, ecartKm: null, constats };
}

/** Ce que la surveillance lit d'une course en cours. */
const COURSE_EN_COURS = {
  id: true,
  orderId: true,
  status: true,
  driverId: true,
  assignedAt: true,
  pickupTime: true,
  pickupLat: true,
  pickupLng: true,
  deliveryLat: true,
  deliveryLng: true,
  driftStartedAt: true,
  customerWaitStartedAt: true,
  order: {
    select: {
      status: true,
      storeId: true,
      customerEmail: true,
      store: { select: { name: true, orgId: true } },
    },
  },
  driver: {
    select: {
      id: true,
      name: true,
      email: true,
      latitude: true,
      longitude: true,
      lastLocationUpdate: true,
      gpsLostAt: true,
      user: { select: { email: true } },
    },
  },
} as const;

type Auteur = "SYSTEM" | { userId: string };
const auteurDe = (par: Auteur) => (par === "SYSTEM" ? "SYSTEM" : par.userId);

const numeroDe = (orderId: string) => orderId.slice(-6).toUpperCase();
const prenom = (nom: string | null | undefined, defaut: string) => nom?.split(" ")[0] || defaut;

export class SurveillanceCoursesService {
  /**
   * Un passage : juge chaque course en cours, avertit, retire ou alerte, puis
   * referme les constats des courses terminées.
   *
   * Rejouable sans effet en double : un constat déjà enregistré pour cette
   * attribution ne renvoie rien, une course déjà retirée ne l'est pas deux fois.
   */
  static async surveiller(maintenant = new Date()) {
    const bilan = { averties: 0, retirees: 0, alertes: 0, closes: 0 };
    const { maxRadiusKm } = await DispatchService.reglages();

    const courses = await db.orderDelivery.findMany({
      where: { status: { in: STATUTS_EN_COURSE }, driverId: { not: null }, assignedAt: { not: null } },
      select: COURSE_EN_COURS,
      orderBy: { assignedAt: "asc" },
      take: 500,
    });

    // Tournée : les commandes déjà récupérées par chaque livreur.
    const recuperees = new Map<string, number>();
    for (const c of courses) {
      if (c.status === "PICKED_UP" && c.driverId) recuperees.set(c.driverId, (recuperees.get(c.driverId) ?? 0) + 1);
    }

    for (const course of courses) {
      try {
        const livreur = course.driver;
        if (!livreur || !course.assignedAt) continue;

        // Une position qui n'arrive plus ne dit plus où il est.
        const frais =
          !livreur.gpsLostAt &&
          livreur.lastLocationUpdate &&
          maintenant.getTime() - livreur.lastLocationUpdate.getTime() <= GPS_PERDU_APRES_MS;
        const position = frais && estUnPoint(livreur) ? (livreur as Point) : null;

        const { ecart, constats } = evaluerCourse(
          {
            ...course,
            assignedAt: course.assignedAt,
            commandePrete: course.order?.status === "READY",
            autresRemises: course.status === "PICKED_UP" ? Math.max(0, (recuperees.get(livreur.id) ?? 1) - 1) : 0,
          },
          position,
          maintenant,
          maxRadiusKm
        );

        // L'écart se mesure dans la durée : on retient quand il a commencé.
        // Sans position, on ne sait pas : l'état reste tel quel.
        if (position && ecart !== Boolean(course.driftStartedAt)) {
          await db.orderDelivery.updateMany({
            where: { id: course.id, assignedAt: course.assignedAt },
            data: { driftStartedAt: ecart ? maintenant : null },
          });
        }

        const retrait = constats.find((c) => c.action === "RETIRER");
        if (retrait) {
          const retiree = await this.retirerCourse(course.id, {
            par: "SYSTEM",
            motif: retrait.detail,
            constat: retrait,
            attendu: { driverId: livreur.id, assignedAt: course.assignedAt },
          });
          if (retiree) bilan.retirees += 1;
          continue;
        }

        for (const constat of constats) {
          const nouveau = await this.enregistrer(course.id, livreur.id, course.assignedAt, constat, course.status);
          if (!nouveau) continue;

          if (constat.action === "AVERTIR") {
            bilan.averties += 1;
            this.avertirLivreur(course, constat);
          } else {
            bilan.alertes += 1;
            enArrierePlan(this.alerterTous(course, constat));
          }
        }
      } catch (err) {
        // Une course ne doit pas empêcher de surveiller les autres.
        logger.warn("Surveillance d'une course impossible", {
          deliveryId: course.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }

    bilan.closes = await this.refermerTerminees(maintenant);
    return bilan;
  }

  /**
   * Enregistre un constat. Renvoie vrai s'il est nouveau pour cette
   * attribution : c'est lui seul qui déclenche un message.
   */
  private static async enregistrer(
    deliveryId: string,
    driverId: string,
    assignedAt: Date,
    constat: Pick<Constat, "type" | "minutes" | "distanceKm" | "detail">,
    status: string,
    cloture?: { par: Auteur; resolution: string }
  ) {
    const { count } = await db.deliveryIncident.createMany({
      data: [
        {
          deliveryId,
          driverId,
          assignedAt,
          type: constat.type,
          phase: status === "PICKED_UP" ? "LIVRAISON" : "RETRAIT",
          detail: constat.detail,
          minutes: constat.minutes,
          distanceKm: constat.distanceKm,
          ...(cloture
            ? { closedAt: new Date(), closedBy: auteurDe(cloture.par), resolution: cloture.resolution }
            : {}),
        },
      ],
      skipDuplicates: true,
    });
    if (count > 0) {
      emitSupportEvent("incident-livraison", { deliveryId, driverId, type: constat.type });
      logger.warn("Incident de course", { deliveryId, driverId, type: constat.type, detail: constat.detail });
    }
    return count > 0;
  }

  /** Le livreur seul : on l'attend, ou il s'éloigne. */
  private static avertirLivreur(
    course: { id: string; orderId: string; order: { store: { name: string } | null } | null; driver: { id: string; email: string; user: { email: string } | null } | null },
    constat: Constat
  ) {
    if (!course.driver) return;
    const boutique = course.order?.store?.name || "Le commerce";
    const message =
      constat.type === "ECART_RETRAIT"
        ? `Vous vous éloignez de ${boutique}. Sans retour vers le commerce, la course sera confiée à un autre livreur.`
        : `${boutique} vous attend. Sans récupération d'ici ${SEUILS_COURSE.retirerRetraitMin - SEUILS_COURSE.avertirRetraitMin} min, la course sera confiée à un autre livreur.`;

    emitDriverEvent(course.driver.user?.email || course.driver.email, "course-avertissement", {
      deliveryId: course.id,
      orderId: course.orderId,
      type: constat.type,
      message,
    });
    enArrierePlan(
      Notifier.pushLivreur(course.driver.id, {
        title: "On vous attend au commerce",
        body: message,
        url: `/driver/deliveries/${course.id}`,
        tag: "course-avertissement",
      })
    );
  }

  /**
   * La commande est dans le sac et la livraison dérape : le livreur, le
   * commerce, le client et la plateforme sont prévenus. Personne ne retire
   * rien d'office : c'est à la plateforme de décider.
   */
  private static async alerterTous(
    course: {
      id: string;
      orderId: string;
      order: { storeId: string; customerEmail: string | null; store: { name: string; orgId: string } | null } | null;
      driver: { id: string; name: string; email: string; user: { email: string } | null } | null;
    },
    constat: Constat
  ) {
    const livreur = course.driver;
    const numero = numeroDe(course.orderId);
    const ecart = constat.type === "ECART_LIVRAISON";

    if (livreur) {
      const message = ecart
        ? "Vous vous éloignez de l'adresse du client. Le client et le support ont été prévenus : contactez le support en cas de problème."
        : "Cette livraison est en retard. Le client et le support ont été prévenus : contactez le support en cas de problème.";
      emitDriverEvent(livreur.user?.email || livreur.email, "course-avertissement", {
        deliveryId: course.id,
        orderId: course.orderId,
        type: constat.type,
        message,
      });
      enArrierePlan(
        Notifier.pushLivreur(livreur.id, {
          title: ecart ? "Vous vous éloignez du client" : "Livraison en retard",
          body: message,
          url: `/driver/deliveries/${course.id}`,
          tag: "course-avertissement",
        })
      );
    }

    // Le suivi du client affiche le retard, sans attendre un rechargement.
    emitDeliveryUpdate(course.orderId, { retard: true });

    if (course.order) {
      await this.prevenirBoutique(
        course.orderId,
        course.order,
        "DELIVERY_LATE",
        ecart ? "Livreur hors trajet" : "Livraison en retard",
        `Commande #${numero} : ${constat.detail} La plateforme a été prévenue.`
      );
      await this.prevenirClient(
        course.orderId,
        course.order.customerEmail,
        "DELIVERY_LATE",
        "Votre livraison prend du retard",
        `Votre commande ${course.order.store?.name ? `${course.order.store.name} ` : ""}prend plus de temps que prévu. Notre équipe a été prévenue et suit votre livraison.`
      );
    }

    await prevenirPlateforme({
      sujet: `🟠 [ZupEat] ${ecart ? "Livreur hors trajet" : "Livraison en retard"} — commande #${numero}`,
      texte: `${livreur?.name || "Le livreur"} : ${constat.detail}\nCommerce : ${course.order?.store?.name || "?"}.`,
      chemin: "/superowner/incidents-livraison",
      bouton: "Voir les incidents de livraison",
      couleur: "#ea580c",
    });
  }

  /**
   * Retire une course pas encore récupérée à son livreur et la rend à la
   * recherche. Par la surveillance (SYSTEM) ou par la plateforme.
   *
   * La commande est toujours au commerce : rien n'est perdu, un autre
   * livreur la prendra. Le livreur retiré n'est plus sollicité d'office pour
   * cette course, et la garde dans son historique comme annulée.
   *
   * `attendu` protège la surveillance d'une course qui a bougé entre sa
   * lecture et ce retrait (récupérée, livrée, retirée par un autre passage) :
   * rien n'est fait, et la fonction renvoie null.
   */
  static async retirerCourse(
    deliveryId: string,
    options: {
      par: Auteur;
      motif: string;
      constat?: Constat;
      attendu?: { driverId: string; assignedAt: Date };
    }
  ) {
    const course = await db.orderDelivery.findUnique({ where: { id: deliveryId }, select: COURSE_EN_COURS });
    if (!course) throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");

    const { attendu } = options;
    if (
      attendu &&
      (course.driverId !== attendu.driverId || course.assignedAt?.getTime() !== attendu.assignedAt.getTime())
    ) {
      return null;
    }
    if (course.status !== "ACCEPTED" || !course.driverId || !course.assignedAt || !course.driver) {
      if (attendu) return null;
      throw new ApiError(
        409,
        course.status === "PICKED_UP"
          ? "La commande a déjà été récupérée : déclarez plutôt la course échouée."
          : "Seule une course acceptée, pas encore récupérée, peut être retirée.",
        "DELIVERY_NOT_WITHDRAWABLE"
      );
    }

    const driverId = course.driverId;
    const assignedAt = course.assignedAt;
    const maintenant = new Date();
    const auteur = auteurDe(options.par);
    const minutes = minutesDepuis(assignedAt, maintenant);

    const retiree = await db.$transaction(async (tx) => {
      // Sous condition : deux passages, ou la surveillance et la plateforme,
      // ne retirent pas deux fois ; une course récupérée entre-temps reste.
      const { count } = await tx.orderDelivery.updateMany({
        where: { id: deliveryId, driverId, assignedAt, status: "ACCEPTED" },
        data: {
          status: "PENDING",
          driverId: null,
          assignedAt: null,
          // La rémunération se refige à la prochaine acceptation.
          distanceKm: null,
          driverPayout: null,
          driverLat: null,
          driverLng: null,
          driverLocationAt: null,
          ordreRemise: null,
          driftStartedAt: null,
          cancelledBy: options.par === "SYSTEM" ? "SYSTEM" : "PLATFORM",
          cancellationReason: options.motif,
        },
      });
      if (count === 0) return false;

      // Plus de sollicitation d'office pour ce livreur (voir libreA). La
      // proposition reste ACCEPTED : c'est elle qui garde la course dans son
      // historique, comme annulée.
      await tx.deliveryOffer.updateMany({
        where: { deliveryId, driverId },
        data: { attempts: MAX_SOLLICITATIONS },
      });

      const resolution =
        options.par === "SYSTEM" ? "Course retirée automatiquement et rendue à la recherche" : "Course retirée par la plateforme";
      await tx.deliveryIncident.createMany({
        data: [
          {
            deliveryId,
            driverId,
            assignedAt,
            type: "COURSE_RETIREE",
            phase: "RETRAIT",
            detail: options.motif,
            minutes,
            distanceKm: options.constat?.distanceKm ?? null,
            closedAt: maintenant,
            closedBy: auteur,
            resolution,
          },
        ],
        skipDuplicates: true,
      });
      // Les avertissements de cette attribution sont traités.
      await tx.deliveryIncident.updateMany({
        where: { deliveryId, driverId, assignedAt, closedAt: null },
        data: { closedAt: maintenant, closedBy: auteur, resolution },
      });
      return true;
    });

    if (!retiree) {
      if (attendu) return null;
      throw new ApiError(409, "La course a changé entre-temps : rechargez la page.", "DELIVERY_CHANGED");
    }

    // Il redevient libre, sauf s'il lui reste d'autres courses.
    await DispatchService.liberer(driverId);

    logger.warn("Course retirée au livreur", { deliveryId, driverId, par: auteur, motif: options.motif });
    emitSupportEvent("incident-livraison", { deliveryId, driverId, type: "COURSE_RETIREE" });

    const livreur = course.driver;
    const message =
      options.par === "SYSTEM"
        ? "Vous n'êtes pas arrivé au commerce à temps : la course a été confiée à un autre livreur."
        : `La plateforme vous a retiré cette course. Motif : ${options.motif}`;
    emitDriverEvent(livreur.user?.email || livreur.email, "course-retiree", {
      deliveryId,
      orderId: course.orderId,
      message,
    });
    enArrierePlan(
      Notifier.pushLivreur(livreur.id, {
        title: "Course retirée",
        body: message,
        url: "/driver",
        tag: "course-retiree",
      })
    );

    // Le client ne voit plus ce livreur : un autre va être cherché.
    emitDeliveryUpdate(course.orderId, { status: "PENDING", location: null, livreurRemplace: true });

    if (course.order) {
      const numero = numeroDe(course.orderId);
      enArrierePlan(
        this.prevenirBoutique(
          course.orderId,
          course.order,
          "DRIVER_REPLACED",
          "Livreur remplacé",
          `${prenom(livreur.name, "Le livreur")} n'est pas venu chercher la commande #${numero} : nous cherchons un autre livreur.`
        )
      );
      enArrierePlan(
        emitMerchantEvent(course.order.storeId, "livreur-remplace", {
          orderId: course.orderId,
          storeId: course.order.storeId,
          numero,
        })
      );
      enArrierePlan(
        this.prevenirClient(
          course.orderId,
          course.order.customerEmail,
          "DRIVER_REPLACED",
          "Nouveau livreur en approche",
          "Le livreur prévu a eu un empêchement : nous en cherchons un autre pour votre commande."
        )
      );
    }

    // Aussitôt, sans attendre le prochain balayage.
    enArrierePlan(DispatchService.proposerAuSuivant(deliveryId));

    return { deliveryId, driverId, orderId: course.orderId };
  }

  /**
   * La commande est partie avec le livreur et n'arrivera pas : la plateforme
   * déclare la course échouée.
   *
   * Le livreur est libéré et n'est pas payé pour cette course (seules les
   * courses livrées le sont). La commande n'est pas touchée : le
   * remboursement du client se fait depuis la facturation, comme tout
   * remboursement.
   */
  static async declarerEchec(deliveryId: string, options: { par: { userId: string }; motif: string }) {
    const course = await db.orderDelivery.findUnique({ where: { id: deliveryId }, select: COURSE_EN_COURS });
    if (!course) throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");

    if (course.status !== "PICKED_UP" || !course.driverId || !course.assignedAt || !course.driver) {
      throw new ApiError(
        409,
        course.status === "ACCEPTED"
          ? "La commande est encore au commerce : retirez plutôt la course, un autre livreur la prendra."
          : "Seule une course en route vers le client peut être déclarée échouée.",
        "DELIVERY_NOT_FAILABLE"
      );
    }

    const driverId = course.driverId;
    const assignedAt = course.assignedAt;
    const maintenant = new Date();
    const auteur = auteurDe(options.par);

    const echouee = await db.$transaction(async (tx) => {
      const { count } = await tx.orderDelivery.updateMany({
        where: { id: deliveryId, driverId, assignedAt, status: "PICKED_UP" },
        data: {
          status: "FAILED",
          driftStartedAt: null,
          cancelledBy: "PLATFORM",
          cancellationReason: options.motif,
        },
      });
      if (count === 0) return false;

      const resolution = "Course déclarée échouée par la plateforme";
      await tx.deliveryIncident.createMany({
        data: [
          {
            deliveryId,
            driverId,
            assignedAt,
            type: "COURSE_ECHOUEE",
            phase: "LIVRAISON",
            detail: options.motif,
            minutes: minutesDepuis(course.pickupTime ?? assignedAt, maintenant),
            closedAt: maintenant,
            closedBy: auteur,
            resolution,
          },
        ],
        skipDuplicates: true,
      });
      await tx.deliveryIncident.updateMany({
        where: { deliveryId, driverId, assignedAt, closedAt: null },
        data: { closedAt: maintenant, closedBy: auteur, resolution },
      });
      return true;
    });

    if (!echouee) throw new ApiError(409, "La course a changé entre-temps : rechargez la page.", "DELIVERY_CHANGED");

    await DispatchService.liberer(driverId);

    logger.warn("Course déclarée échouée par la plateforme", { deliveryId, driverId, par: auteur });
    emitSupportEvent("incident-livraison", { deliveryId, driverId, type: "COURSE_ECHOUEE" });

    const livreur = course.driver;
    const message = `La plateforme a clos cette course comme échouée. Motif : ${options.motif}`;
    emitDriverEvent(livreur.user?.email || livreur.email, "course-retiree", {
      deliveryId,
      orderId: course.orderId,
      message,
    });
    enArrierePlan(
      Notifier.pushLivreur(livreur.id, { title: "Course close", body: message, url: "/driver", tag: "course-retiree" })
    );

    emitDeliveryUpdate(course.orderId, { status: "FAILED", location: null });

    if (course.order) {
      const numero = numeroDe(course.orderId);
      enArrierePlan(
        this.prevenirBoutique(
          course.orderId,
          course.order,
          "DELIVERY_CANCELLED",
          "Livraison échouée",
          `La livraison de la commande #${numero} a échoué. La plateforme s'occupe du client.`
        )
      );
      enArrierePlan(
        this.prevenirClient(
          course.orderId,
          course.order.customerEmail,
          "DELIVERY_CANCELLED",
          "Un problème est survenu avec votre livraison",
          "Votre commande n'a pas pu être livrée. Notre équipe revient vers vous pour la suite (remboursement ou nouvelle livraison)."
        )
      );
    }

    return { deliveryId, driverId, orderId: course.orderId };
  }

  /**
   * Referme les constats dont la course est terminée pour ce livreur :
   * livrée, échouée, ou passée à un autre. Ce qui reste ouvert attend la
   * plateforme.
   */
  static async refermerTerminees(maintenant = new Date()) {
    const ouverts = await db.deliveryIncident.findMany({
      where: { closedAt: null },
      select: {
        id: true,
        driverId: true,
        assignedAt: true,
        delivery: { select: { status: true, driverId: true, assignedAt: true } },
      },
      take: 500,
    });

    let closes = 0;
    for (const incident of ouverts) {
      const c = incident.delivery;
      const memeAttribution =
        c.driverId === incident.driverId && c.assignedAt?.getTime() === incident.assignedAt.getTime();
      const resolution = !memeAttribution
        ? "La course a changé de livreur"
        : c.status === "DELIVERED"
          ? "Course livrée"
          : c.status === "FAILED"
            ? "Course échouée"
            : null;
      if (!resolution) continue;

      const { count } = await db.deliveryIncident.updateMany({
        where: { id: incident.id, closedAt: null },
        data: { closedAt: maintenant, closedBy: "SYSTEM", resolution },
      });
      closes += count;
    }
    return closes;
  }

  /** La plateforme a traité un constat. */
  static async clore(incidentId: string, par: { userId: string }, resolution: string) {
    const incident = await db.deliveryIncident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new ApiError(404, "Incident introuvable", "INCIDENT_NOT_FOUND");
    if (incident.closedAt) throw new ApiError(409, "Cet incident est déjà clos", "INCIDENT_CLOSED");

    const clos = await db.deliveryIncident.update({
      where: { id: incidentId },
      data: { closedAt: new Date(), closedBy: par.userId, resolution },
    });
    emitSupportEvent("incident-livraison", { deliveryId: clos.deliveryId, driverId: clos.driverId, type: clos.type });
    return { avant: incident, apres: clos };
  }

  /**
   * Les incidents pour la plateforme, les ouverts d'abord, avec de quoi agir :
   * où en est la course, où est le livreur, comment le joindre.
   */
  static async liste(options: { ouverts: boolean; limite?: number }) {
    const incidents = await db.deliveryIncident.findMany({
      where: options.ouverts ? { closedAt: null } : {},
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(options.limite ?? 100, 1), 200),
      select: {
        id: true,
        type: true,
        phase: true,
        detail: true,
        minutes: true,
        distanceKm: true,
        assignedAt: true,
        closedAt: true,
        closedBy: true,
        resolution: true,
        createdAt: true,
        driver: {
          select: { id: true, name: true, phone: true, isOnline: true, gpsLostAt: true, lastLocationUpdate: true },
        },
        delivery: {
          select: {
            id: true,
            orderId: true,
            status: true,
            driverId: true,
            assignedAt: true,
            pickupTime: true,
            order: {
              select: {
                customerName: true,
                customerPhone: true,
                deliveryCity: true,
                status: true,
                store: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    });

    return incidents.map((i) => {
      const memeAttribution =
        i.delivery.driverId === i.driver.id && i.delivery.assignedAt?.getTime() === i.assignedAt.getTime();
      return {
        id: i.id,
        type: i.type,
        phase: i.phase,
        detail: i.detail,
        minutes: i.minutes,
        distanceKm: i.distanceKm,
        createdAt: i.createdAt,
        closedAt: i.closedAt,
        closedBy: i.closedBy,
        resolution: i.resolution,
        driver: i.driver,
        course: {
          id: i.delivery.id,
          orderId: i.delivery.orderId,
          numero: numeroDe(i.delivery.orderId),
          status: i.delivery.status,
          pickupTime: i.delivery.pickupTime,
          // Ce que la plateforme peut encore faire sur cette course, avec ce
          // livreur : retirer (commande au commerce) ou déclarer l'échec.
          actions: {
            retirer: memeAttribution && i.delivery.status === "ACCEPTED",
            echec: memeAttribution && i.delivery.status === "PICKED_UP",
          },
          boutique: i.delivery.order?.store ?? null,
          client: i.delivery.order
            ? {
                nom: i.delivery.order.customerName,
                telephone: i.delivery.order.customerPhone,
                ville: i.delivery.order.deliveryCity,
              }
            : null,
          commande: i.delivery.order?.status ?? null,
        },
      };
    });
  }

  /** L'équipe du commerce : la cloche, l'écran ouvert, et le téléphone. */
  private static async prevenirBoutique(
    orderId: string,
    commande: { storeId: string; store: { orgId: string } | null },
    type: "DELIVERY_LATE" | "DRIVER_REPLACED" | "DELIVERY_CANCELLED",
    titre: string,
    message: string
  ) {
    if (!commande.store) return;
    const membres = await db.membership.findMany({
      where: { orgId: commande.store.orgId },
      select: { user: { select: { email: true } } },
    });

    for (const membre of membres) {
      const notification = await db.notification.create({
        data: {
          storeId: commande.storeId,
          type,
          title: titre,
          message,
          recipientEmail: membre.user.email,
          relatedOrderId: orderId,
          priority: "HIGH",
        },
      });
      emitNotification(membre.user.email, notification);
    }

    await Notifier.pushEquipeBoutique(commande.storeId, {
      title: titre,
      body: message,
      data: { type: type.toLowerCase(), orderId, storeId: commande.storeId },
    });
  }

  /** Le client : la cloche de son compte, son téléphone, et un courriel avec le suivi. */
  private static async prevenirClient(
    orderId: string,
    email: string | null,
    type: "DELIVERY_LATE" | "DRIVER_REPLACED" | "DELIVERY_CANCELLED",
    titre: string,
    message: string
  ) {
    if (!email) return;

    const notification = await db.notification.create({
      data: {
        type,
        title: titre,
        message,
        recipientEmail: email,
        link: `/client/orders/${orderId}`,
        relatedOrderId: orderId,
      },
    });
    emitNotification(email, notification);

    // Le lien porte son propre jeton de suivi : un client invité n'a pas de
    // compte pour ouvrir /client/orders.
    const lien = await lienDeSuivi(orderId, process.env.SITE_URL || process.env.FRONTEND_URL || "");
    await Promise.all([
      Notifier.email(email, titre, message, lien),
      Notifier.pushClient(email, { title: titre, body: message, data: { tag: type.toLowerCase(), orderId } }),
    ]);
  }
}
