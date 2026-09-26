import { db } from "./db";
import { emitNotification } from "../config/socket";
import { logger } from "../config/logger";

/**
 * Prévient l'équipe de la plateforme (superowners et admins système actifs) :
 * cloche de l'application et poussée temps réel. N'échoue jamais : l'action
 * qui déclenche l'alerte (un dépôt de pièce…) ne doit pas en dépendre.
 */
export async function notifierPlateforme(titre: string, message: string, lien: string) {
  try {
    const plateforme = await db.user.findMany({
      where: { OR: [{ isSuperOwner: true }, { isSystemAdmin: true }], status: "ACTIVE" },
      select: { email: true },
    });

    for (const email of new Set(plateforme.map((u) => u.email))) {
      const notification = await db.notification.create({
        data: {
          type: "PLATFORM_ANNOUNCEMENT",
          title: titre,
          message,
          recipientEmail: email,
          link: lien,
        },
      });

      emitNotification(email, notification);
    }
  } catch (err) {
    logger.warn("Platform notification failed", { titre, error: err instanceof Error ? err.message : err });
  }
}

export const notificationService = {
  async create(storeId: string, recipientEmail: string, title: string, message: string, type: string, relatedOrderId?: string) {
    const notification = await db.notification.create({
      data: {
        storeId,
        recipientEmail,
        title,
        message,
        type: type as any,
        relatedOrderId,
        isRead: false,
      },
    });

    // Poussée immédiate : la cloche ne doit pas attendre un rechargement.
    emitNotification(recipientEmail, notification);

    return notification;
  },

  // Notifications d'une boutique. `getUserNotifications` filtre sur l'e-mail
  // du destinataire : lui passer un storeId ne renvoyait jamais rien.
  async getStoreNotifications(storeId: string, limit = 50, unreadOnly = false) {
    return db.notification.findMany({
      where: { storeId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async getUserNotifications(recipientEmail: string, limit = 20) {
    return db.notification.findMany({
      where: { recipientEmail },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async markAsRead(notificationId: string) {
    return db.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  },

  async markAllAsRead(recipientEmail: string) {
    return db.notification.updateMany({
      where: { recipientEmail, isRead: false },
      data: { isRead: true },
    });
  },

  async sendOrderNotification(orderId: string, storeId: string, recipientEmail: string, status: string) {
    const messages: Record<string, string> = {
      PENDING: "Votre commande a été créée",
      CONFIRMED: "Votre commande a été confirmée",
      PREPARING: "Votre commande est en préparation",
      READY: "Votre commande est prête",
      PICKED_UP: "Votre commande est en route",
      DELIVERED: "Votre commande a été livrée",
      CANCELLED: "Votre commande a été annulée",
    };

    return this.create(
      storeId,
      recipientEmail,
      "Mise à jour de commande",
      messages[status] || "Mise à jour de votre commande",
      "ORDER_UPDATE",
      orderId
    );
  },

  async sendDriverNotification(storeId: string, recipientEmail: string, title: string, message: string) {
    return this.create(storeId, recipientEmail, title, message, "DELIVERY", undefined);
  },
};
