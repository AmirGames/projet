import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { MarketingService } from "../services/marketing.service.js";
import { ApiError } from "../middleware/errorHandler.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

const router = Router();

const createCampaignSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(["EMAIL", "SMS", "PUSH", "INAPP"]),
  message: z.string().min(1).max(5000),
  targetAudience: z.enum(["all", "new", "returning", "inactive"]).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional(),
  message: z.string().min(1).max(5000).optional(),
  targetAudience: z.enum(["all", "new", "returning", "inactive"]).optional(),
  scheduledAt: z.string().datetime().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"]),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;
    const status = req.query.status as string | undefined;

    logger.info("Fetching campaigns", { storeId, skip, take, status });

    const result = await MarketingService.getCampaigns(storeId, { skip, take, status });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:campaignId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const campaignId = req.params.campaignId as string;

    logger.info("Fetching campaign", { storeId, campaignId });

    const campaign = await MarketingService.getCampaign(storeId, campaignId);
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createCampaignSchema.parse(req.body);

    logger.info("Creating campaign", { storeId });

    const campaign = await MarketingService.createCampaign(storeId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    });

    res.status(201).json({
      message: "Campaign created successfully",
      campaign,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:campaignId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const campaignId = req.params.campaignId as string;
    const body = updateCampaignSchema.parse(req.body);

    logger.info("Updating campaign", { storeId, campaignId });

    const campaign = await MarketingService.updateCampaign(storeId, campaignId, {
      ...body,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
    });

    res.json({
      message: "Campaign updated successfully",
      campaign,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:campaignId/status", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const campaignId = req.params.campaignId as string;
    const body = updateStatusSchema.parse(req.body);

    logger.info("Updating campaign status", { storeId, campaignId });

    const campaign = await MarketingService.updateCampaignStatus(storeId, campaignId, body.status);
    res.json({
      message: "Campaign status updated successfully",
      campaign,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:campaignId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const campaignId = req.params.campaignId as string;

    logger.info("Deleting campaign", { storeId, campaignId });

    await MarketingService.deleteCampaign(storeId, campaignId);
    res.json({
      message: "Campaign deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
