import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { notificationService } from "./notification.service";
import { authMiddleware } from "../auth/auth.middleware";
import { ApiError } from "../../middleware/errorHandler";
import { db } from "../../services/db";
import { logger } from "../../config/logger";

/**
 * Les notifications d'une boutique, vues de l'espace commerçant.
 *
 * `/api/notifications` est hors de portée du cloisonnement global
 * (middleware/cloisonnement.ts) : la boîte personnelle de chacun y vit aussi
 * (notifications-api.ts). Le contrôle est donc fait ici, route par route —
 * sans lui, n'importe quel compte connecté lisait, créait ou supprimait les
 * notifications de la boutique d'un autre.
 */
const router = Router();

const createNotificationSchema = z.object({
  type: z.enum(["ORDER_PLACED", "ORDER_DELIVERED", "PROMOTION_AVAILABLE", "STOCK_LOW", "REVIEW_RECEIVED", "PAYMENT_FAILED", "PAYMENT_SUCCEEDED"]),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(1000),
  recipientEmail: z.string().email(),
  relatedOrderId: z.string().optional(),
  relatedProductId: z.string().optional(),
});

/** La boutique demandée, si l'appelant en est membre (ou si c'est la plateforme). */
async function exigerLaBoutique(req: Request): Promise<string> {
  const storeId = req.params.storeId as string;

  const boutique = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, orgId: true },
  });

  if (!boutique) {
    throw new ApiError(404, "Boutique introuvable", "STORE_NOT_FOUND");
  }

  if (req.compte?.isSuperOwner || req.compte?.isSystemAdmin) return boutique.id;

  const appartenance = await db.membership.findFirst({
    where: { userId: req.userId, orgId: boutique.orgId },
    select: { id: true },
  });

  if (!appartenance) {
    throw new ApiError(403, "Cette boutique n'est pas la vôtre", "FORBIDDEN");
  }

  return boutique.id;
}

/** Une notification de cette boutique, ou 404 : jamais celle d'une autre. */
async function exigerLaNotification(req: Request) {
  const storeId = await exigerLaBoutique(req);
  const notification = await db.notification.findFirst({
    where: { id: req.params.notificationId as string, storeId },
  });

  if (!notification) {
    throw new ApiError(404, "Notification introuvable", "NOT_FOUND");
  }

  return notification;
}

// GET /notifications/:storeId/unread/count - Nombre de notifications non lues
router.get("/:storeId/unread/count", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = await exigerLaBoutique(req);

    const count = await db.notification.count({
      where: { storeId, isRead: false },
    });

    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// GET /notifications/:storeId - Les notifications de la boutique
router.get("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = await exigerLaBoutique(req);
    const demande = parseInt(req.query.take as string);
    const take = Number.isFinite(demande) ? Math.min(Math.max(demande, 1), 200) : 50;
    const nonLues = req.query.isRead === "false";

    const notifications = await notificationService.getStoreNotifications(storeId, take, nonLues);
    res.json({ data: notifications, total: notifications.length });
  } catch (err) {
    next(err);
  }
});

// GET /notifications/:storeId/:notificationId - Une notification
router.get("/:storeId/:notificationId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await exigerLaNotification(req);
    res.json({ data: notification });
  } catch (err) {
    next(err);
  }
});

router.post("/:storeId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = await exigerLaBoutique(req);
    const body = createNotificationSchema.parse(req.body);

    logger.info("Creating notification", { storeId });

    // Le destinataire était omis, décalant tous les arguments suivants :
    // le titre arrivait dans recipientEmail, le type dans message, etc.
    const notification = await notificationService.create(
      storeId,
      body.recipientEmail,
      body.title,
      body.message,
      body.type,
      body.relatedOrderId || undefined
    );
    res.status(201).json({
      message: "Notification created successfully",
      notification,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/read-all", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const storeId = await exigerLaBoutique(req);

    // markAllAsRead du service filtre par destinataire : lui passer le
    // storeId ne marquait rien du tout.
    const { count } = await db.notification.updateMany({
      where: { storeId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    res.json({
      message: "All notifications marked as read",
      count,
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:storeId/:notificationId/read", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existante = await exigerLaNotification(req);

    const notification = await db.notification.update({
      where: { id: existante.id },
      data: { isRead: true, readAt: existante.readAt ?? new Date() },
    });

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /notifications/:storeId/:notificationId - Supprimer une notification
router.delete("/:storeId/:notificationId", authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existante = await exigerLaNotification(req);

    await db.notification.delete({ where: { id: existante.id } });

    res.json({ message: "Notification supprimée" });
  } catch (err) {
    next(err);
  }
});

export default router;
