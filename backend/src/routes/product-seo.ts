import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductSeoService } from "../services/product-seo.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const updateSeoSchema = z.object({
  metaTitle: z.string().max(60).optional(),
  metaDescription: z.string().max(160).optional(),
  metaKeywords: z.string().max(200).optional(),
  slug: z.string().optional(),
  ogImage: z.string().url().optional(),
  ogDescription: z.string().max(200).optional(),
});

router.get("/:storeId/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;

    logger.info("Fetching product SEO", { storeId, productId });

    const seo = await ProductSeoService.getSeo(storeId, productId);
    res.json(seo);
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const productId = req.params.productId as string;
    const body = updateSeoSchema.parse(req.body);

    logger.info("Updating product SEO", { storeId, productId });

    const seo = await ProductSeoService.updateSeo(storeId, productId, body);
    res.json({
      message: "SEO updated successfully",
      seo,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
