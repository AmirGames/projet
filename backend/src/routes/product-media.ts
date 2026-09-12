import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductMediaService } from "../services/product-media.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const addMediaSchema = z.object({
  url: z.string().url(),
  alt: z.string().max(200).optional(),
  type: z.enum(["image", "video"]).optional(),
});

router.get("/:storeId/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;

    logger.info("Fetching product media", { storeId, productId });

    const media = await ProductMediaService.getProductMedia(storeId, productId);
    res.json({ data: media });
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;
    const body = addMediaSchema.parse(req.body);

    logger.info("Adding product media", { storeId, productId });

    const media = await ProductMediaService.addMedia(storeId, productId, body);
    res.status(201).json({
      message: "Media added successfully",
      media,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:mediaId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const mediaId = req.params.mediaId as string;

    logger.info("Deleting media", { storeId, mediaId });

    await ProductMediaService.deleteMedia(storeId, mediaId);
    res.json({ message: "Media deleted successfully" });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:productId/reorder", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;
    const { mediaOrder } = req.body;

    logger.info("Reordering media", { storeId, productId });

    await ProductMediaService.reorderMedia(storeId, productId, mediaOrder);
    res.json({ message: "Media reordered successfully" });
  } catch (err) {
    next(err);
  }
});

export default router;
