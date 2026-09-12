import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { TaxService } from "../services/tax.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const createTaxSettingSchema = z.object({
  name: z.string().min(2).max(100),
  rate: z.number().min(0).max(100),
  applicableTo: z.enum(["all", "categories", "products"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
});

const updateTaxSettingSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  rate: z.number().min(0).max(100).optional(),
  applicableTo: z.enum(["all", "categories", "products"]).optional(),
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;
    const status = req.query.status as string | undefined;

    logger.info("Fetching tax settings", { storeId, skip, take });

    const result = await TaxService.getTaxSettings(storeId, { skip, take, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:taxSettingId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const taxSettingId = req.params.taxSettingId as string;

    logger.info("Fetching tax setting", { storeId, taxSettingId });

    const taxSetting = await TaxService.getTaxSetting(storeId, taxSettingId);
    res.json(taxSetting);
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createTaxSettingSchema.parse(req.body);

    logger.info("Creating tax setting", { storeId });

    const taxSetting = await TaxService.createTaxSetting(storeId, body);
    res.status(201).json({
      message: "Tax setting created successfully",
      taxSetting,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:taxSettingId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const taxSettingId = req.params.taxSettingId as string;
    const body = updateTaxSettingSchema.parse(req.body);

    logger.info("Updating tax setting", { storeId, taxSettingId });

    const taxSetting = await TaxService.updateTaxSetting(storeId, taxSettingId, body);
    res.json({
      message: "Tax setting updated successfully",
      taxSetting,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:taxSettingId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const taxSettingId = req.params.taxSettingId as string;

    logger.info("Deleting tax setting", { storeId, taxSettingId });

    await TaxService.deleteTaxSetting(storeId, taxSettingId);
    res.json({
      message: "Tax setting deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId/calculate", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const { amount, categoryIds, productIds } = req.body;

    logger.info("Calculating tax", { storeId, amount });

    const result = await TaxService.calculateTax(storeId, amount, categoryIds, productIds);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
