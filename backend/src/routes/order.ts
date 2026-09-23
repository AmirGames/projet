import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { OrderService } from "../services/order.service";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";
import { emitOrderUpdate } from "../config/socket";
import { db } from "../services/db";

import { DispatchService } from "../services/dispatch.service";

const router = Router();

// GET /orders - Get orders by orgId or storeId (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.query.orgId as string;
    const storeId = req.query.storeId as string;
    const status = req.query.status as string | undefined;
    const limit = parseInt((req.query.limit as string) || "100") || 100;
    const offset = parseInt((req.query.offset as string) || "0") || 0;

    if (!orgId && !storeId) {
      throw new ApiError(400, "Paramètre 'orgId' ou 'storeId' requis", "MISSING_PARAM");
    }

    let orders;
    let total;
    // Les compteurs de la page d'accueil du commerçant : ils restaient à zéro
    // faute d'être calculés quelque part.
    let resume: { totalOrders: number; totalRevenue: number } | undefined;

    if (storeId) {
      orders = await OrderService.getByStoreId(storeId, limit, offset);
      total = await OrderService.countByStoreId(storeId);
    } else {
      orders = await OrderService.getByOrgId(orgId, status, limit, offset);
      const bilan = await OrderService.chiffreAffairesOrg(orgId, status);
      total = bilan.commandes;
      resume = {
        totalOrders: bilan.commandes,
        totalRevenue: Number(bilan.chiffreAffaires.toFixed(2)),
      };
    }

    res.json({
      orders,
      ...(resume ? { summary: resume } : {}),
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

const createOrderSchema = z.object({
  storeId: z.string().cuid(),
  customerName: z.string().min(2, "Nom minimum 2 caractères"),
  customerEmail: z.string().email("Email invalide"),
  customerPhone: z.string().min(9, "Téléphone invalide"),
  deliveryType: z.enum(["PICKUP", "DELIVERY"]),
  pickupTime: z.string().optional(),
  deliveryAddress: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryPostal: z.string().optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  totalAmount: z.number().positive("Total doit être positif"),
  taxAmount: z.number().optional(),
  feesAmount: z.number().optional(),
  // Le code est repris tel quel ; c'est le serveur qui calcule la remise.
  promoCode: z.string().optional(),
  paymentMethodId: z.string().optional(),
  notes: z.string().optional(),
  // Le détail du panier : sans lui, la commande n'enregistrait qu'un montant,
  // et la facture comme les statistiques de vente restaient vides.
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
        price: z.number().nonnegative(),
        selectedOptions: z.record(z.string(), z.string()).optional(),
      })
    )
    .optional(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "READY", "COMPLETED"]),
});

// POST /orders - Create order (public, for guest checkout)
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createOrderSchema.parse(req.body);

    logger.info("Creating order", { customerName: body.customerName, storeId: body.storeId });

    const order = await OrderService.create(body);

    res.status(201).json({
      message: "Commande créée",
      order,
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id - Get order by ID
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const order = await OrderService.getOrderWithItems(id);

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
});

// GET /orders/store/:storeId - Get orders by store (protected)
router.get("/store/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const limit = parseInt((req.query.limit as string) || "100") || 100;
    const offset = parseInt((req.query.offset as string) || "0") || 0;

    const orders = await OrderService.getByStoreId(storeId, limit, offset);
    const total = await OrderService.countByStoreId(storeId);

    res.json({
      orders,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/status/:storeId - Get orders by status (protected)
router.get("/status/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const status = (req.query.status as string) || "";

    if (!status) {
      throw new ApiError(400, "Paramètre 'status' requis", "INVALID_INPUT");
    }

    const orders = await OrderService.getByStatus(storeId, status);

    res.json({
      status,
      orders,
      count: orders.length,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /orders/:id/status - Update order status (protected)
router.patch("/:id/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateOrderStatusSchema.parse(req.body);

    logger.info("Updating order status", { id, status: body.status });

    const order = await OrderService.updateStatus(id, body.status);

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    emitOrderUpdate(id, body.status, { updatedAt: new Date().toISOString() });

    res.json({
      message: "Statut de la commande mis à jour",
      order,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /orders/:id - Delete order (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const order = await OrderService.getById(id);

    if (!order) {
      throw new ApiError(404, "Commande non trouvée", "NOT_FOUND");
    }

    logger.info("Deleting order", { id });

    await OrderService.delete(id);

    res.json({
      message: "Commande supprimée",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /orders/:id/dispatch - Chercher un livreur pour cette commande
 *
 * Déclenché par le commerçant quand la commande est prête. Crée la course si
 * elle n'existe pas encore, puis la propose au livreur disponible le plus
 * proche.
 *
 * Relançable : si personne n'était en ligne au premier essai, le commerçant
 * rappelle cette route plus tard sans rien dupliquer.
 */
router.post("/:id/dispatch", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id as string;

    const course = await DispatchService.creerCourse(orderId);

    if (course.driverId) {
      res.json({
        success: true,
        message: "Cette course a déjà un livreur",
        data: { deliveryId: course.id, driverId: course.driverId, propose: false },
      });
      return;
    }

    const proposition = await DispatchService.proposerAuSuivant(course.id);

    res.json({
      success: true,
      message: proposition
        ? "Course proposée à un livreur"
        : "Aucun livreur disponible pour l'instant : relancez dans quelques minutes",
      data: {
        deliveryId: course.id,
        propose: Boolean(proposition),
        expiresAt: proposition?.expiresAt ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id/delivery - Get delivery tracking info
router.get("/:id/delivery", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = req.params.id as string;

    const delivery = await db.orderDelivery.findUnique({
      where: { orderId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pickupLat: true,
        pickupLng: true,
        deliveryLat: true,
        deliveryLng: true,
        // Coordonnées obfusquées pour le client
        deliveryLatObfusquee: true,
        deliveryLngObfusquee: true,
        driverLat: true,
        driverLng: true,
        driver: { select: { name: true } },
      },
    });

    if (!delivery) {
      res.json({ data: null });
      return;
    }

    res.json({
      data: {
        ...delivery,
        // Utiliser coordonnées obfusquées pour le client
        deliveryLat: delivery.deliveryLatObfusquee || delivery.deliveryLat,
        deliveryLng: delivery.deliveryLngObfusquee || delivery.deliveryLng,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;