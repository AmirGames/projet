import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export class InvoiceService {
  static async generateInvoice(storeId: string, orderId: string) {
    try {
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: { select: { name: true, sku: true } },
            },
          },
          customer: true,
          store: {
            select: { name: true, email: true, phone: true, address: true, city: true },
          },
        },
      });

      if (!order || order.storeId !== storeId) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      const invoice = {
        invoiceNumber: `INV-${order.id.slice(0, 8).toUpperCase()}`,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        
        // Store Info
        storeInfo: {
          name: order.store.name,
          email: order.store.email,
          phone: order.store.phone,
          address: order.store.address,
          city: order.store.city,
        },
        
        // Customer Info
        customerInfo: {
          name: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone,
        },
        
        // Items
        items: order.items.map(item => ({
          description: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          unitPrice: parseFloat(item.price.toString()),
          total: parseFloat(item.total.toString()),
        })),
        
        // Amounts
        subtotal: order.items.reduce((sum, item) => sum + parseFloat(item.total.toString()), 0),
        tax: parseFloat(order.taxAmount.toString()),
        fees: parseFloat(order.feesAmount.toString()),
        total: parseFloat(order.totalAmount.toString()),
        
        // Payment Status
        paymentStatus: order.paymentStatus,
        paidDate: null,
        
        // Order Status
        orderStatus: order.status,
        deliveryType: order.deliveryType,
        notes: order.notes,
      };

      return invoice;
    } catch (error) {
      throw error;
    }
  }

  static async getInvoices(storeId: string, options?: { skip?: number; take?: number; startDate?: Date; endDate?: Date }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      
      if (options?.startDate || options?.endDate) {
        whereClause.createdAt = {};
        if (options.startDate) {
          whereClause.createdAt.gte = options.startDate;
        }
        if (options.endDate) {
          whereClause.createdAt.lte = options.endDate;
        }
      }

      const [orders, total] = await Promise.all([
        db.order.findMany({
          where: whereClause,
          skip,
          take,
          select: {
            id: true,
            customerName: true,
            customerEmail: true,
            totalAmount: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
            items: {
              select: { quantity: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        db.order.count({ where: whereClause }),
      ]);

      const invoices = orders.map(order => ({
        invoiceNumber: `INV-${order.id.slice(0, 8).toUpperCase()}`,
        orderId: order.id,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        amount: parseFloat(order.totalAmount.toString()),
        itemCount: order.items.length,
        status: order.paymentStatus,
        orderStatus: order.status,
        date: order.createdAt,
      }));

      return {
        data: invoices,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getRevenueStats(storeId: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const orders = await db.order.findMany({
        where: {
          storeId,
          createdAt: { gte: startDate },
          paymentStatus: "SUCCEEDED",
        },
        select: {
          totalAmount: true,
          taxAmount: true,
          feesAmount: true,
          createdAt: true,
          status: true,
        },
      });

      const stats = {
        totalRevenue: orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0),
        totalTax: orders.reduce((sum, o) => sum + parseFloat(o.taxAmount.toString()), 0),
        totalFees: orders.reduce((sum, o) => sum + parseFloat(o.feesAmount.toString()), 0),
        netRevenue: orders.reduce((sum, o) => {
          const amount = parseFloat(o.totalAmount.toString());
          const fees = parseFloat(o.feesAmount.toString());
          return sum + (amount - fees);
        }, 0),
        invoiceCount: orders.length,
        averageInvoiceAmount: orders.length > 0 ? orders.reduce((sum, o) => sum + parseFloat(o.totalAmount.toString()), 0) / orders.length : 0,
      };

      return stats;
    } catch (error) {
      throw error;
    }
  }
}
