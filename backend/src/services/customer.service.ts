import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

/**
 * Les clients sont GLOBAUX : un même client peut commander chez plusieurs
 * commerçants, et le modèle `Customer` ne porte donc aucun `storeId`.
 *
 * La clientèle d'une boutique se déduit de ses commandes. Toutes les méthodes
 * ci-dessous vérifient ce rattachement avant d'exposer ou de modifier une
 * fiche : sans quoi un commerçant verrait les clients de ses concurrents.
 */

export interface CustomerData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  status?: string;
}

export interface CreateCustomerData extends CustomerData {}

export interface UpdateCustomerData {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  status?: string;
}

export class CustomerService {
  /** Un client appartient à la boutique dès lors qu'il y a passé commande. */
  private static async assurerRattachement(storeId: string, customerId: string) {
    const client = await db.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
        orders: { some: { storeId, deletedAt: null } },
      },
    });

    if (!client) {
      throw new ApiError(404, "Client introuvable pour cette boutique", "CUSTOMER_NOT_FOUND");
    }

    return client;
  }

  static async getCustomers(storeId: string, options?: { skip?: number; take?: number; search?: string }) {
    const skip = options?.skip || 0;
    const take = options?.take || 50;
    const search = options?.search || "";

    const whereClause: any = {
      deletedAt: null,
      orders: { some: { storeId, deletedAt: null } },
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          // Les totaux affichés doivent porter sur cette boutique seulement,
          // pas sur l'ensemble des commerces où le client a commandé.
          orders: {
            where: { storeId, deletedAt: null },
            select: { totalAmount: true, createdAt: true },
          },
        },
      }),
      db.customer.count({ where: whereClause }),
    ]);

    return {
      data: customers.map(({ orders, ...client }) => ({
        ...client,
        totalOrders: orders.length,
        totalSpent: orders.reduce((somme, o) => somme + Number(o.totalAmount), 0),
        lastOrderDate:
          orders.length > 0
            ? orders.reduce((recente, o) => (o.createdAt > recente ? o.createdAt : recente), orders[0].createdAt)
            : null,
      })),
      total,
      skip,
      take,
    };
  }

  static async getCustomer(storeId: string, customerId: string) {
    await this.assurerRattachement(storeId, customerId);

    return db.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          where: { storeId, deletedAt: null },
          select: { id: true, totalAmount: true, status: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });
  }

  static async createCustomer(_storeId: string, data: CreateCustomerData) {
    const existant = await db.customer.findUnique({ where: { email: data.email } });

    if (existant) {
      throw new ApiError(409, "Un client utilise déjà cette adresse e-mail", "CUSTOMER_EXISTS");
    }

    return db.customer.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        notes: data.notes,
        status: data.status || "ACTIVE",
      },
    });
  }

  static async updateCustomer(storeId: string, customerId: string, data: UpdateCustomerData) {
    await this.assurerRattachement(storeId, customerId);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status !== undefined) updateData.status = data.status;

    return db.customer.update({ where: { id: customerId }, data: updateData });
  }

  // Suppression logique : la fiche est partagée entre commerçants et ses
  // commandes doivent rester consultables pour la comptabilité.
  static async deleteCustomer(storeId: string, customerId: string) {
    await this.assurerRattachement(storeId, customerId);

    await db.customer.update({
      where: { id: customerId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  static async blockCustomer(storeId: string, customerId: string) {
    await this.assurerRattachement(storeId, customerId);

    return db.customer.update({
      where: { id: customerId },
      data: { status: "BLOCKED" },
    });
  }
}
