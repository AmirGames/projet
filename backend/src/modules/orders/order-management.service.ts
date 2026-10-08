import type { OrderStatus, Prisma } from "@prisma/client";
import { encaissePourLaPlateforme, fraisDeServiceDus, totalCommercant } from "../delivery/delivery-mode.service";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";
import { emitWebhook } from "../webhooks/webhook.service";
import {
  OrderAcceptanceService,
  MOTIF_LIVRAISON_ECHOUEE,
  echeanceDeReponse,
  verifierTransition,
} from "./order-acceptance.service";
import { TRANSMISE } from "../../utils/commande-transmise";
import { derniersJoursBruxelles, jourBruxelles } from "../../utils/semaine-bruxelles";

/**
 * Ce que le commerçant lit d'un paiement. Le `stripeClientSecret` n'y figure
 * pas : c'est une capacité de paiement réservée au client, et l'extension de
 * chiffrement le rend en clair à la lecture.
 */
const PAIEMENT_COMMERCANT = {
  id: true,
  orderId: true,
  amount: true,
  currency: true,
  status: true,
  stripePaymentIntentId: true,
  stripeStatus: true,
  paidAt: true,
  refundedAt: true,
  refundedAmount: true,
  stripeRefundId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface OrderFilterOptions {
  skip?: number;
  take?: number;
  /** Un statut, ou plusieurs (les commandes en cours, pour l'écran de cuisine). */
  status?: OrderStatus | OrderStatus[];
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Les ventes des derniers jours, jour par jour (heure de Bruxelles), pour le
 * graphique du tableau de bord. Une commande refusée n'est pas une vente :
 * elle n'y compte pas, ni en nombre ni en montant.
 */
/**
 * Une course réservée par un livreur qui termine sa livraison (voir
 * DispatchService.reserver) n'a pas encore de livreur, mais n'est plus en
 * recherche. Le commerçant ne reçoit que cette information : pas l'identité du
 * livreur, qui n'est attribuée qu'au démarrage.
 */
export function avecReservation<T extends { delivery?: { reservedDriverId?: string | null } | null }>(commande: T) {
  if (!commande.delivery) return commande;
  const { reservedDriverId, ...livraison } = commande.delivery;
  return { ...commande, delivery: { ...livraison, reservee: Boolean(reservedDriverId) } };
}

function ventesParJour(
  commandes: { status: string; createdAt: Date; totalAmount: unknown; feesAmount?: unknown; serviceFeeAmount?: unknown }[],
  nombre: number
) {
  const vendues = commandes.filter((c) => c.status !== "REJECTED");
  return derniersJoursBruxelles(nombre).map((jour) => {
    const duJour = vendues.filter((c) => jourBruxelles(c.createdAt) === jour);
    return { jour, commandes: duJour.length, chiffreAffaires: totalCommercant(duJour) };
  });
}

export class OrderManagementService {
  static async getOrders(storeId: string, options?: OrderFilterOptions) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: Prisma.OrderWhereInput = { storeId, ...TRANSMISE };
      
      if (Array.isArray(options?.status)) {
        whereClause.status = { in: options.status };
      } else if (options?.status) {
        whereClause.status = options.status;
      }

      if (options?.startDate || options?.endDate) {
        whereClause.createdAt = {};
        if (options.startDate) {
          whereClause.createdAt.gte = options.startDate;
        }
        if (options.endDate) {
          whereClause.createdAt.lte = options.endDate;
        }
      }

      if (options?.minAmount !== undefined || options?.maxAmount !== undefined) {
        whereClause.totalAmount = {};
        if (options.minAmount !== undefined) {
          whereClause.totalAmount.gte = options.minAmount;
        }
        if (options.maxAmount !== undefined) {
          whereClause.totalAmount.lte = options.maxAmount;
        }
      }

      const [orders, total] = await Promise.all([
        db.order.findMany({
          where: whereClause,
          skip,
          take,
          include: {
            items: {
              include: {
                /**
                 * La catégorie et la déclinaison viennent avec le plat.
                 *
                 * Sans elles, le ticket n'affichait que « 4 fromages » : la
                 * cuisine ne savait pas s'il s'agissait des pâtes ou de la
                 * pizza, ni quelle déclinaison préparer.
                 */
                product: {
                  select: {
                    name: true,
                    sku: true,
                    variantLabel: true,
                    category: { select: { name: true } },
                  },
                },
                variant: { select: { id: true, label: true, sku: true } },
              },
            },
            customer: {
              select: { name: true, email: true },
            },
            payments: { select: PAIEMENT_COMMERCANT },
            // La recherche du livreur part dès « En préparation » : la liste
            // dit où elle en est.
            delivery: {
              select: {
                status: true,
                driverId: true,
                reservedDriverId: true,
                driver: { select: { name: true, phone: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        db.order.count({ where: whereClause }),
      ]);

      return {
        // L'heure limite de réponse, pour le compte à rebours à l'écran.
        data: orders.map((commande) =>
          commande.status === "PENDING"
            ? { ...avecReservation(commande), echeance: echeanceDeReponse(commande) }
            : avecReservation(commande)
        ),
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getOrder(storeId: string, orderId: string) {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              // La catégorie distingue « 4 fromages » pâtes de « 4 fromages »
              // pizza, sur le ticket comme sur le détail.
              product: { include: { category: { select: { name: true, displayOrder: true } } } },
              variant: true,
            },
          },
          customer: true,
          payments: { select: PAIEMENT_COMMERCANT },
          store: true,
          // Le commerçant suit le livreur : arrivée, récupération, livraison.
          delivery: {
            select: {
              status: true,
              assignedAt: true,
              pickupTime: true,
              deliveryTime: true,
              estimatedTime: true,
              reservedDriverId: true,
              driver: { select: { name: true, phone: true, vehicleType: true } },
            },
          },
        },
      });

      if (!order || order.storeId !== storeId || !order.submittedAt) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      return order.status === "PENDING"
        ? { ...avecReservation(order), echeance: echeanceDeReponse(order) }
        : avecReservation(order);
    } catch (error) {
      throw error;
    }
  }

  static async updateOrderStatus(storeId: string, orderId: string, status: OrderStatus) {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
      });

      if (!order || order.storeId !== storeId || !order.submittedAt) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      const validStatuses = ["PENDING", "ACCEPTED", "PREPARING", "REJECTED", "READY", "COMPLETED"];
      if (!validStatuses.includes(status)) {
        throw new ApiError(400, "Invalid order status", "INVALID_STATUS");
      }

      verifierTransition(order.status, status, order);

      // Vérification supplémentaire : si paiement en liquide (CASH), doit être PICKUP uniquement
      // Ceci ne devrait jamais arriver car la validation est faite à la création,
      // mais c'est une couche supplémentaire de sécurité
      if (order.paymentMethodName === "CASH" && order.deliveryType === "DELIVERY" && status === "COMPLETED") {
        throw new ApiError(
          400,
          "Impossible de compléter une commande avec paiement en liquide en livraison",
          "CASH_DELIVERY_COMPLETION_NOT_ALLOWED"
        );
      }

      // Écriture conditionnelle : si l'état a changé entre la lecture et ici,
      // la décision de verifierTransition n'est plus valable.
      const ecrit = await db.order.updateMany({
        where: { id: orderId, storeId, status: order.status },
        data: { status },
      });
      if (ecrit.count !== 1) {
        throw new ApiError(409, "La commande a changé entre-temps, rechargez-la.", "ORDER_STATE_CONFLICT");
      }
      const updated = await db.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
          customer: { select: { name: true, email: true } },
        },
      });

      // Le commerçant a son propre chemin pour changer l'état d'une commande :
      // l'événement doit partir des deux, sinon il dépendrait de l'écran utilisé.
      emitWebhook("order.status_changed", {
        orderId: updated.id,
        storeId: updated.storeId,
        previousStatus: order.status,
        status: updated.status,
        totalAmount: Number(updated.totalAmount),
      });

      // Le client est prévenu à chaque étape ; par e-mail seulement quand il a
      // quelque chose à faire — venir chercher sa commande.
      await OrderAcceptanceService.prevenirLeClient(
        updated,
        this.getTitleForStatus(status),
        this.getMessageForStatus(status, updated.deliveryType),
        { email: status === "READY" && updated.deliveryType === "PICKUP" }
      );

      // En préparation : le livreur le plus proche est appelé tout de suite,
      // pour arriver quand la commande sort de la cuisine.
      await OrderAcceptanceService.surAvancement(updated);

      return updated;
    } catch (error) {
      throw error;
    }
  }

  private static getTitleForStatus(status: string): string {
    const titles: Record<string, string> = {
      ACCEPTED: "Commande acceptée",
      PREPARING: "En préparation",
      READY: "Commande prête",
      COMPLETED: "Commande complétée",
      REJECTED: "Commande refusée",
    };
    return titles[status] || "Mise à jour de commande";
  }

  private static getMessageForStatus(status: string, deliveryType?: string): string {
    const messages: Record<string, string> = {
      ACCEPTED: "Votre commande a été acceptée. Elle est en cours de préparation.",
      PREPARING: "Votre commande est en cours de préparation à la cuisine.",
      READY:
        deliveryType === "PICKUP"
          ? "Votre commande est prête ! Vous pouvez venir la retirer."
          : "Votre commande est prête ! Elle attend son livreur.",
      COMPLETED: "Votre commande est complétée. Merci pour votre achat !",
      REJECTED: "Malheureusement, votre commande a été refusée. Veuillez nous contacter.",
    };
    return messages[status] || "Votre commande a été mise à jour.";
  }

  static async addOrderNote(storeId: string, orderId: string, notes: string) {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
      });

      if (!order || order.storeId !== storeId || !order.submittedAt) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      const updated = await db.order.update({
        where: { id: orderId },
        data: { notes },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
          customer: { select: { name: true, email: true } },
        },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async getOrderStats(storeId: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const orders = await db.order.findMany({
        where: {
          storeId,
          createdAt: { gte: startDate },
          ...TRANSMISE,
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          feesAmount: true,
          serviceFeeAmount: true,
          deliveryMode: true,
          createdAt: true,
          paymentStatus: true,
          rejectionReason: true,
        },
      });

      // Les frais d'une course faite par un livreur de la plateforme, et les
      // frais de service, ne sont pas au commerçant : il les encaisse pour
      // elle, qui les lui réclame avec la commission. Son chiffre d'affaires
      // ne compte que ses articles, remise déduite.
      const chiffreAffaires = totalCommercant(orders);
      const fraisPlateforme = orders.reduce((sum, o) => sum + encaissePourLaPlateforme(o), 0);
      const fraisService = orders.reduce((sum, o) => sum + fraisDeServiceDus(o), 0);

      const stats = {
        totalOrders: orders.length,
        totalRevenue: chiffreAffaires,
        platformDeliveryFees: Number((fraisPlateforme - fraisService).toFixed(2)),
        platformServiceFees: Number(fraisService.toFixed(2)),
        averageOrderValue: orders.length > 0 ? chiffreAffaires / orders.length : 0,
        pending: orders.filter(o => o.status === "PENDING").length,
        accepted: orders.filter(o => o.status === "ACCEPTED").length,
        preparing: orders.filter(o => o.status === "PREPARING").length,
        ready: orders.filter(o => o.status === "READY").length,
        completed: orders.filter(o => o.status === "COMPLETED").length,
        // Refusées par le commerce : une commande perdue en livraison par un
        // livreur de la plateforme n'est pas de son fait.
        rejected: orders.filter(o => o.status === "REJECTED" && o.rejectionReason !== MOTIF_LIVRAISON_ECHOUEE).length,
        deliveryFailed: orders.filter(o => o.rejectionReason === MOTIF_LIVRAISON_ECHOUEE).length,
        paidOrders: orders.filter(o => o.paymentStatus === "SUCCEEDED").length,
        unpaidOrders: orders.filter(o => o.paymentStatus !== "SUCCEEDED").length,
        parJour: ventesParJour(orders, Math.min(days, 7)),
      };

      return stats;
    } catch (error) {
      throw error;
    }
  }

  static async getTodayOrders(storeId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const orders = await db.order.findMany({
        where: {
          storeId,
          ...TRANSMISE,
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          items: {
            include: {
              product: { select: { name: true } },
            },
          },
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return orders;
    } catch (error) {
      throw error;
    }
  }
}
