import { fraisDusALaPlateforme } from "./delivery-mode.service";
import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";
import { emitWebhook } from "./webhook.service";
import { OrderAcceptanceService, echeanceDeReponse, verifierTransition } from "./order-acceptance.service";

export interface OrderFilterOptions {
  skip?: number;
  take?: number;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export class OrderManagementService {
  static async getOrders(storeId: string, options?: OrderFilterOptions) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      
      if (options?.status) {
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
            payments: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        db.order.count({ where: whereClause }),
      ]);

      return {
        // L'heure limite de réponse, pour le compte à rebours à l'écran.
        data: orders.map((commande) =>
          commande.status === "PENDING"
            ? { ...commande, echeance: echeanceDeReponse(commande) }
            : commande
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
              product: { include: { category: { select: { name: true } } } },
              variant: true,
            },
          },
          customer: true,
          payments: true,
          store: true,
        },
      });

      if (!order || order.storeId !== storeId) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      return order.status === "PENDING" ? { ...order, echeance: echeanceDeReponse(order) } : order;
    } catch (error) {
      throw error;
    }
  }

  static async updateOrderStatus(storeId: string, orderId: string, status: string) {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
      });

      if (!order || order.storeId !== storeId) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      const validStatuses = ["PENDING", "ACCEPTED", "PREPARING", "REJECTED", "READY", "COMPLETED"];
      if (!validStatuses.includes(status)) {
        throw new ApiError(400, "Invalid order status", "INVALID_STATUS");
      }

      verifierTransition(order.status, status);

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

      const updated = await db.order.update({
        where: { id: orderId },
        data: { status: status as any },
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

      if (!order || order.storeId !== storeId) {
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
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          feesAmount: true,
          deliveryMode: true,
          createdAt: true,
          paymentStatus: true,
        },
      });

      // Les frais d'une course faite par un livreur de la plateforme ne sont
      // pas au commerçant : il les encaisse pour elle, qui les lui réclame
      // avec la commission. Son chiffre d'affaires ne les compte plus.
      const pourLaPlateforme = (o: (typeof orders)[number]) => fraisDusALaPlateforme(o);
      const fraisPlateforme = orders.reduce((sum, o) => sum + pourLaPlateforme(o), 0);

      const stats = {
        totalOrders: orders.length,
        totalRevenue:
          orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0) - fraisPlateforme,
        platformDeliveryFees: Number(fraisPlateforme.toFixed(2)),
        averageOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0) / orders.length : 0,
        pending: orders.filter(o => o.status === "PENDING").length,
        accepted: orders.filter(o => o.status === "ACCEPTED").length,
        preparing: orders.filter(o => o.status === "PREPARING").length,
        ready: orders.filter(o => o.status === "READY").length,
        completed: orders.filter(o => o.status === "COMPLETED").length,
        rejected: orders.filter(o => o.status === "REJECTED").length,
        paidOrders: orders.filter(o => o.paymentStatus === "SUCCEEDED").length,
        unpaidOrders: orders.filter(o => o.paymentStatus !== "SUCCEEDED").length,
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
