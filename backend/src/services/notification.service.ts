import { db } from "./db";

export const notificationService = {
  async create(storeId: string, recipientEmail: string, title: string, message: string, type: string, relatedOrderId?: string) {
    return db.notification.create({
      data: {
        storeId,
        recipientEmail,
        title,
        message,
        type,
        relatedOrderId,
        isRead: false,
      },
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
