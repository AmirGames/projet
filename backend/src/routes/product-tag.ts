import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ProductTagService } from "../services/product-tag.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createTagSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
});

const updateTagSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;

    logger.info("Fetching product tags", { storeId });

    const result = await ProductTagService.getTags(storeId, { skip, take });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:tagId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const tagId = req.params.tagId as string;

    logger.info("Fetching product tag", { storeId, tagId });

    const tag = await ProductTagService.getTag(storeId, tagId);
    res.json(tag);
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createTagSchema.parse(req.body);

    logger.info("Creating product tag", { storeId });

    const tag = await ProductTagService.createTag(storeId, body);
    res.status(201).json({
      message: "Tag created successfully",
      tag,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:tagId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const tagId = req.params.tagId as string;
    const body = updateTagSchema.parse(req.body);

    logger.info("Updating product tag", { storeId, tagId });

    const tag = await ProductTagService.updateTag(storeId, tagId, body);
    res.json({
      message: "Tag updated successfully",
      tag,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:tagId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const tagId = req.params.tagId as string;

    logger.info("Deleting product tag", { storeId, tagId });

    await ProductTagService.deleteTag(storeId, tagId);
    res.json({
      message: "Tag deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId/:tagId/products/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const tagId = req.params.tagId as string;
    const productId = req.params.productId as string;

    logger.info("Adding product to tag", { storeId, tagId, productId });

    const tag = await ProductTagService.addProductToTag(storeId, tagId, productId);
    res.json({
      message: "Product added to tag",
      tag,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:tagId/products/:productId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const tagId = req.params.tagId as string;
    const productId = req.params.productId as string;

    logger.info("Removing product from tag", { storeId, tagId, productId });

    const tag = await ProductTagService.removeProductFromTag(storeId, tagId, productId);
    res.json({
      message: "Product removed from tag",
      tag,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
