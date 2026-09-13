import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { StoreSettingsService } from "../services/store-settings.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const updateSettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional().or(z.literal("")),
  timezone: z.string().optional(),
  currency: z.string().max(3).optional(),
  language: z.string().max(5).optional(),
  logo: z.string().optional(),
  banner: z.string().optional(),
  notifications: z.object({
    orderNotifications: z.boolean().optional(),
    lowStockAlerts: z.boolean().optional(),
    reviewNotifications: z.boolean().optional(),
    emailNotifications: z.boolean().optional(),
  }).optional(),
  businessHours: z.object({
    defaultOpen: z.string().optional(),
    defaultClose: z.string().optional(),
  }).optional(),
});

// GET /store-settings/:storeId - Get store settings (protected)
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Fetching store settings", { storeId });

    const settings = await StoreSettingsService.getSettings(storeId);

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PUT /store-settings/:storeId - Update store settings (protected)
router.put("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = updateSettingsSchema.parse(req.body);

    logger.info("Updating store settings", { storeId });

    const settings = await StoreSettingsService.updateSettings(storeId, body);

    res.json({
      message: "Store settings updated",
      settings,
    });
  } catch (err) {
    next(err);
  }
});

// POST /store-settings/:storeId/logo - Upload logo (protected)
router.post("/:storeId/logo", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const { logoUrl } = z.object({ logoUrl: z.string().url() }).parse(req.body);

    logger.info("Uploading store logo", { storeId });

    const store = await StoreSettingsService.uploadLogo(storeId, logoUrl);

    res.json({
      message: "Logo uploaded",
      logo: (store.settings as any)?.logo,
    });
  } catch (err) {
    next(err);
  }
});

// POST /store-settings/:storeId/banner - Upload banner (protected)
router.post("/:storeId/banner", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const { bannerUrl } = z.object({ bannerUrl: z.string().url() }).parse(req.body);

    logger.info("Uploading store banner", { storeId });

    const store = await StoreSettingsService.uploadBanner(storeId, bannerUrl);

    res.json({
      message: "Banner uploaded",
      banner: (store.settings as any)?.banner,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
