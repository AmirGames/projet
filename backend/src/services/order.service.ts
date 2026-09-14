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
  totalAmount: number;
  taxAmount?: number;
  feesAmount?: number;
  customerId?: string;
  notes?: string;
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
          totalAmount: data.totalAmount,
          taxAmount: data.taxAmount || 0,
          feesAmount: data.feesAmount || 0,
          customerId,
          notes: data.notes,
          status: "PENDING" as any,
          paymentStatus: "PENDING" as any,
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

    let availableStock = product.stock;
    if (variantId) {
      const variant = await db.productVariant.findUnique({ where: { id: variantId } });
      if (variant) availableStock = variant.stock;
    }

    if (availableStock < quantity) {
      throw new ApiError(
        400,
        `Pas assez de stock. Disponible: ${availableStock}`,
        "INSUFFICIENT_STOCK"
      );
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

    if (variantId) {
      await db.productVariant.update({
        where: { id: variantId },
        data: { stock: { decrement: quantity } },
      });
    } else {
      await db.product.update({
        where: { id: productId },
        data: { stock: { decrement: quantity } },
      });
    }

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
