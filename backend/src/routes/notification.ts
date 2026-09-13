import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { notificationService } from "../services/notification.service";
import { authMiddleware } from "../middleware/auth";
import { logger } from "../config/logger";

const router = Router();

const createNotificationSchema = z.object({
  type: z.enum(["ORDER_PLACED", "ORDER_DELIVERED", "PROMOTION_AVAILABLE", "STOCK_LOW", "REVIEW_RECEIVED", "PAYMENT_FAILED", "PAYMENT_SUCCEEDED"]),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  recipientEmail: z.string().email(),
  relatedOrderId: z.string().optional(),
  relatedProductId: z.string().optional(),
});

router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;

    logger.info("Fetching notifications", { storeId, take });

    const notifications = await notificationService.getUserNotifications(storeId, take);
    res.json({ data: notifications });
  } catch (err) {
    next(err);
  }
});

// TODO: Implement get single notification endpoint

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createNotificationSchema.parse(req.body);

    logger.info("Creating notification", { storeId });

    const notification = await notificationService.create(
      storeId,
      body.title,
      body.message,
      body.type,
      body.relatedOrderId
    );
    res.status(201).json({
      message: "Notification created successfully",
      notification,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:notificationId/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;

    logger.info("Marking notification as read", { notificationId });

    const notification = await notificationService.markAsRead(notificationId);
    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/read-all", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Marking all notifications as read", { storeId });

    await notificationService.markAllAsRead(storeId);
    res.json({
      message: "All notifications marked as read",
    });
  } catch (err) {
    next(err);
  }
});

// TODO: Implement delete notification endpoint

// TODO: Implement unread count endpoint

export default router;
