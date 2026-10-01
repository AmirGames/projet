import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../../utils/geo";
import { presenter } from "../files/fichiers-prives.service";

/**
 * Le dossier d'un incident de livraison, pour une plainte, un avocat, ou le
 * livreur qui conteste une décision (droit d'accès).
 *
 * Il ne réunit que ce que la base garde déjà : la chronologie de la course, les
 * preuves (code, photo et position de la photo, attente devant chez le
 * client), les échanges avec le support, les décisions de la plateforme et
 * leurs conséquences financières. Rien n'est recalculé après coup : chaque
 * ligne a sa source.
 *
 * Données personnelles : le client n'y figure que par son nom et l'adresse de
 * livraison (pas d'e-mail ni de téléphone). L'export est réservé à une section
 * à part (incidents-export) et journalisé à chaque fois.
 *
 * Limite assumée : l'historique complet des positions du livreur n'est pas
 * conservé, seulement les points clés (dernière position connue, photo du
 * dépôt, départ pendant l'attente, écarts constatés).
 */

/** Une ligne de la chronologie. */
export interface Evenement {
  le: Date;
  quoi: string;
  detail?: string | null;
  source: "COURSE" | "COMMANDE" | "PROPOSITION" | "INCIDENT" | "SUPPORT" | "DECISION" | "PAIEMENT";
}

/** Les échanges de support retenus : ceux de la course, et ceux du livreur pendant la course. */
const MARGE_SUPPORT_MS = 2 * 60 * 60 * 1000;

const km = (n: number | null) => (n == null ? null : Number(n.toFixed(3)));

export class DossierIncidentService {
  static async construire(incidentId: string) {
    const incident = await db.deliveryIncident.findUnique({
      where: { id: incidentId },
      select: { id: true, deliveryId: true, driverId: true, type: true, createdAt: true },
    });
    if (!incident) throw new ApiError(404, "Incident introuvable", "INCIDENT_NOT_FOUND");

    const course = await db.orderDelivery.findUnique({
      where: { id: incident.deliveryId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            acceptedAt: true,
            rejectedAt: true,
            rejectionReason: true,
            customerName: true,
            deliveryAddress: true,
            deliveryCity: true,
            deliveryPostal: true,
            totalAmount: true,
            feesAmount: true,
            tipAmount: true,
            paymentStatus: true,
            merchantPayoutId: true,
            payments: { select: { status: true, amount: true, paidAt: true, refundedAt: true, refundedAmount: true } },
            store: { select: { name: true, address: true, city: true, phone: true } },
          },
        },
        offers: {
          select: { driverId: true, status: true, offeredAt: true, respondedAt: true, attempts: true },
          orderBy: { offeredAt: "asc" },
        },
        incidents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!course) throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");

    // Tous les livreurs qui ont eu la course en main : celui de l'incident
    // d'abord, puis ceux d'avant ou d'après (course retirée, reprise).
    const idsLivreurs = [
      ...new Set([incident.driverId, ...course.incidents.map((i) => i.driverId), ...(course.driverId ? [course.driverId] : [])]),
    ];
    const [livreurs, messages, decisions] = await Promise.all([
      db.courier.findMany({
        where: { id: { in: idsLivreurs } },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          vehicleType: true,
          vehiclePlate: true,
          status: true,
          statusReason: true,
          totalDeliveries: true,
          createdAt: true,
        },
      }),
      this.echangesSupport(incident.driverId, course),
      db.systemAuditLog.findMany({
        where: { target: { in: [course.id, ...course.incidents.map((i) => i.id)] } },
        orderBy: { createdAt: "asc" },
        select: { action: true, changes: true, createdAt: true, adminId: true },
      }),
    ]);

    const auteurs = await db.user.findMany({
      where: { id: { in: [...new Set(decisions.map((d) => d.adminId))] } },
      select: { id: true, name: true, email: true },
    });
    const nomAuteur = (id: string | null | undefined) => {
      if (!id || id === "SYSTEM") return "Système (surveillance automatique)";
      const auteur = auteurs.find((a) => a.id === id);
      return auteur ? `${auteur.name || ""} <${auteur.email}>`.trim() : id;
    };

    const adresse = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    const photo = { latitude: course.proofLat, longitude: course.proofLng };
    const derniere = { latitude: course.driverLat, longitude: course.driverLng };
    const commande = course.order;

    return {
      genereLe: new Date(),
      incident: { id: incident.id, type: incident.type, ouvertLe: incident.createdAt },
      commande: {
        id: commande.id,
        numero: commande.id.slice(-6).toUpperCase(),
        statut: commande.status,
        motifAnnulation: commande.rejectionReason,
        passeeLe: commande.createdAt,
        montantTotal: Number(commande.totalAmount),
        fraisLivraison: Number(commande.feesAmount),
        pourboire: Number(commande.tipAmount ?? 0),
      },
      commerce: commande.store,
      // Le strict nécessaire : qui devait être livré, et où.
      client: {
        nom: commande.customerName,
        adresse: [commande.deliveryAddress, [commande.deliveryPostal, commande.deliveryCity].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      },
      livreurs: livreurs.map((l) => ({ ...l, concerne: l.id === incident.driverId })),
      course: {
        id: course.id,
        statut: course.status,
        attribueeLe: course.assignedAt,
        recupereeLe: course.pickupTime,
        remiseLe: course.deliveryTime,
        annulation: course.cancelledBy ? { par: course.cancelledBy, motif: course.cancellationReason } : null,
        distanceKm: course.distanceKm,
        remunerationPrevue: course.driverPayout != null ? Number(course.driverPayout) : null,
      },
      preuves: {
        type: course.proofType,
        codeAttendu: Boolean(course.deliveryCode),
        essaisDeCodeRates: course.codeAttempts,
        photo: presenter(course.proofPhoto),
        noteDuLivreur: course.proofNote,
        prouveeLe: course.proofAt,
        positionDeLaPhoto: estUnPoint(photo)
          ? {
              latitude: course.proofLat,
              longitude: course.proofLng,
              precisionM: course.proofAccuracy,
              releveeLe: course.proofPositionAt,
              distanceAdresseKm: estUnPoint(adresse) ? km(distanceKm(photo, adresse)) : null,
            }
          : null,
        attenteClient: course.customerWaitStartedAt
          ? { commenceeLe: course.customerWaitStartedAt, quitteeLe: course.customerWaitLeftAt }
          : null,
        derniereGpsConnue: estUnPoint(derniere)
          ? {
              latitude: course.driverLat,
              longitude: course.driverLng,
              le: course.driverLocationAt,
              distanceAdresseKm: estUnPoint(adresse) ? km(distanceKm(derniere, adresse)) : null,
            }
          : null,
        adresseLivraison: estUnPoint(adresse) ? adresse : null,
        commerce: estUnPoint({ latitude: course.pickupLat, longitude: course.pickupLng })
          ? { latitude: course.pickupLat, longitude: course.pickupLng }
          : null,
      },
      constats: course.incidents.map((i) => ({
        type: i.type,
        phase: i.phase,
        livreurId: i.driverId,
        detail: i.detail,
        minutes: i.minutes,
        distanceKm: i.distanceKm,
        alertes: i.alertCount,
        constateLe: i.createdAt,
        closLe: i.closedAt,
        closPar: i.closedAt ? nomAuteur(i.closedBy) : null,
        resolution: i.resolution,
      })),
      echangesSupport: messages.map((m) => ({
        le: m.createdAt,
        de: m.sender === "DRIVER" ? "Livreur" : "Support",
        message: m.body,
        surCetteCourse: m.deliveryId === course.id,
      })),
      decisions: decisions
        .filter((d) => d.action !== "EXPORT_INCIDENT_FILE")
        .map((d) => ({ le: d.createdAt, action: d.action, par: nomAuteur(d.adminId), details: d.changes })),
      // Qui a déjà ouvert ce dossier, et quand.
      exports: decisions
        .filter((d) => d.action === "EXPORT_INCIDENT_FILE")
        .map((d) => ({ le: d.createdAt, par: nomAuteur(d.adminId) })),
      consequences: {
        paiementLivreur: course.payoutHold
          ? { etat: course.payoutHold, motif: course.payoutHoldReason, valideLe: course.payoutHoldReleasedAt }
          : course.payoutId
            ? { etat: "SUR_UN_RELEVE" }
            : { etat: course.status === "DELIVERED" ? "DUE" : "NON_DUE" },
        paiementClient: {
          statut: commande.paymentStatus,
          paiements: commande.payments.map((p) => ({
            ...p,
            amount: Number(p.amount),
            refundedAmount: p.refundedAmount != null ? Number(p.refundedAmount) : null,
          })),
        },
        commerce: { surUnReleve: Boolean(commande.merchantPayoutId) },
      },
      chronologie: this.chronologie(course, messages, decisions, nomAuteur),
      limites: [
        "L'historique complet des positions du livreur n'est pas conservé : seuls les points clés figurent ici.",
        "Une position transmise par un téléphone peut être falsifiée : c'est un indice, pas une preuve.",
      ],
    };
  }

  /** Les messages du livreur liés à la course, ou écrits pendant qu'il l'avait en main. */
  private static echangesSupport(
    driverId: string,
    course: { id: string; assignedAt: Date | null; createdAt: Date; deliveryTime: Date | null; updatedAt: Date }
  ) {
    const debut = course.assignedAt ?? course.createdAt;
    const fin = new Date((course.deliveryTime ?? course.updatedAt).getTime() + MARGE_SUPPORT_MS);
    return db.courierSupportMessage.findMany({
      where: {
        driverId,
        OR: [{ deliveryId: course.id }, { createdAt: { gte: debut, lte: fin } }],
      },
      orderBy: { createdAt: "asc" },
      select: { sender: true, body: true, deliveryId: true, createdAt: true },
    });
  }

  /** Tout, dans l'ordre où c'est arrivé. */
  private static chronologie(
    course: {
      assignedAt: Date | null;
      pickupTime: Date | null;
      deliveryTime: Date | null;
      customerWaitStartedAt: Date | null;
      customerWaitLeftAt: Date | null;
      proofAt: Date | null;
      proofType: string | null;
      proofPositionAt: Date | null;
      order: { createdAt: Date; acceptedAt: Date | null; rejectedAt: Date | null; rejectionReason: string | null; payments: { paidAt: Date | null; refundedAt: Date | null }[] };
      offers: { driverId: string; status: string; offeredAt: Date; respondedAt: Date | null }[];
      incidents: { type: string; detail: string; createdAt: Date; closedAt: Date | null; resolution: string | null; driverId: string }[];
    },
    messages: { sender: string; body: string; createdAt: Date }[],
    decisions: { action: string; createdAt: Date; adminId: string }[],
    nomAuteur: (id: string) => string
  ): Evenement[] {
    const e: Evenement[] = [];
    const ajouter = (le: Date | null | undefined, quoi: string, source: Evenement["source"], detail?: string | null) => {
      if (le) e.push({ le, quoi, source, detail });
    };

    ajouter(course.order.createdAt, "Commande passée", "COMMANDE");
    ajouter(course.order.acceptedAt, "Commande acceptée par le commerce", "COMMANDE");
    for (const p of course.order.payments) {
      ajouter(p.paidAt, "Paiement encaissé", "PAIEMENT");
      ajouter(p.refundedAt, "Client remboursé", "PAIEMENT");
    }
    for (const o of course.offers) {
      ajouter(o.offeredAt, "Course proposée à un livreur", "PROPOSITION", `Livreur ${o.driverId}`);
      if (o.respondedAt) ajouter(o.respondedAt, `Réponse du livreur : ${o.status}`, "PROPOSITION", `Livreur ${o.driverId}`);
    }
    ajouter(course.assignedAt, "Course attribuée (attribution actuelle)", "COURSE");
    ajouter(course.pickupTime, "Commande récupérée au commerce", "COURSE");
    ajouter(course.customerWaitStartedAt, "Attente du client lancée devant chez lui", "COURSE");
    ajouter(course.customerWaitLeftAt, "Le livreur a quitté l'adresse pendant l'attente", "COURSE");
    ajouter(course.proofPositionAt, "Position du téléphone relevée pour la photo du dépôt", "COURSE");
    ajouter(course.proofAt, `Remise prouvée (${course.proofType === "PHOTO" ? "photo du dépôt" : "code du client"})`, "COURSE");
    ajouter(course.deliveryTime, "Course déclarée livrée", "COURSE");
    ajouter(course.order.rejectedAt, "Commande annulée", "COMMANDE", course.order.rejectionReason);
    for (const i of course.incidents) {
      ajouter(i.createdAt, `Constat : ${i.type}`, "INCIDENT", `${i.detail} (livreur ${i.driverId})`);
      ajouter(i.closedAt, `Constat clos : ${i.type}`, "INCIDENT", i.resolution);
    }
    for (const m of messages) {
      ajouter(m.createdAt, m.sender === "DRIVER" ? "Message du livreur au support" : "Message du support au livreur", "SUPPORT", m.body);
    }
    for (const d of decisions) {
      // Un export n'est pas une décision : c'est une consultation, tracée comme telle.
      ajouter(
        d.createdAt,
        d.action === "EXPORT_INCIDENT_FILE" ? "Dossier exporté" : `Décision de la plateforme : ${d.action}`,
        "DECISION",
        nomAuteur(d.adminId)
      );
    }

    return e.sort((a, b) => a.le.getTime() - b.le.getTime());
  }
}
