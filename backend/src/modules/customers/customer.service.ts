import { db } from "../../services/db";
import { totalCommercant } from "../delivery/delivery-mode.service";
import { ApiError } from "../../middleware/errorHandler";

/**
 * Les clients sont GLOBAUX : un même client peut commander chez plusieurs
 * commerçants, et le modèle `Customer` ne porte donc aucun `storeId`.
 *
 * La clientèle d'une boutique se déduit de ses commandes. Toutes les méthodes
 * ci-dessous vérifient ce rattachement avant d'exposer ou de modifier une
 * fiche : sans quoi un commerçant verrait les clients de ses concurrents.
 *
 * Ce qu'un commerçant sait d'un client (notes, blocage, retrait du carnet) vit
 * dans `StoreCustomer`, propre à sa boutique : agir sur « son » client ne touche
 * jamais la fiche globale ni les autres commerçants. Les coordonnées de la fiche
 * globale n'appartiennent qu'au client.
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

/** Seul ce que le commerçant sait du client se modifie depuis sa boutique. */
export interface UpdateCustomerData {
  notes?: string;
  status?: string;
}

/** La fiche globale vue par une boutique : notes et statut sont ceux de son carnet. */
function vueBoutique<T extends { notes?: string | null; status?: string }>(
  client: T,
  entree?: { notes: string | null; status: string } | null
) {
  return { ...client, notes: entree?.notes ?? null, status: entree?.status ?? "ACTIVE" };
}

/**
 * Les clients d'une boutique : ceux qui y ont commandé, et ceux que le
 * commerçant a ajoutés à son carnet (rattachement explicite). Un client
 * retiré du carnet de cette boutique en est exclu, quoi qu'il ait commandé.
 */
function clientsDeLaBoutique(storeId: string) {
  return {
    deletedAt: null,
    OR: [
      { orders: { some: { storeId, deletedAt: null } } },
      { storeEntries: { some: { storeId, hiddenAt: null } } },
    ],
    // Retiré du carnet de cette boutique : introuvable pour elle seule.
    storeEntries: { none: { storeId, hiddenAt: { not: null } } },
  };
}

export class CustomerService {
  /** Un client appartient à la boutique s'il y a commandé ou si son carnet l'a ajouté. */
  private static async assurerRattachement(storeId: string, customerId: string) {
    const client = await db.customer.findFirst({
      where: { id: customerId, ...clientsDeLaBoutique(storeId) },
      include: { storeEntries: { where: { storeId }, take: 1 } },
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

    const whereClause: any = clientsDeLaBoutique(storeId);

    if (search) {
      // Le OR du rattachement reste intact : la recherche s'y ajoute.
      whereClause.AND = [
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where: whereClause,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          storeEntries: { where: { storeId }, take: 1 },
          // Les totaux affichés doivent porter sur cette boutique seulement,
          // pas sur l'ensemble des commerces où le client a commandé.
          orders: {
            where: { storeId, deletedAt: null },
            select: { totalAmount: true, feesAmount: true, serviceFeeAmount: true, createdAt: true },
          },
        },
      }),
      db.customer.count({ where: whereClause }),
    ]);

    return {
      data: customers.map(({ orders, storeEntries, ...client }) => ({
        ...vueBoutique(client, storeEntries[0]),
        totalOrders: orders.length,
        // Ce que le client a dépensé en articles chez ce commerçant.
        totalSpent: totalCommercant(orders),
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

    const client = await db.customer.findUnique({
      where: { id: customerId },
      include: {
        storeEntries: { where: { storeId }, take: 1 },
        orders: {
          where: { storeId, deletedAt: null },
          select: {
            id: true,
            totalAmount: true,
            feesAmount: true,
            serviceFeeAmount: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!client) return null;
    const { storeEntries, ...fiche } = client;
    return vueBoutique(fiche, storeEntries[0]);
  }

  static async createCustomer(storeId: string, data: CreateCustomerData) {
    const existant = await db.customer.findUnique({ where: { email: data.email } });

    if (existant) {
      throw new ApiError(409, "Un client utilise déjà cette adresse e-mail", "CUSTOMER_EXISTS");
    }

    return db.$transaction(async (tx) => {
      const client = await tx.customer.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
        },
      });
      const entree = await tx.storeCustomer.create({
        data: { storeId, customerId: client.id, notes: data.notes, status: data.status || "ACTIVE" },
      });
      return vueBoutique(client, entree);
    });
  }

  /** Notes et statut du carnet de cette boutique ; la fiche globale n'est pas touchée. */
  static async updateCustomer(storeId: string, customerId: string, data: UpdateCustomerData) {
    const client = await this.assurerRattachement(storeId, customerId);

    const changements: { notes?: string; status?: string } = {};
    if (data.notes !== undefined) changements.notes = data.notes;
    if (data.status !== undefined) changements.status = data.status;

    const entree = await db.storeCustomer.upsert({
      where: { storeId_customerId: { storeId, customerId } },
      update: changements,
      create: { storeId, customerId, ...changements },
    });

    const { storeEntries, ...fiche } = client;
    return vueBoutique(fiche, entree);
  }

  // Retrait du carnet de cette boutique seulement : la fiche est partagée entre
  // commerçants et ses commandes restent consultables pour la comptabilité.
  static async deleteCustomer(storeId: string, customerId: string) {
    await this.assurerRattachement(storeId, customerId);

    await db.storeCustomer.upsert({
      where: { storeId_customerId: { storeId, customerId } },
      update: { hiddenAt: new Date() },
      create: { storeId, customerId, hiddenAt: new Date() },
    });

    return { success: true };
  }

  /** Blocage dans le carnet de cette boutique : les autres commerçants ne le voient pas. */
  static async blockCustomer(storeId: string, customerId: string) {
    const client = await this.assurerRattachement(storeId, customerId);

    const entree = await db.storeCustomer.upsert({
      where: { storeId_customerId: { storeId, customerId } },
      update: { status: "BLOCKED" },
      create: { storeId, customerId, status: "BLOCKED" },
    });

    const { storeEntries, ...fiche } = client;
    return vueBoutique(fiche, entree);
  }
}
