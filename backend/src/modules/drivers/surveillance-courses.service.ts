import { RefundService } from "../payments/refund.service";
import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint, Point } from "../../utils/geo";
import {
  emitDeliveryUpdate,
  emitDriverEvent,
  emitMerchantEvent,
  emitOrderUpdate,
  emitNotification,
  emitSupportEvent,
} from "../realtime/socket";
import { Notifier, enArrierePlan } from "../notifications/notifier.service";
import { lienDeSuivi } from "../orders/suivi-commande.service";
import { prevenirPlateforme } from "../monitoring/vigie.service";
import { DispatchService, MAX_SOLLICITATIONS, STATUTS_EN_COURSE } from "./dispatch.service";
import { GPS_PERDU_APRES_MS } from "./driver-availability.service";
import { presenter } from "../files/fichiers-prives.service";
import { ATTENTE_CLIENT_MS, RAYON_ATTENTE_CLIENT_KM, photoPriseLoinDuClient } from "./delivery-proof.service";
import { DriverApprovalService } from "./driver-approval.service";
import { paymentService } from "../payments/payment.service";
import { emitWebhook } from "../webhooks/webhook.service";
import { MOTIF_LIVRAISON_ECHOUEE } from "../orders/order-acceptance.service";
import { INCIDENTS_POUR_LE_CLIENT, reclamationPourLeClient } from "./retard-livraison";
import { notifierPlateforme } from "../notifications/notification.service";

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
  /**
   * Pendant l'attente du client, le livreur doit rester devant chez lui :
   * au-delà, il est reparti (marge pour le GPS au pied d'un immeuble).
   */
  rayonAttenteClientKm: RAYON_ATTENTE_CLIENT_KM,
  /** Attente lancée, position perdue : marge après les six minutes avant de s'inquiéter. */
  graceAttenteSansPositionMin: 10,
  /** Constat d'une commande dans le sac encore ouvert : la plateforme est relancée à ce rythme. */
  relanceAlerteMin: 15,
};

type TypeIncident =
  | "RETARD_RETRAIT"
  | "ECART_RETRAIT"
  | "RETARD_LIVRAISON"
  | "ECART_LIVRAISON"
  | "COURSE_RETIREE"
  | "COURSE_ECHOUEE"
  // Dépôt en photo fait pendant un incident de livraison : paiement suspendu.
  | "DEPOT_CONTESTE"
  // Le client dit ne pas avoir reçu sa commande : paiement suspendu.
  | "RECLAMATION_CLIENT"
  // La plateforme a tranché un dépôt contesté.
  | "DEPOT_VALIDE"
  | "DEPOT_REFUSE";

/** Constats qui suspendent le paiement de la course et attendent une décision. */
const TYPES_DEPOT_EN_EXAMEN = ["DEPOT_CONTESTE", "RECLAMATION_CLIENT"];

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
    const minutes = minutesDepuis(course.pickupTime ?? course.assignedAt, maintenant);
    const trajet = estUnPoint(commerce) && estUnPoint(client) ? distanceKm(commerce, client) : null;
    const delai = delaiLivraisonMin(trajet, course.autresRemises);

    let ecartKm: number | null = null;
    let detailEcart = "";

    if (course.customerWaitStartedAt) {
      // À la porte, le client ne répond pas : l'attente a sa propre procédure,
      // mais seulement tant que le livreur y est. Lancée devant chez le client
      // (exigerPresenceChezClient), elle ne doit pas couvrir un livreur qui
      // repart ensuite avec la commande.
      const versClient = position && estUnPoint(client) ? distanceKm(position, client) : null;
      if (versClient != null && versClient <= s.rayonAttenteClientKm) {
        return { ecart: false, ecartKm: null, constats };
      }
      if (versClient == null) {
        // Sans position, on lui laisse le temps de l'attente, plus une marge.
        const finGrace =
          course.customerWaitStartedAt.getTime() + ATTENTE_CLIENT_MS + s.graceAttenteSansPositionMin * 60000;
        if (maintenant.getTime() < finGrace) return { ecart: false, ecartKm: null, constats };
      } else {
        ecartKm = Number(versClient.toFixed(2));
        detailEcart = `A quitté l'adresse du client pendant l'attente : à ${km(versClient)} km`;
      }
    } else if (position && trajet != null) {
      const detour = distanceKm(position, commerce as Point) + distanceKm(position, client as Point) - trajet;
      if (detour > s.ecartLivraisonKm) {
        ecartKm = Number(detour.toFixed(2));
        detailEcart = `Hors du trajet vers le client : ${km(ecartKm)} km de détour`;
      }
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
        detail: `${detailEcart} depuis ${ecartMin} min.`,
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

/** Distance entre l'endroit de la photo du dépôt et l'adresse du client. */
function distanceDuDepot(c: {
  proofLat: number | null;
  proofLng: number | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
}) {
  const prise = { latitude: c.proofLat, longitude: c.proofLng };
  const adresse = { latitude: c.deliveryLat, longitude: c.deliveryLng };
  return estUnPoint(prise) && estUnPoint(adresse) ? distanceKm(prise, adresse) : null;
}

export class SurveillanceCoursesService {
  /**
   * Un passage : juge chaque course en cours, avertit, retire ou alerte, puis
   * referme les constats des courses terminées.
   *
   * Rejouable sans effet en double : un constat déjà enregistré pour cette
   * attribution ne renvoie rien, une course déjà retirée ne l'est pas deux fois.
   */
  static async surveiller(maintenant = new Date()) {
    const bilan = { averties: 0, retirees: 0, alertes: 0, closes: 0, relances: 0 };
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
    bilan.relances = await this.relancerAlertes(maintenant);
    return bilan;
  }

  /**
   * Relance la plateforme tant qu'une commande partie avec le livreur reste
   * sans solution.
   *
   * Une alerte unique pouvait se perdre dans une boîte de réception, ou être
   * marquée « traitée » sans que rien ne soit fait : la commande restait dans
   * le sac du livreur. Toutes les SEUILS_COURSE.relanceAlerteMin minutes, tant
   * que le constat est ouvert et la course toujours entre ses mains, l'équipe
   * et le livreur sont relancés. Le client, lui, n'est pas relancé : il a déjà
   * le retard sous les yeux sur son suivi.
   *
   * Une relance par course et par passage, posée sous condition : deux
   * instances de l'API ne relancent pas deux fois.
   */
  static async relancerAlertes(maintenant = new Date()) {
    const limite = new Date(maintenant.getTime() - SEUILS_COURSE.relanceAlerteMin * 60000);
    const dues = {
      closedAt: null,
      phase: "LIVRAISON",
      type: { in: ["RETARD_LIVRAISON", "ECART_LIVRAISON"] },
      OR: [{ lastAlertAt: { lt: limite } }, { lastAlertAt: null, createdAt: { lt: limite } }],
    };

    const ouverts = await db.deliveryIncident.findMany({
      where: dues,
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        deliveryId: true,
        driverId: true,
        assignedAt: true,
        detail: true,
        alertCount: true,
        createdAt: true,
        delivery: {
          select: {
            orderId: true,
            status: true,
            driverId: true,
            assignedAt: true,
            order: { select: { store: { select: { name: true } } } },
          },
        },
        driver: { select: { id: true, name: true, email: true, user: { select: { email: true } } } },
      },
    });

    const vues = new Set<string>();
    let relances = 0;
    for (const incident of ouverts) {
      const course = incident.delivery;
      if (vues.has(incident.deliveryId)) continue;
      vues.add(incident.deliveryId);

      // Livrée, échouée ou passée à un autre : refermerTerminees s'en charge.
      const memeAttribution =
        course.status === "PICKED_UP" &&
        course.driverId === incident.driverId &&
        course.assignedAt?.getTime() === incident.assignedAt.getTime();
      if (!memeAttribution) continue;

      const { count } = await db.deliveryIncident.updateMany({
        where: { ...dues, deliveryId: incident.deliveryId, driverId: incident.driverId, assignedAt: incident.assignedAt },
        data: { lastAlertAt: maintenant, alertCount: { increment: 1 } },
      });
      if (count === 0) continue;
      relances += 1;

      const numero = numeroDe(course.orderId);
      const depuis = minutesDepuis(incident.createdAt, maintenant);
      const rang = incident.alertCount + 1;

      logger.warn("Incident de course toujours ouvert : relance", { deliveryId: incident.deliveryId, rang, depuis });
      emitSupportEvent("incident-livraison", { deliveryId: incident.deliveryId, driverId: incident.driverId, relance: rang });

      enArrierePlan(
        prevenirPlateforme({
          sujet: `🔴 [ZupEat] Toujours sans solution — commande #${numero} (relance ${rang})`,
          texte: `${incident.driver.name} : ${incident.detail}\nCommerce : ${course.order?.store?.name || "?"}.\nOuvert depuis ${depuis} min, la commande est toujours entre les mains du livreur.`,
          chemin: "/superowner/zupeat/incidents-livraison",
          bouton: "Traiter l'incident",
        })
      );

      const message = "Cette commande n'est toujours pas livrée. Livrez-la ou contactez le support sans attendre.";
      emitDriverEvent(incident.driver.user?.email || incident.driver.email, "course-avertissement", {
        deliveryId: incident.deliveryId,
        orderId: course.orderId,
        type: "RELANCE",
        message,
      });
      enArrierePlan(
        Notifier.pushLivreur(incident.driver.id, {
          title: "Commande toujours pas livrée",
          body: message,
          url: `/driver/deliveries/${incident.deliveryId}`,
          tag: "course-avertissement",
        })
      );
    }
    return relances;
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
          // La première alerte part avec le constat : les relances se comptent à partir d'elle.
          lastAlertAt: new Date(),
          alertCount: 1,
          ...(cloture
            ? { closedAt: new Date(), closedBy: auteurDe(cloture.par), resolution: cloture.resolution }
            : {}),
        },
      ],
      skipDuplicates: true,
    });
    if (count > 0) {
      if (!cloture) {
        await notifierPlateforme(
          constat.type === "RECLAMATION_CLIENT" ? "Commande non reçue : réclamation client" : "Nouvel incident de livraison",
          constat.detail,
          "/superowner/zupeat/incidents-livraison"
        );
      }
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

    // Le suivi du client affiche le retard, sans attendre un rechargement
    // (même forme que `retard` dans le suivi, voir retard-livraison.ts).
    emitDeliveryUpdate(course.orderId, { retard: { motif: "LIVRAISON", depuis: new Date() } });

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
      chemin: "/superowner/zupeat/incidents-livraison",
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
    emitDeliveryUpdate(course.orderId, {
      status: "PENDING",
      location: null,
      livreurRemplace: true,
      retard: { motif: "NOUVEAU_LIVREUR", depuis: maintenant },
    });

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
  static async declarerEchec(
    deliveryId: string,
    options: {
      par: { userId: string };
      motif: string;
      /** Rembourser le client dans la foulée (paiement en ligne). */
      rembourser?: boolean;
      /** Suspendre le livreur en attendant que l'équipe examine le cas. */
      suspendre?: boolean;
    }
  ) {
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

      // La commande n'arrivera pas : elle est annulée pour le client, avec un
      // motif qui ne met pas le restaurant en cause. Elle reste due au
      // commerçant (merchant-payout.service.ts). Le motif de la plateforme
      // reste interne : rejectionNote est lue par le client comme une
      // « précision du restaurant ».
      await tx.order.updateMany({
        where: { id: course.orderId, status: { in: ["ACCEPTED", "PREPARING", "READY"] } },
        data: { status: "REJECTED", rejectedAt: maintenant, rejectionReason: MOTIF_LIVRAISON_ECHOUEE, rejectionNote: null },
      });

      if (options.rembourser) await RefundService.enregistrerPourCommande(tx, course.orderId, `Livraison échouée : ${options.motif}`);

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
    emitOrderUpdate(course.orderId, "REJECTED", {
      title: "Livraison échouée",
      message: "Votre commande n'a pas pu être livrée.",
    });
    if (course.order) {
      // Caisse, logiciel de cuisine : ils doivent savoir que la commande est close.
      emitWebhook("order.status_changed", {
        orderId: course.orderId,
        storeId: course.order.storeId,
        previousStatus: course.order.status,
        status: "REJECTED",
      });
      enArrierePlan(
        emitMerchantEvent(course.order.storeId, "commande-traitee", {
          orderId: course.orderId,
          storeId: course.order.storeId,
          status: "REJECTED",
        })
      );
    }

    // La course est close avant tout : un remboursement ou une suspension qui
    // échoue ne la rouvre pas, et se rattrape à part.
    const remboursement = options.rembourser === false ? "NON_DEMANDE" : await this.rembourser(course.orderId, options.motif);
    const suspension = options.suspendre === false ? null : await this.suspendre(driverId, options);

    if (course.order) {
      const numero = numeroDe(course.orderId);
      enArrierePlan(
        this.prevenirBoutique(
          course.orderId,
          course.order,
          "DELIVERY_CANCELLED",
          "Livraison échouée",
          `La livraison de la commande #${numero} a échoué. La plateforme s'occupe du client et vous la paie sur votre prochain relevé, comme une vente.`
        )
      );
      enArrierePlan(
        this.prevenirClient(
          course.orderId,
          course.order.customerEmail,
          "DELIVERY_CANCELLED",
          "Un problème est survenu avec votre livraison",
          remboursement === "REMBOURSEE" || remboursement === "DEJA_REMBOURSEE"
            ? "Votre commande n'a pas pu être livrée. Vous êtes intégralement remboursé : le montant réapparaît sur votre compte sous quelques jours, selon votre banque."
            : "Votre commande n'a pas pu être livrée. Notre équipe revient vers vous pour la suite (remboursement ou nouvelle livraison)."
        )
      );
    }

    return {
      deliveryId,
      driverId,
      orderId: course.orderId,
      remboursement,
      suspendu: Boolean(suspension?.suspendu),
      coursesRetirees: suspension?.coursesRetirees ?? 0,
    };
  }

  /**
   * Rembourse le client d'une livraison échouée.
   *
   * Même chemin que le remboursement de la plateforme : idempotent côté Stripe
   * (une clé par commande), et les versements du commerçant ignorent une
   * commande remboursée. Un échec n'empêche pas de clore la course : il est
   * signalé, et le remboursement se refait depuis la facturation.
   */
  private static async rembourser(
    orderId: string,
    motif: string
  ): Promise<"REMBOURSEE" | "DEJA_REMBOURSEE" | "SANS_PAIEMENT_EN_LIGNE" | "ECHEC"> {
    try {
      const commande = await db.order.findUnique({ where: { id: orderId }, select: { paymentStatus: true } });
      if (commande?.paymentStatus === "REFUNDED") return "DEJA_REMBOURSEE";
      if (commande?.paymentStatus !== "SUCCEEDED") return "SANS_PAIEMENT_EN_LIGNE";

      const remboursement = await paymentService.rembourserCommande(orderId, `Livraison échouée : ${motif}`);
      return remboursement?.status === "succeeded" ? "REMBOURSEE" : "ECHEC";
    } catch (err) {
      logger.error("Livraison échouée : remboursement impossible", {
        orderId,
        error: err instanceof Error ? err.message : err,
      });
      return "ECHEC";
    }
  }

  /**
   * Suspend le livreur d'une course échouée, le temps que l'équipe examine le
   * cas (elle le rétablit depuis sa fiche). Ses courses encore au commerce
   * repartent à d'autres livreurs ; celles qu'il a déjà en main restent à
   * livrer, et restent surveillées.
   */
  private static async suspendre(driverId: string, options: { par: { userId: string }; motif: string }) {
    try {
      const livreur = await db.courier.findUnique({ where: { id: driverId }, select: { status: true } });
      if (!livreur || livreur.status !== "ACTIVE") return { suspendu: false, coursesRetirees: 0 };

      await DriverApprovalService.ecarter(
        driverId,
        "SUSPENDED",
        `Course échouée, en attente d'examen par la plateforme. Motif : ${options.motif}`,
        options.par.userId
      );

      let coursesRetirees = 0;
      const auCommerce = await db.orderDelivery.findMany({
        where: { driverId, status: "ACCEPTED" },
        select: { id: true },
      });
      for (const { id } of auCommerce) {
        try {
          await this.retirerCourse(id, { par: options.par, motif: "Livreur suspendu par la plateforme" });
          coursesRetirees += 1;
        } catch (err) {
          logger.warn("Suspension : course non retirée", { deliveryId: id, error: err instanceof Error ? err.message : err });
        }
      }

      return { suspendu: true, coursesRetirees };
    } catch (err) {
      logger.error("Livraison échouée : suspension du livreur impossible", {
        driverId,
        error: err instanceof Error ? err.message : err,
      });
      return { suspendu: false, coursesRetirees: 0 };
    }
  }

  /**
   * Un dépôt en photo vient de clore la course : s'il s'est fait pendant un
   * incident de livraison (retard, livreur hors trajet), ou si la photo a été
   * prise loin de l'adresse du client (position jointe par le téléphone), le
   * paiement au livreur est suspendu jusqu'à la décision de la plateforme.
   *
   * C'est le garde-fou de dernier recours : un livreur parti avec la commande
   * qui parvient à la « déposer » n'est pas payé sans examen.
   */
  static async apresDepotPhoto(deliveryId: string) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        ...COURSE_EN_COURS,
        proofType: true,
        payoutId: true,
        payoutHold: true,
        proofLat: true,
        proofLng: true,
        proofAccuracy: true,
        proofPositionAt: true,
        proofAt: true,
        deliveryTime: true,
      },
    });
    if (!course || course.status !== "DELIVERED" || course.proofType !== "PHOTO") return false;
    if (!course.driverId || !course.assignedAt || course.payoutId || course.payoutHold) return false;

    // La photo a été prise loin de l'adresse du client.
    const loin = photoPriseLoinDuClient(course);
    const raisons = loin != null ? [`Photo prise à ${km(loin)} km de l'adresse du client.`] : [];

    const incidents = await db.deliveryIncident.findMany({
      where: {
        deliveryId,
        driverId: course.driverId,
        assignedAt: course.assignedAt,
        phase: "LIVRAISON",
        closedAt: null,
        type: { in: ["RETARD_LIVRAISON", "ECART_LIVRAISON"] },
      },
      select: { detail: true },
    });
    if (incidents.length > 0) {
      raisons.push(`Dépôt en photo pendant un incident de livraison : ${incidents.map((i) => i.detail).join(" ")}`);
    }
    if (raisons.length === 0) return false;

    const motif = raisons.join(" ");
    await this.suspendrePaiement(course, "DEPOT_CONTESTE", motif);
    return true;
  }

  /**
   * « Je n'ai pas reçu ma commande » : le client conteste un dépôt en photo.
   * Le paiement au livreur est suspendu (s'il n'est pas déjà sur un relevé)
   * et la plateforme tranche.
   *
   * Une seule réclamation par course : la seconde est refusée.
   */
  static async reclamationClient(orderId: string, message: string | undefined) {
    const course = await db.orderDelivery.findUnique({
      where: { orderId },
      select: {
        ...COURSE_EN_COURS,
        proofType: true,
        deliveryTime: true,
        payoutId: true,
        payoutHold: true,
        incidents: INCIDENTS_POUR_LE_CLIENT,
      },
    });
    if (!course) throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");

    const etat = reclamationPourLeClient(course);
    if (etat.deposee) {
      throw new ApiError(409, "Votre réclamation est déjà enregistrée : notre équipe revient vers vous.", "CLAIM_ALREADY_FILED");
    }
    if (!etat.possible || !course.driverId || !course.assignedAt) {
      throw new ApiError(
        409,
        "Cette commande ne peut plus être contestée ici : contactez le support.",
        "CLAIM_NOT_POSSIBLE"
      );
    }

    const precision = message?.trim().slice(0, 500);
    const motif = `Le client dit ne pas avoir reçu sa commande.${precision ? ` « ${precision} »` : ""}`;
    await this.suspendrePaiement(course, "RECLAMATION_CLIENT", motif);
    return { deposee: true };
  }

  /** Suspend le paiement de la course, trace le constat, prévient la plateforme. */
  private static async suspendrePaiement(
    course: {
      id: string;
      orderId: string;
      driverId: string | null;
      assignedAt: Date | null;
      payoutId: string | null;
      order: { store: { name: string } | null } | null;
      driver: { name: string } | null;
    },
    type: "DEPOT_CONTESTE" | "RECLAMATION_CLIENT",
    motif: string
  ) {
    if (!course.driverId || !course.assignedAt) return;

    // Déjà sur un relevé : le paiement ne se suspend plus, la plateforme
    // tranche quand même (remboursement, suspension du livreur).
    if (!course.payoutId) {
      await db.orderDelivery.updateMany({
        where: { id: course.id, payoutId: null, payoutHold: null },
        data: { payoutHold: "REVIEW", payoutHoldReason: motif },
      });
    }

    const nouveau = await this.enregistrer(
      course.id,
      course.driverId,
      course.assignedAt,
      { type, minutes: 0, distanceKm: null, detail: motif },
      "PICKED_UP"
    );
    if (!nouveau) return;

    const numero = numeroDe(course.orderId);
    enArrierePlan(
      prevenirPlateforme({
        sujet: `🟠 [ZupEat] ${type === "RECLAMATION_CLIENT" ? "Commande non reçue" : "Dépôt à examiner"} — commande #${numero}`,
        texte: `${course.driver?.name || "Le livreur"} : ${motif}\nCommerce : ${course.order?.store?.name || "?"}.\n${
          course.payoutId ? "La course est déjà sur un relevé de versement." : "Le paiement du livreur est suspendu jusqu'à votre décision."
        }`,
        chemin: "/superowner/zupeat/incidents-livraison",
        bouton: "Examiner le dépôt",
      })
    );
  }

  /**
   * La plateforme tranche un dépôt contesté.
   *
   * VALIDER : la course est payée avec le relevé de la semaine en cours.
   * REFUSER : la commande est jugée non livrée — la course n'est jamais payée,
   * la commande est annulée pour le client (motif DELIVERY_FAILED, toujours
   * due au commerçant), le client remboursé et le livreur suspendu, sauf cases
   * décochées.
   */
  static async deciderDepot(
    deliveryId: string,
    options: {
      par: { userId: string };
      decision: "VALIDER" | "REFUSER";
      motif: string;
      rembourser?: boolean;
      suspendre?: boolean;
    }
  ) {
    const course = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      select: { ...COURSE_EN_COURS, payoutId: true, payoutHold: true, driverPayout: true },
    });
    if (!course) throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");

    const enExamen = await db.deliveryIncident.count({
      where: { deliveryId, closedAt: null, type: { in: TYPES_DEPOT_EN_EXAMEN } },
    });
    if (course.status !== "DELIVERED" || !course.driverId || !course.assignedAt || !course.driver || enExamen === 0) {
      throw new ApiError(409, "Aucun dépôt à examiner sur cette course.", "NO_DEPOSIT_UNDER_REVIEW");
    }

    const driverId = course.driverId;
    const maintenant = new Date();
    const auteur = auteurDe(options.par);
    const valide = options.decision === "VALIDER";
    const resolution = valide ? `Dépôt validé : ${options.motif}` : `Dépôt refusé, commande non livrée : ${options.motif}`;

    const tranche = await db.$transaction(async (tx) => {
      // Sous condition : deux décisions simultanées ne s'appliquent pas deux fois.
      const { count } = await tx.deliveryIncident.updateMany({
        where: { deliveryId, closedAt: null },
        data: { closedAt: maintenant, closedBy: auteur, resolution },
      });
      if (count === 0) return false;

      if (course.payoutHold === "REVIEW") {
        await tx.orderDelivery.update({
          where: { id: deliveryId },
          data: valide
            ? { payoutHold: null, payoutHoldReleasedAt: maintenant }
            : { payoutHold: "REFUSED", payoutHoldReason: options.motif },
        });
      }

      if (!valide) {
        await tx.order.updateMany({
          where: { id: course.orderId, status: { in: ["COMPLETED", "READY"] } },
          data: { status: "REJECTED", rejectedAt: maintenant, rejectionReason: MOTIF_LIVRAISON_ECHOUEE, rejectionNote: null },
        });
        // Les compteurs du livreur avaient compté cette course à la remise.
        // Ce ne sont pas des mouvements d'argent : le relevé, lui, ne la
        // prendra jamais (payoutHold REFUSED).
        await tx.courier.update({
          where: { id: driverId },
          data: {
            totalDeliveries: { decrement: 1 },
            totalEarnings: { decrement: Number(course.driverPayout ?? 0) },
          },
        });
      }

      await tx.deliveryIncident.createMany({
        data: [
          {
            deliveryId,
            driverId,
            assignedAt: course.assignedAt!,
            type: valide ? "DEPOT_VALIDE" : "DEPOT_REFUSE",
            phase: "LIVRAISON",
            detail: options.motif,
            closedAt: maintenant,
            closedBy: auteur,
            resolution,
          },
        ],
        skipDuplicates: true,
      });
      return true;
    });

    if (!tranche) throw new ApiError(409, "Ce dépôt vient d'être tranché : rechargez la page.", "DELIVERY_CHANGED");

    logger.warn("Dépôt contesté tranché", { deliveryId, driverId, decision: options.decision, par: auteur });
    emitSupportEvent("incident-livraison", { deliveryId, driverId, type: valide ? "DEPOT_VALIDE" : "DEPOT_REFUSE" });

    if (valide) {
      emitOrderUpdate(course.orderId, course.order?.status || "COMPLETED", {
        title: "Réclamation traitée : dépôt validé",
        message: resolution,
      });
      if (course.order) {
        enArrierePlan(this.prevenirClient(
          course.orderId,
          course.order.customerEmail,
          "SUPPORT_MESSAGE",
          "Réclamation traitée : dépôt validé",
          resolution
        ));
      }
      enArrierePlan(
        Notifier.pushLivreur(driverId, {
          title: "Dépôt validé",
          body: "La plateforme a validé votre dépôt : la course sera payée avec votre prochain relevé.",
          url: "/driver/earnings",
          tag: "depot",
        })
      );
      return { deliveryId, driverId, orderId: course.orderId, decision: options.decision, dejaSurUnReleve: Boolean(course.payoutId) };
    }

    const remboursement = options.rembourser === false ? "NON_DEMANDE" : await this.rembourser(course.orderId, options.motif);
    const suspension = options.suspendre === false ? null : await this.suspendre(driverId, options);

    enArrierePlan(
      Notifier.pushLivreur(driverId, {
        title: "Dépôt refusé",
        body: course.payoutId
          ? `La plateforme a jugé la commande non livrée. La course était déjà sur un relevé : le support va vous contacter. Motif : ${options.motif}`
          : `La plateforme a jugé la commande non livrée : la course ne sera pas payée. Motif : ${options.motif}`,
        url: "/driver",
        tag: "depot",
      })
    );
    emitOrderUpdate(course.orderId, "REJECTED", { title: "Commande non livrée", message: "Votre réclamation est acceptée." });
    if (course.order) {
      emitWebhook("order.status_changed", {
        orderId: course.orderId,
        storeId: course.order.storeId,
        previousStatus: course.order.status,
        status: "REJECTED",
      });
      const numero = numeroDe(course.orderId);
      enArrierePlan(
        this.prevenirBoutique(
          course.orderId,
          course.order,
          "DELIVERY_CANCELLED",
          "Commande non livrée",
          `La commande #${numero} n'est pas arrivée chez le client. La plateforme s'occupe du client et vous la paie comme une vente.`
        )
      );
      enArrierePlan(
        this.prevenirClient(
          course.orderId,
          course.order.customerEmail,
          "DELIVERY_CANCELLED",
          "Votre réclamation est acceptée",
          remboursement === "REMBOURSEE" || remboursement === "DEJA_REMBOURSEE"
            ? `${resolution}. Vous êtes intégralement remboursé : le montant réapparaît sur votre compte sous quelques jours, selon votre banque.`
            : `${resolution}. Notre équipe revient vers vous pour la suite.`
        )
      );
    }

    return {
      deliveryId,
      driverId,
      orderId: course.orderId,
      decision: options.decision,
      dejaSurUnReleve: Boolean(course.payoutId),
      remboursement,
      suspendu: Boolean(suspension?.suspendu),
      coursesRetirees: suspension?.coursesRetirees ?? 0,
    };
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
        type: true,
        driverId: true,
        assignedAt: true,
        delivery: { select: { status: true, driverId: true, assignedAt: true, payoutHold: true } },
      },
      take: 500,
    });

    let closes = 0;
    for (const incident of ouverts) {
      const c = incident.delivery;
      // Livrée mais dépôt en examen : les constats restent sous les yeux de la
      // plateforme jusqu'à sa décision (deciderDepot).
      if (c.status === "DELIVERED" && c.payoutHold === "REVIEW") continue;
      // Un dépôt contesté ne se referme que par une décision, même quand la
      // course était déjà sur un relevé (rien à suspendre, mais un client à
      // rembourser ou un livreur à examiner).
      if (TYPES_DEPOT_EN_EXAMEN.includes(incident.type)) continue;
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
    // Un dépôt contesté se tranche (valider ou refuser) : le marquer « traité »
    // laisserait le paiement suspendu, ou le client sans réponse.
    if (TYPES_DEPOT_EN_EXAMEN.includes(incident.type)) {
      throw new ApiError(409, "Ce dépôt attend votre décision : validez-le ou refusez-le.", "DEPOSIT_DECISION_REQUIRED");
    }

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
        alertCount: true,
        lastAlertAt: true,
        createdAt: true,
        driver: {
          select: { id: true, name: true, phone: true, status: true, isOnline: true, gpsLostAt: true, lastLocationUpdate: true },
        },
        delivery: {
          select: {
            id: true,
            orderId: true,
            status: true,
            driverId: true,
            assignedAt: true,
            pickupTime: true,
            deliveryTime: true,
            proofType: true,
            proofPhoto: true,
            proofNote: true,
            proofLat: true,
            proofLng: true,
            proofAccuracy: true,
            deliveryLat: true,
            deliveryLng: true,
            payoutHold: true,
            payoutHoldReason: true,
            payoutId: true,
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
        // Combien de fois la plateforme a été prévenue, première alerte comprise.
        alertes: i.alertCount,
        derniereAlerte: i.lastAlertAt,
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
            // Dépôt contesté encore ouvert : valider ou refuser.
            depot: memeAttribution && !i.closedAt && i.delivery.status === "DELIVERED" && TYPES_DEPOT_EN_EXAMEN.includes(i.type),
          },
          // Le paiement au livreur : suspendu (REVIEW), refusé (REFUSED), ou normal.
          paiement: { blocage: i.delivery.payoutHold, motif: i.delivery.payoutHoldReason, surUnReleve: Boolean(i.delivery.payoutId) },
          depot:
            i.delivery.proofType === "PHOTO"
              ? {
                  photo: presenter(i.delivery.proofPhoto),
                  note: i.delivery.proofNote,
                  le: i.delivery.deliveryTime,
                  // Où la photo a été prise, par rapport à l'adresse du client :
                  // un indice (la position se falsifie), null si inconnue.
                  distanceAdresseKm: distanceDuDepot(i.delivery),
                  precisionM: i.delivery.proofAccuracy,
                }
              : null,
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
    type: "DELIVERY_LATE" | "DRIVER_REPLACED" | "DELIVERY_CANCELLED" | "SUPPORT_MESSAGE",
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
