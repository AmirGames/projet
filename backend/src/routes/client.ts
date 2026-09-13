import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

// GET /api/client/stores - Get all stores (public)
router.get("/stores", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stores = await db.store.findMany({
      where: { status: "OPEN" },
      include: {
        organization: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE" },
          take: 5
        }
      },
      orderBy: { name: "asc" }
    });

    res.json({
      success: true,
      count: stores.length,
      data: stores
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/nearby - Get nearby stores by geolocation
router.get("/stores/nearby", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { latitude, longitude, maxDistance = 5 } = req.query;

    if (!latitude || !longitude) {
      throw new ApiError(400, "Latitude et longitude requis", "INVALID_REQUEST");
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const maxDist = parseFloat(maxDistance as string);

    // Récupérer tous les stores avec localisation
    const stores = await db.store.findMany({
      where: { status: "OPEN", latitude: { not: null }, longitude: { not: null } },
      include: {
        organization: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE" },
          take: 3
        }
      }
    });

    // Calculer distance avec Haversine formula
    const storesWithDistance = stores
      .map(store => {
        const R = 6371; // Earth radius in km
        const dLat = (lat - (store.latitude || 0)) * (Math.PI / 180);
        const dLng = (lng - (store.longitude || 0)) * (Math.PI / 180);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat * (Math.PI / 180)) *
            Math.cos((store.latitude || 0) * (Math.PI / 180)) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return {
          ...store,
          distance: parseFloat(distance.toFixed(2)),
          estimatedDeliveryTime: Math.ceil(distance * 5) + " min"
        };
      })
      .filter(store => store.distance <= maxDist)
      .sort((a, b) => a.distance - b.distance);

    res.json({
      success: true,
      count: storesWithDistance.length,
      data: storesWithDistance
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/search - Search stores by name, city, cuisine
router.get("/stores/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, city, limit = 20 } = req.query;

    if (!q) {
      throw new ApiError(400, "Paramètre 'q' requis", "INVALID_REQUEST");
    }

    const searchQuery = (q as string).toLowerCase();

    const stores = await db.store.findMany({
      where: {
        status: "OPEN",
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { description: { contains: searchQuery, mode: "insensitive" } },
          { city: city ? { contains: city as string, mode: "insensitive" } : undefined }
        ].filter(Boolean) as any
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE" },
          take: 3
        }
      },
      take: parseInt(limit as string)
    });

    res.json({
      success: true,
      count: stores.length,
      data: stores
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id - Get store details with menu (public)
router.get("/stores/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const store = await db.store.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, email: true }
        },
        products: {
          where: { status: "ACTIVE" },
          include: {
            category: true,
            media: true,
            variants: true
          },
          orderBy: { name: "asc" }
        },
        hours: true,
        reviews: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            customer: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    if (!store) {
      throw new ApiError(404, "Restaurant non trouvé", "NOT_FOUND");
    }

    // Group products by category
    const categorizedProducts = store.products.reduce((acc: any, product: any) => {
      const categoryName = product.category?.name || "Autres";
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(product);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        ...store,
        menu: categorizedProducts,
        averageRating:
          store.reviews.length > 0
            ? (
                store.reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) /
                store.reviews.length
              ).toFixed(1)
            : 0,
        reviewCount: store.reviews.length
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/stores/:id/menu - Get menu only
router.get("/stores/:id/menu", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const products = await db.product.findMany({
      where: {
        storeId: id,
        status: "ACTIVE"
      },
      include: {
        category: true,
        media: true,
        variants: true
      },
      orderBy: [{ category: { name: "asc" } }, { name: "asc" }]
    });

    const categorized = products.reduce((acc: any, product: any) => {
      const categoryName = product.category?.name || "Autres";
      if (!acc[categoryName]) {
        acc[categoryName] = [];
      }
      acc[categoryName].push(product);
      return acc;
    }, {});

    res.json({
      success: true,
      data: categorized
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/favorites - Get customer favorites (protected)
router.get("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;

    const customer = await db.customer.findUnique({
      where: { id: userId },
      include: {
        favorites: {
          include: {
            store: {
              include: {
                products: {
                  where: { status: "ACTIVE" },
                  take: 3
                }
              }
            }
          }
        }
      }
    });

    res.json({
      success: true,
      data: customer?.favorites || []
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/client/me/favorites - Add to favorites (protected)
router.post("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { storeId } = req.body;

    if (!storeId) {
      throw new ApiError(400, "storeId requis", "INVALID_REQUEST");
    }

    // Check if already favorited
    const existing = await db.favoriteStore.findFirst({
      where: { customerId: userId, storeId }
    });

    if (existing) {
      throw new ApiError(400, "Déjà en favoris", "DUPLICATE");
    }

    const favorite = await db.favoriteStore.create({
      data: {
        customerId: userId,
        storeId
      },
      include: {
        store: {
          include: {
            products: { where: { status: "ACTIVE" }, take: 3 }
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: "Ajouté aux favoris",
      data: favorite
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/client/me/favorites/:storeId - Remove from favorites (protected)
router.delete("/me/favorites/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id;
    const { storeId } = req.params;

    await db.favoriteStore.deleteMany({
      where: { customerId: userId, storeId }
    });

    res.json({
      success: true,
      message: "Supprimé des favoris"
    });
  } catch (err) {
    next(err);
  }
});

export default router;
