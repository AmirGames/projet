import { Router, Request, Response, NextFunction } from "express";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { emitDeliveryUpdate } from "../config/socket";
import { AuthService } from "../services/auth.service";
import { z } from "zod";

const router = Router();

// Résout le livreur rattaché au compte connecté. Sans ce contrôle, n'importe
// quel utilisateur authentifié pourrait manipuler les courses des autres.
async function livreurConnecte(req: Request) {
  const userId = req.user?.userId as string;
  const livreur = await db.driver.findUnique({ where: { userId } });

  if (!livreur) {
    throw new ApiError(404, "Aucun profil livreur associé à ce compte", "DRIVER_NOT_FOUND");
  }

  return livreur;
}

// Vérifie que la course appartient bien au livreur connecté.
async function courseDuLivreur(req: Request, deliveryId: string) {
  const livreur = await livreurConnecte(req);

  const course = await db.orderDelivery.findUnique({ where: { id: deliveryId } });

  if (!course) {
    throw new ApiError(404, "Course introuvable", "DELIVERY_NOT_FOUND");
  }

  if (course.driverId && course.driverId !== livreur.id) {
    throw new ApiError(403, "Cette course est attribuée à un autre livreur", "FORBIDDEN");
  }

  return { livreur, course };
}

const inscriptionSchema = z.object({
  name: z.string().min(2, "Nom minimum 2 caractères"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  phone: z.string().min(9, "Téléphone invalide"),
  vehicleType: z.enum(["car", "scooter", "bike"]),
  vehiclePlate: z.string().optional(),
});

// POST /drivers/register - Inscription d'un livreur
router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = inscriptionSchema.parse(req.body);

    const [compteExistant, livreurExistant] = await Promise.all([
      db.user.findUnique({ where: { email: body.email } }),
      db.driver.findUnique({ where: { email: body.email } }),
    ]);

    if (compteExistant || livreurExistant) {
      throw new ApiError(409, "Cette adresse e-mail est déjà utilisée", "EMAIL_EXISTS");
    }

    const passwordHash = await AuthService.hashPassword(body.password);

    const utilisateur = await db.user.create({
      data: { email: body.email, name: body.name, passwordHash },
    });

    const livreur = await db.driver.create({
      data: {
        userId: utilisateur.id,
        name: body.name,
        email: body.email,
        phone: body.phone,
        vehicleType: body.vehicleType,
        vehiclePlate: body.vehiclePlate,
        licensePlate: body.vehiclePlate,
      },
    });

    // Un livreur n'appartient à aucune organisation : le jeton ne porte donc
    // ni orgId ni boutique.
    const accessToken = AuthService.generateAccessToken({
      userId: utilisateur.id,
      orgId: "",
      storeIds: [],
      role: "DRIVER" as any,
    });
    const refreshToken = AuthService.generateRefreshToken(utilisateur.id);

    res.status(201).json({
      message: "Inscription réussie",
      accessToken,
      refreshToken,
      driver: { id: livreur.id, name: livreur.name, email: livreur.email },
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/earnings - Revenus du livreur connecté
router.get("/earnings", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);

    const courses = await db.orderDelivery.findMany({
      where: { driverId: livreur.id, status: "DELIVERED" },
      include: { order: { select: { totalAmount: true, feesAmount: true } } },
      orderBy: { deliveryTime: "desc" },
    });

    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const debutSemaine = new Date(debutJour);
    debutSemaine.setDate(debutJour.getDate() - ((debutJour.getDay() + 6) % 7));
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

    // La rémunération du livreur correspond aux frais de livraison encaissés.
    const gain = (c: (typeof courses)[number]) => Number(c.order?.feesAmount || 0);
    const depuis = (date: Date) =>
      courses
        .filter((c) => (c.deliveryTime || c.updatedAt) >= date)
        .reduce((somme, c) => somme + gain(c), 0);

    res.json({
      total: courses.reduce((somme, c) => somme + gain(c), 0),
      today: depuis(debutJour),
      week: depuis(debutSemaine),
      month: depuis(debutMois),
      deliveryCount: courses.length,
      rating: Number(livreur.rating),
      deliveries: courses.slice(0, 30).map((c) => ({
        id: c.id,
        orderId: c.orderId,
        deliveredAt: c.deliveryTime || c.updatedAt,
        orderAmount: Number(c.order?.totalAmount || 0),
        earning: gain(c),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/availability - Se déclarer disponible ou non
router.patch("/availability", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const livreur = await livreurConnecte(req);
    const { isAvailable } = req.body;

    if (typeof isAvailable !== "boolean") {
      throw new ApiError(400, "Le champ isAvailable doit être un booléen", "INVALID_INPUT");
    }

    const misAJour = await db.driver.update({
      where: { id: livreur.id },
      data: { isAvailable, isOnline: isAvailable },
    });

    res.json({ isAvailable: misAJour.isAvailable, isOnline: misAJour.isOnline });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/me - Get current driver info (protected)
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId as string;

    const driver = await db.driver.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, name: true }
        }
      }
    }) as any;

    if (!driver) {
      throw new ApiError(404, "Driver not found", "DRIVER_NOT_FOUND");
    }

    res.json({
      success: true,
      data: {
        id: driver.id,
        name: driver.user?.name,
        email: driver.user?.email,
        rating: driver.rating,
        totalEarnings: driver.totalEarnings,
        completedDeliveries: driver.totalDeliveries,
        isAvailable: driver.isAvailable,
        vehicleType: driver.vehicleType,
        licensePlate: driver.licensePlate,
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/deliveries - Get deliveries for driver (protected)
router.get("/deliveries", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverId = req.query.driverId as string;
    const status = (req.query.status as string) || "PENDING";

    const deliveries = await db.orderDelivery.findMany({
      where: {
        ...(driverId ? { driverId } : {}),
        status: status as any
      },
      include: {
        order: {
          include: {
            items: {
              include: { product: true }
            }
          }
        }
      },
      take: 50,
      orderBy: { createdAt: "desc" }
    });

    const formatted = deliveries.map((d: any) => ({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      pickupAddress: d.order?.deliveryAddress || "",
      deliveryAddress: d.order?.deliveryAddress || "",
      customerName: d.order?.customerName || "",
      customerPhone: d.order?.customerPhone || "",
      totalAmount: d.order?.totalAmount || 0,
      estimatedTime: d.estimatedTime,
      items: d.order?.items || []
    }));

    res.json({
      success: true,
      data: formatted
    });
  } catch (err) {
    next(err);
  }
});

// GET /drivers/deliveries/:id - Get specific delivery (protected)
router.get("/deliveries/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveryId = req.params.id as string;

    const delivery = await db.orderDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            items: { include: { product: true } }
          }
        }
      }
    });

    if (!delivery) {
      throw new ApiError(404, "Delivery not found", "DELIVERY_NOT_FOUND");
    }

    res.json({
      success: true,
      data: {
        id: delivery.id,
        orderId: delivery.orderId,
        status: delivery.status,
        pickupAddress: delivery.order?.deliveryAddress,
        deliveryAddress: delivery.order?.deliveryAddress,
        customerName: delivery.order?.customerName,
        customerPhone: delivery.order?.customerPhone,
        totalAmount: delivery.order?.totalAmount,
        estimatedTime: delivery.estimatedTime,
        latitude: delivery.deliveryLat,
        longitude: delivery.deliveryLng,
        items: delivery.order?.items || []
      }
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /drivers/deliveries/:id/accept - Accept delivery (protected)
router.patch(
  "/deliveries/:id/accept",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId === livreur.id) {
        throw new ApiError(409, "Vous avez déjà accepté cette course", "ALREADY_ACCEPTED");
      }

      const delivery = await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          driverId: livreur.id,
          status: "ACCEPTED"
        },
        include: { order: true }
      });

      emitDeliveryUpdate(delivery.orderId, {
        driverId: livreur.id,
        status: "ACCEPTED"
      });

      res.json({
        success: true,
        message: "Delivery accepted",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id - Update delivery status (protected)
router.patch(
  "/deliveries/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { status } = req.body;

      const STATUTS = ["PENDING", "ACCEPTED", "PICKED_UP", "DELIVERED", "FAILED"];
      if (!status || !STATUTS.includes(status)) {
        throw new ApiError(400, `Statut invalide (attendu : ${STATUTS.join(", ")})`, "INVALID_INPUT");
      }

      const { livreur, course } = await courseDuLivreur(req, deliveryId);

      if (course.driverId !== livreur.id) {
        throw new ApiError(403, "Acceptez d'abord cette course", "NOT_ASSIGNED");
      }

      const delivery = await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          status: status as any,
          ...(status === "DELIVERED" && { deliveryTime: new Date() })
        },
        include: { order: { select: { feesAmount: true } } }
      });

      // Une course livrée alimente les compteurs du livreur.
      if (status === "DELIVERED" && course.status !== "DELIVERED") {
        await db.driver.update({
          where: { id: livreur.id },
          data: {
            totalDeliveries: { increment: 1 },
            totalEarnings: { increment: Number(delivery.order?.feesAmount || 0) },
            currentOrderId: null,
          },
        });
      }

      emitDeliveryUpdate(delivery.orderId, {
        driverId: delivery.driverId,
        status
      });

      res.json({
        success: true,
        message: "Delivery updated",
        data: delivery
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /drivers/deliveries/:id/location - Update driver location (protected)
router.patch(
  "/deliveries/:id/location",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deliveryId = req.params.id as string;
      const { latitude, longitude } = req.body;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        throw new ApiError(400, "Latitude et longitude requises", "INVALID_INPUT");
      }

      await courseDuLivreur(req, deliveryId);

      const delivery = await db.orderDelivery.update({
        where: { id: deliveryId },
        data: {
          deliveryLat: latitude,
          deliveryLng: longitude
        }
      });

      emitDeliveryUpdate(delivery.orderId, {
        location: { latitude, longitude },
        status: delivery.status
      });

      res.json({
        success: true,
        message: "Location updated",
        data: { latitude, longitude }
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
