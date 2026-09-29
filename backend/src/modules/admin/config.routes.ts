import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "../../services/db";
import { authMiddleware } from "../../middleware/auth";
import { invalidateMaintenanceCache } from "../../middleware/maintenance";
import { isSystemAdmin } from "./shared";

const router = Router();

// GET /admin/config - Get system configuration
router.get("/config", authMiddleware, isSystemAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await db.systemConfig.findFirst();

    if (!config) {
      config = await db.systemConfig.create({
        data: {},
      });
    }

    res.json(config);
  } catch (err) {
    next(err);
  }
});

// PUT /admin/config - Update system configuration
router.put("/config", authMiddleware, isSystemAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      platformFeePercent: z.number().min(0).max(100).optional(),
      minOrderAmount: z.number().optional(),
      maxOrderAmount: z.number().optional(),
      maintenanceMode: z.boolean().optional(),
      maintenanceMessage: z.string().optional(),
      selectedTheme: z.string().optional(),
      // Attribution des courses aux livreurs
      driverBaseFee: z.number().min(0).optional(),
      driverPerKmFee: z.number().min(0).optional(),
      driverOfferSeconds: z.number().int().min(10).max(600).optional(),
      driverMaxRadiusKm: z.number().min(1).max(50).optional(),
    });

    const body = schema.parse(req.body);
    const adminId = (req as any).userId;

    let config = await db.systemConfig.findFirst();
    if (!config) {
      config = await db.systemConfig.create({ data: {} });
    }

    const updated = await db.systemConfig.update({
      where: { id: config.id },
      data: body,
    });

    // Le middleware met le réglage en cache : forcer sa relecture.
    invalidateMaintenanceCache();

    await db.systemAuditLog.create({
      data: {
        adminId,
        action: "UPDATE_SYSTEM_CONFIG",
        target: "SYSTEM_CONFIG",
        changes: body as any,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
