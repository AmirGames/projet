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
              // La catégorie et la déclinaison, sans quoi la facture d'une
              // « 4 fromages » ne dit ni pâtes ni pizza, ni quelle taille.
              product: {
                select: { name: true, sku: true, category: { select: { name: true } } },
              },
              variant: { select: { label: true, sku: true } },
            },
          },
          customer: true,
          store: {
            select: {
              name: true,
              email: true,
              phone: true,
              address: true,
              city: true,
              postalCode: true,
              // L'identité de facturation de la boutique quand elle en a une —
              // trois commerces d'un même compte peuvent avoir trois numéros de
              // TVA —, sinon celle de la société.
              legalName: true,
              vatNumber: true,
              registrationNumber: true,
              org: {
                select: {
                  name: true,
                  legalName: true,
                  vatNumber: true,
                  registrationNumber: true,
                  billingAddress: true,
                  billingPostalCode: true,
                  billingCity: true,
                  billingCountry: true,
                },
              },
            },
          },
        },
      });

      if (!order || order.storeId !== storeId) {
        throw new ApiError(404, "Order not found", "ORDER_NOT_FOUND");
      }

      /**
       * Les mentions légales de l'émetteur.
       *
       * Une facture sans numéro de TVA n'en est pas une : elle ne permet ni de
       * récupérer la taxe, ni de justifier la dépense. Rien n'en sortait, alors
       * que le commerçant les renseigne dans son profil.
       */
      const org = order.store.org;

      const emetteur = {
        legalName: order.store.legalName || org?.legalName || null,
        vatNumber: order.store.vatNumber || org?.vatNumber || null,
        registrationNumber: order.store.registrationNumber || org?.registrationNumber || null,
        billingAddress: org?.billingAddress || null,
        billingPostalCode: org?.billingPostalCode || null,
        billingCity: org?.billingCity || null,
        billingCountry: org?.billingCountry || null,
      };

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
          postalCode: order.store.postalCode,
          city: order.store.city,
          ...emetteur,
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
          category: item.product.category?.name || null,
          variant: item.variant?.label || null,
          sku: item.variant?.sku || item.product.sku,
          quantity: item.quantity,
          unitPrice: parseFloat(item.price.toString()),
          total: parseFloat(item.total.toString()),
        })),
        
        // Amounts
        subtotal: order.items.reduce((sum, item) => sum + parseFloat(item.total.toString()), 0),
        tax: parseFloat(order.taxAmount.toString()),
        // Le taux tel qu'il valait à la commande : un commerçant qui passe de 10
        // à 20 % ne doit pas réécrire la TVA d'un ticket déjà remis.
        taxRate: parseFloat(order.taxRate.toString()),
        // Les prix affichés étant TTC, la taxe est comprise dans le total : la
        // facture doit le dire, sinon on croit qu'elle s'ajoute.
        taxIncluded: true,
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
