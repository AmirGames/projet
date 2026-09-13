import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";
import { emitDeliveryUpdate } from "../config/socket";

const router = Router();

// GET /drivers/me - Get current driver info (protected)
router.get("/me", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.userId as string;

    const driver = await db.driver.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, name: true, phone: true }
        }
      }
    });

    if (!driver) {
      throw new ApiError(404, "Driver not found", "DRIVER_NOT_FOUND");
    }

    res.json({
      success: true,
      data: {
        id: driver.id,
        name: driver.user.name,
        email: driver.user.email,
        phone: driver.user.phone,
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

    const deliveries = await db.delivery.findMany({
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

    const formatted = deliveries.map(d => ({
      id: d.id,
      orderId: d.orderId,
      status: d.status,
      pickupAddress: d.order?.deliveryAddress || "",
      deliveryAddress: d.order?.deliveryAddress || "",
      customerName: d.order?.customerName || "",
      customerPhone: d.order?.customerPhone || "",
      totalAmount: d.order?.totalAmount || 0,
      distance: d.distance,
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

    const delivery = await db.delivery.findUnique({
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
        distance: delivery.distance,
        estimatedTime: delivery.estimatedTime,
        latitude: delivery.latitude,
        longitude: delivery.longitude,
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
      const driverId = req.user?.userId as string;

      const driver = await db.driver.findUnique({ where: { userId: driverId } });
      if (!driver) {
        throw new ApiError(404, "Driver not found", "DRIVER_NOT_FOUND");
      }

      const delivery = await db.delivery.update({
        where: { id: deliveryId },
        data: {
          driverId: driver.id,
          status: "ACCEPTED" as any,
          acceptedAt: new Date()
        },
        include: { order: true }
      });

      emitDeliveryUpdate(delivery.orderId, {
        driverId: driver.id,
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

      if (!status) {
        throw new ApiError(400, "Status required", "INVALID_INPUT");
      }

      const delivery = await db.delivery.update({
        where: { id: deliveryId },
        data: {
          status: status as any,
          ...(status === "DELIVERED" && { deliveredAt: new Date() })
        }
      });

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

      if (!latitude || !longitude) {
        throw new ApiError(400, "Latitude and longitude required", "INVALID_INPUT");
      }

      const delivery = await db.delivery.update({
        where: { id: deliveryId },
        data: {
          latitude,
          longitude,
          lastLocationUpdate: new Date()
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
