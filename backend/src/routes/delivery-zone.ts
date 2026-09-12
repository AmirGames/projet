import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { DeliveryZoneService } from "../services/delivery-zone.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const createZoneSchema = z.object({
  storeId: z.string().cuid(),
  name: z.string().min(2, "Zone name minimum 2 characters").max(50),
  baseFee: z.number().nonnegative("Base fee cannot be negative"),
  minOrder: z.number().nonnegative("Minimum order cannot be negative").optional(),
  polygon: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

const updateZoneSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  baseFee: z.number().nonnegative().optional(),
  minOrder: z.number().nonnegative().optional(),
  polygon: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

// POST /delivery-zones - Create zone (protected)
router.post("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createZoneSchema.parse(req.body);

    logger.info("Creating delivery zone", { name: body.name, storeId: body.storeId });

    const zone = await DeliveryZoneService.create(body);

    res.status(201).json({
      message: "Delivery zone created",
      zone,
    });
  } catch (err) {
    next(err);
  }
});

// GET /delivery-zones/:id - Get zone by ID (protected)
router.get("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const zone = await DeliveryZoneService.getById(id);

    res.json(zone);
  } catch (err) {
    next(err);
  }
});

// GET /delivery-zones?storeId=:storeId - Get zones by store (protected)
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.query.storeId as string;
    const orgId = req.query.orgId as string;

    if (orgId) {
      const zones = await DeliveryZoneService.getByOrgId(orgId);
      return res.json({
        zones,
        total: zones.length,
      });
    }

    if (!storeId) {
      throw new ApiError(400, "Parameter 'storeId' or 'orgId' required", "MISSING_PARAM");
    }

    const zones = await DeliveryZoneService.getByStoreId(storeId);

    res.json({
      zones,
      total: zones.length,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /delivery-zones/:id - Update zone (protected)
router.put("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const body = updateZoneSchema.parse(req.body);

    logger.info("Updating delivery zone", { id });

    const zone = await DeliveryZoneService.update(id, body);

    res.json({
      message: "Delivery zone updated",
      zone,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /delivery-zones/:id - Delete zone (protected)
router.delete("/:id", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const zone = await DeliveryZoneService.getById(id);

    if (!zone) {
      throw new ApiError(404, "Delivery zone not found", "ZONE_NOT_FOUND");
    }

    logger.info("Deleting delivery zone", { id });

    await DeliveryZoneService.delete(id);

    res.json({
      message: "Delivery zone deleted",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
