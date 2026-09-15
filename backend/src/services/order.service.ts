import { db } from "./db";
import { EmailService } from "./email.service";
import { logger } from "../config/logger";
import { ApiError } from "../middleware/errorHandler";

export interface OrderData {
  storeId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryType: "PICKUP" | "DELIVERY";
  pickupTime?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  deliveryPostal?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  totalAmount: number;
  taxAmount?: number;
  feesAmount?: number;
  customerId?: string;
  notes?: string;
  items?: {
    productId: string;
    variantId?: string;
    quantity: number;
    price: number;
    selectedOptions?: Record<string, string>;
  }[];
}

export class OrderService {
  /**
   * Rattache la commande à une fiche client, créée au besoin.
   *
   * Les clients sont globaux et identifiés par leur e-mail : une commande
   * passée sans compte doit tout de même alimenter la clientèle du commerçant,
   * sans quoi son carnet d'adresses reste vide.
   */
  private static async resoudreClient(data: OrderData) {
    if (data.customerId) return data.customerId;
    if (!data.customerEmail) return undefined;

    const existant = await db.customer.findUnique({
      where: { email: data.customerEmail },
      select: { id: true },
    });

    if (existant) return existant.id;

    const cree = await db.customer.create({
      data: {
        name: data.customerName,
        email: data.customerEmail,
        phone: data.customerPhone,
        address: data.deliveryAddress,
        city: data.deliveryCity,
        postalCode: data.deliveryPostal,
      },
      select: { id: true },
    });

    return cree.id;
  }

  static async create(data: OrderData) {
    try {
      const customerId = await this.resoudreClient(data);

      // On refuse la commande entière si un article n'est plus disponible :
      // mieux vaut un message clair qu'une commande amputée en silence.
      const lignes = data.items || [];

      if (lignes.length > 0) {
        const produits = await db.product.findMany({
          where: { id: { in: lignes.map((l) => l.productId) } },
          select: { id: true, name: true, storeId: true, isAvailable: true, deletedAt: true },
        });

        for (const ligne of lignes) {
          const produit = produits.find((p) => p.id === ligne.productId);

          if (!produit || produit.deletedAt || produit.storeId !== data.storeId) {
            throw new ApiError(400, "Un article du panier n'existe plus", "PRODUCT_NOT_FOUND");
          }

          if (!produit.isAvailable) {
            throw new ApiError(
              400,
              `« ${produit.name} » n'est plus disponible`,
              "PRODUCT_UNAVAILABLE"
            );
          }
        }
      }

      const order = await db.order.create({
        data: {
          storeId: data.storeId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          deliveryType: data.deliveryType as any,
          pickupTime: data.pickupTime ? new Date(data.pickupTime) : null,
          deliveryAddress: data.deliveryAddress,
          deliveryCity: data.deliveryCity,
          deliveryPostal: data.deliveryPostal,
          deliveryLat: data.deliveryLat,
          deliveryLng: data.deliveryLng,
          totalAmount: data.totalAmount,
          taxAmount: data.taxAmount || 0,
          feesAmount: data.feesAmount || 0,
          customerId,
          notes: data.notes,
          status: "PENDING" as any,
          paymentStatus: "PENDING" as any,
          items: {
            create: lignes.map((ligne) => ({
              productId: ligne.productId,
              variantId: ligne.variantId,
              quantity: ligne.quantity,
              price: ligne.price,
              total: Number((ligne.price * ligne.quantity).toFixed(2)),
              selectedOptions: ligne.selectedOptions || {},
            })),
          },
        },
        include: {
          items: {
            include: { product: true, variant: true },
          },
        },
      });

      try {
        await EmailService.sendOrderConfirmation(order);
      } catch (emailErr) {
        logger.warn("Email notification failed, but order was created", { error: emailErr });
      }

      return order;
    } catch (error: any) {
      throw error;
    }
  }

  static async getById(id: string) {
    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true, variant: true },
        },
        payments: true,
      },
    });

    if (!order) {
      throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
    }

    return order;
  }

  static async getByStoreId(storeId: string, limit: number = 100, offset: number = 0) {
    return await db.order.findMany({
      where: { storeId },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async getByStatus(storeId: string, status: string, limit: number = 50) {
    return await db.order.findMany({
      where: { storeId, status: status as any },
      include: {
        items: { include: { product: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  static async updateStatus(id: string, status: string) {
    try {
      return await db.order.update({
        where: { id },
        data: { status: status as any },
        include: {
          items: true,
        },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }
      throw error;
    }
  }

  static async addOrderItem(
    orderId: string,
    productId: string,
    quantity: number,
    price: number,
    variantId?: string,
    selectedOptions?: Record<string, string>
  ) {
    const product = await db.product.findUnique({ where: { id: productId } });
    if (!product) throw new ApiError(404, "Product not found", "PRODUCT_NOT_FOUND");

    // Le suivi chiffré du stock est remplacé par une simple disponibilité que
    // le commerçant bascule lui-même : un restaurant ne compte pas ses plats,
    // il indique ce qui est épuisé.
    if (!product.isAvailable) {
      throw new ApiError(400, `« ${product.name} » n'est plus disponible`, "PRODUCT_UNAVAILABLE");
    }

    if (variantId) {
      const variant = await db.productVariant.findUnique({ where: { id: variantId } });

      // Une variante n'a pas de libellé propre : on nomme le produit parent.
      if (variant && !variant.isAvailable) {
        throw new ApiError(
          400,
          `Cette déclinaison de « ${product.name} » n'est plus disponible`,
          "VARIANT_UNAVAILABLE"
        );
      }
    }

    const total = price * quantity;

    const orderItem = await db.orderItem.create({
      data: {
        orderId,
        productId,
        variantId,
        quantity,
        price,
        total,
        selectedOptions: selectedOptions || {},
      },
      include: { product: true },
    });

    return orderItem;
  }

  static async countByStoreId(storeId: string) {
    return await db.order.count({ where: { storeId } });
  }

  static async getRecentOrders(storeId: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return await db.order.findMany({
      where: {
        storeId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async getOrderWithItems(id: string) {
    return await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: true, variant: true },
        },
        payments: true,
      },
    });
  }

  static async delete(id: string) {
    try {
      return await db.order.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }
      throw error;
    }
  }

  static async getByOrgId(orgId: string, status?: string, limit: number = 100, offset: number = 0) {
    const whereClause: any = {
      store: { orgId },
    };

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    return await db.order.findMany({
      where: whereClause,
      include: {
        items: {
          include: { product: true },
        },
        store: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  static async countByOrgId(orgId: string, status?: string) {
    const whereClause: any = {
      store: { orgId },
    };

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    return await db.order.count({ where: whereClause });
  }
}
