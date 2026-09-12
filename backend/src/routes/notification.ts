import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { NotificationService } from "../services/notification.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { logger } from "../config/logger.js";

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
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const take = req.query.take ? parseInt(req.query.take as string) : 50;
    const isRead = req.query.isRead ? req.query.isRead === "true" : undefined;

    logger.info("Fetching notifications", { storeId, skip, take });

    const result = await NotificationService.getNotifications(storeId, { skip, take, isRead });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/:notificationId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const notificationId = req.params.notificationId as string;

    logger.info("Fetching notification", { storeId, notificationId });

    const notification = await NotificationService.getNotification(storeId, notificationId);
    res.json(notification);
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const body = createNotificationSchema.parse(req.body);

    logger.info("Creating notification", { storeId });

    const notification = await NotificationService.createNotification(storeId, body);
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
    const storeId = req.params.storeId as string;
    const notificationId = req.params.notificationId as string;

    logger.info("Marking notification as read", { storeId, notificationId });

    const notification = await NotificationService.markAsRead(storeId, notificationId);
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

    await NotificationService.markAllAsRead(storeId);
    res.json({
      message: "All notifications marked as read",
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:storeId/:notificationId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;
    const notificationId = req.params.notificationId as string;

    logger.info("Deleting notification", { storeId, notificationId });

    await NotificationService.deleteNotification(storeId, notificationId);
    res.json({
      message: "Notification deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:storeId/unread/count", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = req.params.storeId as string;

    logger.info("Getting unread count", { storeId });

    const result = await NotificationService.getUnreadCount(storeId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
