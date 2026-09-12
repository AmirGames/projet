import { db } from "./db.js";
import { ApiError } from "../middleware/errorHandler.js";

export interface NotificationData {
  type: string;
  title: string;
  message: string;
  recipientEmail: string;
  relatedOrderId?: string;
  relatedProductId?: string;
}

export class NotificationService {
  static async getNotifications(storeId: string, options?: { skip?: number; take?: number; isRead?: boolean }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      if (options?.isRead !== undefined) {
        whereClause.isRead = options.isRead;
      }

      const [notifications, total] = await Promise.all([
        db.notification.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.notification.count({ where: whereClause }),
      ]);

      return { data: notifications, total, skip, take };
    } catch (error) {
      throw error;
    }
  }

  static async getNotification(storeId: string, notificationId: string) {
    try {
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification || notification.storeId !== storeId) {
        throw new ApiError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
      }

      return notification;
    } catch (error) {
      throw error;
    }
  }

  static async createNotification(storeId: string, data: NotificationData) {
    try {
      const notification = await db.notification.create({
        data: {
          storeId,
          type: data.type,
          title: data.title,
          message: data.message,
          recipientEmail: data.recipientEmail,
          relatedOrderId: data.relatedOrderId,
          relatedProductId: data.relatedProductId,
        },
      });

      return notification;
    } catch (error) {
      throw error;
    }
  }

  static async markAsRead(storeId: string, notificationId: string) {
    try {
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification || notification.storeId !== storeId) {
        throw new ApiError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
      }

      const updated = await db.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async markAllAsRead(storeId: string) {
    try {
      const result = await db.notification.updateMany({
        where: { storeId, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  static async deleteNotification(storeId: string, notificationId: string) {
    try {
      const notification = await db.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification || notification.storeId !== storeId) {
        throw new ApiError(404, "Notification not found", "NOTIFICATION_NOT_FOUND");
      }

      await db.notification.delete({
        where: { id: notificationId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async getUnreadCount(storeId: string) {
    try {
      const count = await db.notification.count({
        where: { storeId, isRead: false },
      });

      return { unreadCount: count };
    } catch (error) {
      throw error;
    }
  }
}
