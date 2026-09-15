import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { distanceKm, estUnPoint } from "../utils/geo";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// GET /api/client/stores - Get all stores (public)
router.get("/stores", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stores = await db.store.findMany({
      where: { isOpen: true, deletedAt: null, org: { status: "ACTIVE" } },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
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
      where: {
        isOpen: true,
        deletedAt: null,
        org: { status: "ACTIVE" },
        latitude: { not: null },
        longitude: { not: null },
      },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
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
        isOpen: true,
        deletedAt: null,
        org: { status: "ACTIVE" },
        OR: [
          { name: { contains: searchQuery, mode: "insensitive" } },
          { description: { contains: searchQuery, mode: "insensitive" } },
          { city: city ? { contains: city as string, mode: "insensitive" } : undefined }
        ].filter(Boolean) as any
      },
      include: {
        org: {
          select: { id: true, name: true, slug: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
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
      where: { id: id as string },
      include: {
        org: {
          select: { id: true, name: true, slug: true, email: true, status: true }
        },
        products: {
          where: { status: "ACTIVE", deletedAt: null },
          include: {
            category: true,
            media: true,
            variants: true
          },
          orderBy: { name: "asc" }
        },
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
    }) as any;

    if (!store) {
      throw new ApiError(404, "Restaurant non trouvé", "NOT_FOUND");
    }

    if (store.org?.status !== "ACTIVE" || store.deletedAt) {
      throw new ApiError(423, "Boutique temporairement fermée", "STORE_TEMPORARILY_CLOSED");
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
        storeId: id as string,
        status: "ACTIVE",
        deletedAt: null,
        store: { deletedAt: null, org: { status: "ACTIVE" } }
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
/**
 * Résout la fiche client du compte connecté.
 *
 * `User` et `Customer` sont deux tables distinctes sans clé étrangère entre
 * elles ; l'e-mail, unique des deux côtés, fait le lien — c'est aussi la clé
 * utilisée à la création d'une commande.
 */
async function clientConnecte(req: Request) {
  const userId = req.userId || (req as any).user?.userId;

  const utilisateur = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { email: true } })
    : null;

  if (!utilisateur) {
    throw new ApiError(401, "Session invalide", "UNAUTHORIZED");
  }

  const client = await db.customer.findUnique({ where: { email: utilisateur.email } });

  if (!client || client.deletedAt) {
    throw new ApiError(404, "Aucune fiche client pour ce compte", "CUSTOMER_NOT_FOUND");
  }

  return client;
}

const profilSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères").optional(),
  phone: z.string().min(9, "Téléphone invalide").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
});

// GET /api/client/me - Profil du client connecté
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const [commandes, depenses] = await Promise.all([
      db.order.count({ where: { customerId: client.id, deletedAt: null } }),
      db.order.aggregate({
        where: { customerId: client.id, deletedAt: null },
        _sum: { totalAmount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        city: client.city,
        postalCode: client.postalCode,
        status: client.status,
        memberSince: client.createdAt,
        totalOrders: commandes,
        totalSpent: Number(depenses._sum.totalAmount) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/client/me - Mise à jour de ses propres coordonnées
router.put("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const body = profilSchema.parse(req.body);

    // L'adresse e-mail sert de clé de rapprochement avec le compte : elle
    // n'est volontairement pas modifiable ici.
    const misAJour = await db.customer.update({
      where: { id: client.id },
      data: body,
    });

    res.json({
      message: "Profil mis à jour",
      data: {
        name: misAJour.name,
        email: misAJour.email,
        phone: misAJour.phone,
        address: misAJour.address,
        city: misAJour.city,
        postalCode: misAJour.postalCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/me/orders - Historique des commandes du client connecté
router.get("/me/orders", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const commandes = await db.order.findMany({
      where: { customerId: client.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        store: { select: { id: true, name: true, slug: true, city: true } },
        items: { include: { product: { select: { name: true } } } },
        delivery: { select: { status: true, deliveryTime: true } },
      },
    });

    res.json({
      success: true,
      data: commandes.map((c) => ({
        id: c.id,
        status: c.status,
        paymentStatus: c.paymentStatus,
        deliveryType: c.deliveryType,
        totalAmount: Number(c.totalAmount),
        createdAt: c.createdAt,
        store: c.store,
        deliveryStatus: c.delivery?.status || null,
        items: c.items.map((i) => ({
          name: i.product?.name || "Produit supprimé",
          quantity: i.quantity,
          price: Number(i.price),
          total: Number(i.total),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/client/deliveries/:orderId - Suivi de livraison d'une commande
router.get("/deliveries/:orderId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);
    const orderId = req.params.orderId as string;

    const commande = await db.order.findFirst({
      where: { id: orderId, customerId: client.id, deletedAt: null },
      select: { id: true },
    });

    if (!commande) {
      throw new ApiError(404, "Commande introuvable", "ORDER_NOT_FOUND");
    }

    const course = await db.orderDelivery.findUnique({
      where: { orderId },
      include: {
        driver: { select: { name: true, phone: true, vehicleType: true, rating: true } },
        order: { select: { deliveryAddress: true, store: { select: { name: true } } } },
      },
    });

    if (!course) {
      res.json({ success: true, data: null });
      return;
    }

    // Trois points distincts, longtemps confondus : d'où part la commande, où
    // elle va, et où se trouve le livreur en ce moment. Renvoyer deliveryLat
    // comme position du livreur ne montrait plus rien depuis que celle-ci a
    // ses propres colonnes.
    const retrait = { latitude: course.pickupLat, longitude: course.pickupLng };
    const destination = { latitude: course.deliveryLat, longitude: course.deliveryLng };
    const livreur = { latitude: course.driverLat, longitude: course.driverLng };

    // La distance restante est ce qui intéresse le client ; la distance totale
    // sert à situer l'avancement.
    const restante =
      estUnPoint(livreur) && estUnPoint(destination) ? distanceKm(livreur, destination) : null;
    const totale =
      estUnPoint(retrait) && estUnPoint(destination) ? distanceKm(retrait, destination) : null;

    res.json({
      success: true,
      data: {
        id: course.id,
        status: course.status,
        estimatedTime: course.estimatedTime,
        deliveryTime: course.deliveryTime,
        boutique: course.order?.store?.name ?? null,
        adresseLivraison: course.order?.deliveryAddress ?? null,
        retrait: estUnPoint(retrait) ? retrait : null,
        destination: estUnPoint(destination) ? destination : null,
        position: estUnPoint(livreur)
          ? { ...livreur, misAJourLe: course.driverLocationAt }
          : null,
        distanceRestanteKm: restante,
        distanceTotaleKm: totale,
        driver: course.driver
          ? { ...course.driver, rating: Number(course.driver.rating) }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get("/me/favorites", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const client = await clientConnecte(req);

    const customer = await db.customer.findUnique({
      where: { id: client.id },
      include: {
        favorites: {
          include: {
            store: {
              include: {
                products: {
                  where: { status: "ACTIVE", deletedAt: null },
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
    const client = await clientConnecte(req);
    const userId = client.id;
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
    const client = await clientConnecte(req);
    const { storeId } = req.params;

    await db.favoriteStore.deleteMany({
      where: { customerId: client.id, storeId: storeId as string }
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
