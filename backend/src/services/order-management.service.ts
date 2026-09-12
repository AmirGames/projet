import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

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
                product: {
                  select: { name: true, sku: true },
                },
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
        data: orders,
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
              product: true,
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

      return order;
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

      const validStatuses = ["PENDING", "ACCEPTED", "REJECTED", "READY", "COMPLETED"];
      if (!validStatuses.includes(status)) {
        throw new ApiError(400, "Invalid order status", "INVALID_STATUS");
      }

      const updated = await db.order.update({
        where: { id: orderId },
        data: { status },
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
          createdAt: true,
          paymentStatus: true,
        },
      });

      const stats = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0),
        averageOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0) / orders.length : 0,
        pending: orders.filter(o => o.status === "PENDING").length,
        accepted: orders.filter(o => o.status === "ACCEPTED").length,
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
