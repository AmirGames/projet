import { db } from "./db.js";

export const notificationService = {
  async create(userId: string, title: string, message: string, type: string, relatedId?: string) {
    return db.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        relatedId,
        read: false,
      },
    });
  },

  async getUserNotifications(userId: string, limit = 20) {
    return db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  async markAsRead(notificationId: string) {
    return db.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  },

  async markAllAsRead(userId: string) {
    return db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  },

  async sendOrderNotification(orderId: string, customerId: string, status: string) {
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
      customerId,
      "Mise à jour de commande",
      messages[status] || "Mise à jour de votre commande",
      "ORDER_UPDATE",
      orderId
    );
  },

  async sendDriverNotification(driverId: string, title: string, message: string) {
    return this.create(driverId, title, message, "DELIVERY", undefined);
  },
};
