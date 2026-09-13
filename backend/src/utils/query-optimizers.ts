import { db } from "../services/db";

export const queryOptimizers = {
  // Get orders with items and store details efficiently
  async getOrdersWithDetails(where: any, skip: number, take: number) {
    return db.order.findMany({
      where,
      skip,
      take,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, price: true } } }
        },
      },
      orderBy: { createdAt: "desc" }
    });
  },

  // Get stores with product counts efficiently
  async getStoresWithCounts(where: any) {
    return db.store.findMany({
      where,
      include: {
        _count: { select: { products: true, orders: true } }
      }
    });
  },

  // Get merchants with their stats efficiently
  async getMerchantsWithStats(skip: number, take: number) {
    return db.organization.findMany({
      skip,
      take,
      include: {
        _count: { select: { memberships: true, stores: true } },
        stores: { select: { id: true, _count: { select: { products: true } } } }
      }
    });
  },

  // Get products with images and options efficiently
  async getProductsWithDetails(where: any, skip: number, take: number) {
    return db.product.findMany({
      where,
      skip,
      take,
      include: {
        images: { select: { id: true, url: true } },
        category: { select: { id: true, name: true } },
      }
    });
  },
};
