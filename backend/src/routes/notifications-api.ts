import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import { notificationService } from "../services/notification.service";

const router = Router();

// GET /notifications - Get user notifications
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const notifications = await notificationService.getUserNotifications(userId, limit);

    res.json({
      success: true,
      data: notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read - Mark notification as read
router.patch("/:id/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.id as string;

    await notificationService.markAsRead(notificationId);

    res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all - Mark all as read
router.patch("/read-all", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req.user as any)?.userId;

    await notificationService.markAllAsRead(userId);

    res.json({ success: true, message: "Toutes les notifications marquées comme lues" });
  } catch (err) {
    next(err);
  }
});

export default router;
