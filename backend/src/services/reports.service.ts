import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface ReportFilters {
  storeId?: string;
  orgId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  paymentStatus?: string;
}

export class ReportsService {
  static async getSalesReport(filters: ReportFilters) {
    try {
      const where: any = {};

      if (filters.storeId) {
        where.storeId = filters.storeId;
      } else if (filters.orgId) {
        where.store = { orgId: filters.orgId };
      }

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
        }
      }

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.paymentStatus) {
        where.paymentStatus = filters.paymentStatus;
      }

      const orders = await db.order.findMany({
        where,
        include: {
          items: true,
          payments: true,
        },
        orderBy: { createdAt: "desc" },
      });

      const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
      const totalTax = orders.reduce((sum, o) => sum + Number(o.taxAmount || 0), 0);
      const totalFees = orders.reduce((sum, o) => sum + Number(o.feesAmount || 0), 0);
      const averageOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

      const statusBreakdown: { [key: string]: number } = {};
      orders.forEach((order) => {
        statusBreakdown[order.status] = (statusBreakdown[order.status] || 0) + 1;
      });

      const paymentBreakdown: { [key: string]: number } = {};
      orders.forEach((order) => {
        paymentBreakdown[order.paymentStatus] = (paymentBreakdown[order.paymentStatus] || 0) + 1;
      });

      return {
        totalOrders: orders.length,
        totalRevenue,
        totalTax,
        totalFees,
        averageOrderValue,
        statusBreakdown,
        paymentBreakdown,
        orders,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getRevenueByDate(filters: ReportFilters) {
    try {
      const where: any = {};

      if (filters.storeId) {
        where.storeId = filters.storeId;
      } else if (filters.orgId) {
        where.store = { orgId: filters.orgId };
      }

      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
        }
      }

      const orders = await db.order.findMany({
        where,
        select: {
          createdAt: true,
          totalAmount: true,
          taxAmount: true,
          feesAmount: true,
        },
      });

      const revenueByDate: { [key: string]: { revenue: number; tax: number; fees: number; count: number } } = {};

      orders.forEach((order) => {
        const date = new Date(order.createdAt).toISOString().split("T")[0];
        if (!revenueByDate[date]) {
          revenueByDate[date] = { revenue: 0, tax: 0, fees: 0, count: 0 };
        }
        revenueByDate[date].revenue += Number(order.totalAmount || 0);
        revenueByDate[date].tax += Number(order.taxAmount || 0);
        revenueByDate[date].fees += Number(order.feesAmount || 0);
        revenueByDate[date].count += 1;
      });

      const data = Object.entries(revenueByDate).map(([date, stats]) => ({
        date,
        ...stats,
      }));

      return data.sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      throw error;
    }
  }

  static async getProductPerformance(storeId: string) {
    try {
      const products = await db.product.findMany({
        where: { storeId },
        include: {
          orderItems: {
            select: {
              quantity: true,
              price: true,
              total: true,
            },
          },
        },
      });

      const performance = products.map((product) => {
        const totalQuantity = product.orderItems.reduce((sum, item) => sum + item.quantity, 0);
        const totalRevenue = product.orderItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
        const avgPrice = product.orderItems.length > 0 ? totalRevenue / totalQuantity || 0 : 0;

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          totalSold: totalQuantity,
          totalRevenue,
          avgPrice,
          status: product.status,
        };
      });

      return performance.sort((a, b) => b.totalSold - a.totalSold);
    } catch (error) {
      throw error;
    }
  }

  static async getCustomerAnalytics(storeId: string) {
    try {
      const orders = await db.order.findMany({
        where: { storeId },
        select: {
          customerEmail: true,
          customerName: true,
          totalAmount: true,
          createdAt: true,
        },
      });

      const customerMap: {
        [key: string]: {
          name: string;
          totalSpent: number;
          orderCount: number;
          lastOrder: Date;
        };
      } = {};

      orders.forEach((order) => {
        const email = order.customerEmail.toLowerCase();
        if (!customerMap[email]) {
          customerMap[email] = {
            name: order.customerName,
            totalSpent: 0,
            orderCount: 0,
            lastOrder: order.createdAt,
          };
        }
        customerMap[email].totalSpent += Number(order.totalAmount || 0);
        customerMap[email].orderCount += 1;
        if (order.createdAt > customerMap[email].lastOrder) {
          customerMap[email].lastOrder = order.createdAt;
        }
      });

      const customers = Object.entries(customerMap).map(([email, data]) => ({
        email,
        ...data,
        averageOrderValue: data.totalSpent / data.orderCount,
      }));

      return customers.sort((a, b) => b.totalSpent - a.totalSpent);
    } catch (error) {
      throw error;
    }
  }

  static exportToCSV(data: any[], filename: string): string {
    if (!data || data.length === 0) {
      return "";
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((item) => headers.map((header) => `"${String(item[header]).replace(/"/g, '""')}"`).join(","));

    return [headers.join(","), ...rows].join("\n");
  }
}
