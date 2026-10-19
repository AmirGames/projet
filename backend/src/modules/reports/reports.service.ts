import { db } from "../../services/db";
import { TRANSMISE } from "../../utils/commande-transmise";
import { Prisma, type OrderStatus, type PaymentStatus } from "@prisma/client";

export interface ReportFilters {
  storeId?: string;
  orgId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  limit?: number;
  offset?: number;
}

const LIMITE_RAPPORT = 5000;

/**
 * Une cellule du CSV.
 *
 * Le nom d'un client est saisi par le client, y compris sans compte : un nom
 * comme « =HYPERLINK(...) » s'exécuterait comme une formule à l'ouverture de
 * l'export dans un tableur. Un texte qui commence par =, +, -, @, une
 * tabulation ou un retour chariot est donc précédé d'une apostrophe. Les
 * nombres, eux, gardent leur signe (une remise négative reste un nombre).
 */
function cellule(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '""';
  let texte = valeur instanceof Date ? valeur.toISOString() : String(valeur);
  if (typeof valeur === "string" && /^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  return `"${texte.replace(/"/g, '""')}"`;
}

export class ReportsService {
  static async getSalesReport(filters: ReportFilters) {
    try {
      const where: Prisma.OrderWhereInput = { ...TRANSMISE };

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

      const limit = Math.min(Math.max(filters.limit ?? 50, 1), LIMITE_RAPPORT);
      const offset = Math.max(filters.offset ?? 0, 0);
      const [orders, aggregates] = await Promise.all([
        db.order.findMany({
          where,
          select: {
            id: true, storeId: true, customerName: true, customerEmail: true,
            status: true, paymentStatus: true, totalAmount: true, taxAmount: true,
            feesAmount: true, serviceFeeAmount: true, createdAt: true, updatedAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: limit,
          skip: offset,
        }),
        db.$queryRaw<Array<{
          status: string | null;
          paymentStatus: string | null;
          count: bigint;
          totalOrders: bigint | null;
          totalRevenue: Prisma.Decimal | null;
          totalTax: Prisma.Decimal | null;
          totalFees: Prisma.Decimal | null;
        }>>`
          SELECT
            CASE WHEN GROUPING(o.status) = 0 THEN o.status::text END AS status,
            CASE WHEN GROUPING(o."paymentStatus") = 0 THEN o."paymentStatus"::text END AS "paymentStatus",
            COUNT(*) AS count,
            CASE WHEN GROUPING(o.status) = 1 AND GROUPING(o."paymentStatus") = 1 THEN COUNT(*) END AS "totalOrders",
            CASE WHEN GROUPING(o.status) = 1 AND GROUPING(o."paymentStatus") = 1 THEN COALESCE(SUM(GREATEST(0, o."totalAmount" - o."feesAmount" - o."serviceFeeAmount")), 0) END AS "totalRevenue",
            CASE WHEN GROUPING(o.status) = 1 AND GROUPING(o."paymentStatus") = 1 THEN COALESCE(SUM(o."taxAmount"), 0) END AS "totalTax",
            CASE WHEN GROUPING(o.status) = 1 AND GROUPING(o."paymentStatus") = 1 THEN COALESCE(SUM(o."feesAmount"), 0) END AS "totalFees"
          FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
          WHERE o."submittedAt" IS NOT NULL
            ${filters.storeId ? Prisma.sql`AND o."storeId" = ${filters.storeId}` : Prisma.empty}
            ${!filters.storeId && filters.orgId ? Prisma.sql`AND s."orgId" = ${filters.orgId}` : Prisma.empty}
            ${filters.startDate ? Prisma.sql`AND o."createdAt" >= ${filters.startDate}` : Prisma.empty}
            ${filters.endDate ? Prisma.sql`AND o."createdAt" <= ${filters.endDate}` : Prisma.empty}
            ${filters.status ? Prisma.sql`AND o.status = ${filters.status}::"OrderStatus"` : Prisma.empty}
            ${filters.paymentStatus ? Prisma.sql`AND o."paymentStatus" = ${filters.paymentStatus}::"PaymentStatus"` : Prisma.empty}
          GROUP BY GROUPING SETS ((), (o.status), (o."paymentStatus"))`),
      ]);

      const stats = aggregates.find((x) => x.status === null && x.paymentStatus === null) ?? aggregates[0];
      const totalOrders = Number(stats?.totalOrders || 0);
      // Agrégation SQL sur Decimal : les sommes ne sont pas limitées à la page.
      const totalRevenue = Number(stats?.totalRevenue || 0);
      const totalTax = Number(stats?.totalTax || 0);
      const totalFees = Number(stats?.totalFees || 0);
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const statusBreakdown = Object.fromEntries(
        aggregates.filter((x) => typeof x.status === "string").map((x) => [x.status as string, Number(x.count)])
      );
      const paymentBreakdown = Object.fromEntries(
        aggregates.filter((x) => typeof x.paymentStatus === "string").map((x) => [x.paymentStatus as string, Number(x.count)])
      );
      return {
        totalOrders,
        totalRevenue,
        totalTax,
        totalFees,
        averageOrderValue,
        statusBreakdown,
        paymentBreakdown,
        orders,
        pagination: { total: totalOrders, limit, offset, hasMore: offset + orders.length < totalOrders },
      };
    } catch (error) {
      throw error;
    }
  }

  static async getRevenueByDate(filters: ReportFilters) {
    try {
      const rows = await db.$queryRaw<Array<{ date: string; revenue: Prisma.Decimal; tax: Prisma.Decimal; fees: Prisma.Decimal; count: bigint }>>`
        SELECT to_char((o."createdAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(GREATEST(0, o."totalAmount" - o."feesAmount" - o."serviceFeeAmount")), 0) AS revenue,
          COALESCE(SUM(o."taxAmount"), 0) AS tax, COALESCE(SUM(o."feesAmount"), 0) AS fees,
          COUNT(*) AS count
        FROM "Order" o JOIN "Store" s ON s.id = o."storeId"
        WHERE o."submittedAt" IS NOT NULL
          ${filters.storeId ? Prisma.sql`AND o."storeId" = ${filters.storeId}` : Prisma.empty}
          ${!filters.storeId && filters.orgId ? Prisma.sql`AND s."orgId" = ${filters.orgId}` : Prisma.empty}
          ${filters.startDate ? Prisma.sql`AND o."createdAt" >= ${filters.startDate}` : Prisma.empty}
          ${filters.endDate ? Prisma.sql`AND o."createdAt" <= ${filters.endDate}` : Prisma.empty}
        GROUP BY (o."createdAt" AT TIME ZONE 'UTC')::date ORDER BY (o."createdAt" AT TIME ZONE 'UTC')::date ASC`;
      return rows.map((row) => ({ date: row.date, revenue: Number(row.revenue), tax: Number(row.tax), fees: Number(row.fees), count: Number(row.count) }));
    } catch (error) {
      throw error;
    }
  }

  static async getProductPerformance(storeId: string, filters: Pick<ReportFilters, "startDate" | "endDate" | "limit" | "offset"> = {}) {
    try {
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), LIMITE_RAPPORT);
      const offset = Math.max(filters.offset ?? 0, 0);
      const products = await db.$queryRaw<Array<{ id: string; name: string; sku: string | null; totalSold: bigint; totalRevenue: Prisma.Decimal; status: string; total: bigint }>>`
        SELECT p.id, p.name, p.sku, COALESCE(SUM(oi.quantity) FILTER (WHERE o.id IS NOT NULL), 0) AS "totalSold",
          COALESCE(SUM(oi.total) FILTER (WHERE o.id IS NOT NULL), 0) AS "totalRevenue", p.status, COUNT(*) OVER() AS total
        FROM "Product" p LEFT JOIN "OrderItem" oi ON oi."productId" = p.id
        LEFT JOIN "Order" o ON o.id = oi."orderId" AND o."submittedAt" IS NOT NULL
          ${filters.startDate ? Prisma.sql`AND o."createdAt" >= ${filters.startDate}` : Prisma.empty}
          ${filters.endDate ? Prisma.sql`AND o."createdAt" <= ${filters.endDate}` : Prisma.empty}
        WHERE p."storeId" = ${storeId}
        GROUP BY p.id ORDER BY "totalSold" DESC, p.id ASC LIMIT ${limit} OFFSET ${offset}`;
      const total = products.length ? Number(products[0].total) : offset ? Number((await db.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) AS total FROM "Product" WHERE "storeId" = ${storeId}`)[0]?.total || 0) : 0;
      return {
        products: products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, totalSold: Number(p.totalSold), totalRevenue: Number(p.totalRevenue), avgPrice: Number(p.totalSold) ? Number(p.totalRevenue) / Number(p.totalSold) : 0, status: p.status })),
        pagination: { total, limit, offset, hasMore: offset + products.length < total },
      };
    } catch (error) {
      throw error;
    }
  }

  static async getCustomerAnalytics(storeId: string, filters: Pick<ReportFilters, "startDate" | "endDate" | "limit" | "offset"> = {}) {
    try {
      const limit = Math.min(Math.max(filters.limit ?? 50, 1), LIMITE_RAPPORT);
      const offset = Math.max(filters.offset ?? 0, 0);
      const customers = await db.$queryRaw<Array<{ email: string; name: string; totalSpent: Prisma.Decimal; orderCount: bigint; lastOrder: Date; total: bigint }>>`
        WITH clients AS (
          SELECT lower(o."customerEmail") AS email,
            (array_agg(o."customerName" ORDER BY o."createdAt" DESC, o.id DESC))[1] AS name,
            SUM(GREATEST(0, o."totalAmount" - o."feesAmount" - o."serviceFeeAmount")) AS "totalSpent",
            COUNT(*) AS "orderCount", MAX(o."createdAt") AS "lastOrder"
          FROM "Order" o
          WHERE o."submittedAt" IS NOT NULL AND o."storeId" = ${storeId} AND o."customerEmail" IS NOT NULL
            ${filters.startDate ? Prisma.sql`AND o."createdAt" >= ${filters.startDate}` : Prisma.empty}
            ${filters.endDate ? Prisma.sql`AND o."createdAt" <= ${filters.endDate}` : Prisma.empty}
          GROUP BY lower(o."customerEmail")
        )
        SELECT clients.*, COUNT(*) OVER() AS total FROM clients
        ORDER BY "totalSpent" DESC, email ASC LIMIT ${limit} OFFSET ${offset}`;
      const total = customers.length ? Number(customers[0].total) : offset ? Number((await db.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(DISTINCT lower("customerEmail")) AS total FROM "Order"
        WHERE "submittedAt" IS NOT NULL AND "storeId" = ${storeId} AND "customerEmail" IS NOT NULL
          ${filters.startDate ? Prisma.sql`AND "createdAt" >= ${filters.startDate}` : Prisma.empty}
          ${filters.endDate ? Prisma.sql`AND "createdAt" <= ${filters.endDate}` : Prisma.empty}`)[0]?.total || 0) : 0;
      return {
        customers: customers.map((c) => ({ email: c.email, name: c.name, totalSpent: Number(c.totalSpent), orderCount: Number(c.orderCount), lastOrder: c.lastOrder, averageOrderValue: Number(c.totalSpent) / Number(c.orderCount) })),
        pagination: { total, limit, offset, hasMore: offset + customers.length < total },
      };
    } catch (error) {
      throw error;
    }
  }

  static exportToCSV(data: Record<string, unknown>[], _filename: string): string {
    if (!data || data.length === 0) {
      return "";
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((item) => headers.map((header) => cellule(item[header])).join(","));

    return [headers.join(","), ...rows].join("\n");
  }
}
