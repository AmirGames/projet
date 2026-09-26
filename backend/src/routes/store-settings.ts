import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { emailFacultatif } from "../utils/validation";
import { StoreSettingsService } from "../services/store-settings.service";
import { authMiddleware } from "../middleware/auth";
import { uploadMiddleware } from "../middleware/file-upload";
import { ApiError } from "../middleware/errorHandler";
import { FileUploadService } from "../services/file-upload.service";
import { logger } from "../config/logger";

const router = Router();

const updateSettingsSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  // La position de la suggestion d'adresse retenue : plus sûre qu'un
  // géocodage du texte, qui reste le recours.
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().max(20).optional(),
  email: emailFacultatif,
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
  delivery: z.object({
    useOwnDelivery: z.boolean().optional(),
  }).optional(),
  // Ce que vend ce commerce, et ce qu'on y mange.
  businessType: z.string().max(40).optional(),
  cuisineType: z.string().max(40).nullable().optional(),
  /**
   * L'identité de facturation propre à cette boutique.
   *
   * Vide, celle de la société s'applique : trois commerces sous une seule
   * société n'ont qu'un numéro de TVA. Renseignée, elle prime.
   */
  legalName: z.string().max(200).nullable().optional(),
  vatNumber: z.string().max(30).nullable().optional(),
  registrationNumber: z.string().max(30).nullable().optional(),
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
      message: "Réglages enregistrés",
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

/** Un logo s'affiche sur chaque carte de la liste : une image, et légère. */
const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const LOGO_TAILLE_MAX = 2 * 1024 * 1024;

// POST /store-settings/:storeId/logo/upload - Envoyer le fichier du logo (protected)
router.post(
  "/:storeId/logo/upload",
  authMiddleware,
  uploadMiddleware.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const storeId = req.params.storeId as string;

      if (!req.file) {
        throw new ApiError(400, "Aucun fichier fourni", "NO_FILE");
      }
      if (!LOGO_TYPES.includes(req.file.mimetype)) {
        throw new ApiError(400, "Le logo doit être une image JPG, PNG ou WebP", "INVALID_FILE_TYPE");
      }
      if (req.file.size > LOGO_TAILLE_MAX) {
        throw new ApiError(400, "Le logo ne doit pas dépasser 2 Mo", "FILE_TOO_LARGE");
      }

      logger.info("Uploading store logo file", { storeId, size: req.file.size });

      const { url } = await FileUploadService.uploadPublicImage(
        req.file.buffer,
        req.file.originalname || "logo",
        req.file.mimetype
      );
      const store = await StoreSettingsService.uploadLogo(storeId, url);

      res.json({
        message: "Logo enregistré",
        logo: (store.settings as any)?.logo,
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /store-settings/:storeId/logo - Retirer le logo (protected)
router.delete("/:storeId/logo", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Removing store logo", { storeId });

    await StoreSettingsService.removeLogo(storeId);

    res.json({ message: "Logo retiré", logo: null });
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
