import type { Prisma } from "@prisma/client";
import { db } from "../../services/db";
import { ApiError } from "../../middleware/errorHandler";

/** Administration système des commerçants et de leurs boutiques : lectures et changement de formule. */
export const AdminMerchantsService = {
  /** Les commerçants, éventuellement filtrés par statut. */
  async lister({ limit, offset, status }: { limit: number; offset: number; status: string }) {
    const where: Prisma.OrganizationWhereInput = {};
    if (status) where.status = status;

    const merchants = (await db.organization.findMany({
      where,
      skip: offset,
      take: limit,
      include: {
        stores: { select: { id: true, name: true } },
        memberships: { select: { id: true, role: true, user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }));

    const total = await db.organization.count({ where });

    return { merchants, pagination: { total, limit, offset } };
  },

  /** Le détail d'un commerçant avec son chiffre d'affaires et la commission estimée. */
  async detail(orgId: string) {
    const merchant = await db.organization.findUnique({
      where: { id: orgId },
      include: {
        stores: true,
        memberships: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
        tickets: { take: 5, orderBy: { createdAt: "desc" } },
        commissionHistory: { take: 12, orderBy: { period: "desc" } },
      },
    });

    if (!merchant) {
      throw new ApiError(404, "Commerçant non trouvé", "NOT_FOUND");
    }

    // Get revenue stats
    const storeIds = (merchant.stores || []).map((s) => s.id);
    const orders = await db.order.findMany({
      where: {
        storeId: {
          in: storeIds,
        },
      },
      select: { totalAmount: true, createdAt: true },
    });

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const platformFee = await db.systemConfig.findFirst();
    const feePercent = platformFee?.platformFeePercent || 5;
    const commission = totalRevenue * (Number(feePercent) / 100);

    return {
      ...merchant,
      stats: {
        totalRevenue,
        commission,
        ordersCount: orders.length,
      },
    };
  },

  /** Change la formule d'un commerçant (le statut passe par les routes dédiées). */
  changerFormule(orgId: string, body: { tier?: "FREE" | "PREMIUM" | "PRO" }) {
    return db.organization.update({
      where: { id: orgId },
      data: body,
    });
  },

  /** Toutes les boutiques de la plateforme, avec recherche par nom, ville ou adresse. */
  async boutiques({ recherche, limit, offset }: { recherche: string; limit: number; offset: number }) {
    const where: Prisma.StoreWhereInput = { deletedAt: null };

    if (recherche) {
      where.OR = [
        { name: { contains: recherche, mode: "insensitive" } },
        { city: { contains: recherche, mode: "insensitive" } },
        { slug: { contains: recherche, mode: "insensitive" } },
      ];
    }

    const [boutiques, total] = await Promise.all([
      db.store.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
        include: {
          org: { select: { id: true, name: true, status: true } },
          _count: { select: { products: true, orders: true } },
        },
      }),
      db.store.count({ where }),
    ]);

    return {
      stores: boutiques.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        city: b.city,
        isOpen: b.isOpen,
        rating: Number(b.rating),
        createdAt: b.createdAt,
        organization: b.org,
        productCount: b._count.products,
        orderCount: b._count.orders,
      })),
      pagination: { total, limit, offset },
    };
  },
};
