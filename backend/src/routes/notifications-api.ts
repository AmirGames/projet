import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth";
import { notificationService } from "../services/notification.service";
import { db } from "../services/db";
import { ApiError } from "../middleware/errorHandler";

const router = Router();

// Les notifications sont adressées par email : le token ne porte que l'id.
async function recipientEmail(req: Request) {
  const user = await db.user.findUnique({
    where: { id: req.userId as string },
    select: { email: true },
  });

  if (!user) {
    throw new ApiError(404, "Utilisateur non trouvé", "NOT_FOUND");
  }

  return user.email;
}

// GET /notifications - Get user notifications
router.get("/", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = await recipientEmail(req);
    const limit = parseInt(req.query.limit as string) || 20;

    const notifications = await notificationService.getUserNotifications(email, limit);
    const unreadCount = await db.notification.count({
      where: { recipientEmail: email, isRead: false },
    });

    res.json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all - Mark all as read
// Déclaré avant /:id/read pour ne pas être capté comme un identifiant.
router.patch("/read-all", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = await recipientEmail(req);

    await notificationService.markAllAsRead(email);

    res.json({ success: true, message: "Toutes les notifications marquées comme lues" });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read - Mark notification as read
router.patch("/:id/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = await recipientEmail(req);
    const notificationId = req.params.id as string;

    const notification = await db.notification.findUnique({
      where: { id: notificationId },
      select: { recipientEmail: true },
    });

    if (!notification || notification.recipientEmail !== email) {
      throw new ApiError(404, "Notification non trouvée", "NOT_FOUND");
    }

    await notificationService.markAsRead(notificationId);

    res.json({ success: true, message: "Notification marquée comme lue" });
  } catch (err) {
    next(err);
  }
});

export default router;
