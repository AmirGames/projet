import { db } from "../../services/db";
import { logger } from "../../config/logger";
import { ApiError } from "../../utils/errors";

/**
 * Système de notifications pour ZupDrive.
 * Email, SMS, push notifications avec templates configurables et historique.
 */

export interface NotificationTemplate {
  id: string;
  key: string; // DOCUMENT_EXPIRED, INFRACTION_REPORTED, SUSPENSION_NOTICE, etc
  name: string;
  type: "EMAIL" | "SMS" | "PUSH";
  subject?: string; // Pour EMAIL
  body: string;
  variables: string[]; // ["driverName", "documentType", "expiryDate"]
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationLog {
  id: string;
  recipientId: string;
  recipientType: "CHAUFFEUR" | "PASSAGER" | "ADMIN";
  type: "EMAIL" | "SMS" | "PUSH";
  templateKey: string;
  status: "PENDING" | "SENT" | "FAILED" | "BOUNCED";
  recipient: string; // email, phone, or push token
  subject?: string;
  body: string;
  variables: Record<string, string>;
  errorMessage?: string;
  sentAt?: Date;
  failedAt?: Date;
  createdAt: Date;
}

export interface NotificationAlert {
  id: string;
  driverId: string;
  type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE" | "RATING_LOW" | "CUSTOM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  triggerAction?: string; // URL ou action à prendre
  read: boolean;
  readAt?: Date;
  createdAt: Date;
}

export class ZupDriveNotificationsService {
  /**
   * Créer ou mettre à jour un template de notification.
   */
  static async upsertTemplate(data: {
    key: string;
    name: string;
    type: "EMAIL" | "SMS" | "PUSH";
    subject?: string;
    body: string;
    variables: string[];
    active: boolean;
  }): Promise<NotificationTemplate> {
    if (data.type === "EMAIL" && !data.subject) {
      throw new ApiError(400, "Subject requis pour templates EMAIL");
    }

    const template = await db.notificationTemplate.upsert({
      where: { key: data.key },
      update: {
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        variables: JSON.stringify(data.variables),
        active: data.active,
      },
      create: {
        key: data.key,
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        variables: JSON.stringify(data.variables),
        active: data.active,
      },
    });

    logger.info(`Notification template created/updated: ${data.key}`);
    return this.formatTemplate(template);
  }

  /**
   * Lister tous les templates.
   */
  static async listTemplates(activeOnly = true): Promise<NotificationTemplate[]> {
    const templates = await db.notificationTemplate.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { createdAt: "desc" },
    });

    return templates.map((t) => this.formatTemplate(t));
  }

  /**
   * Obtenir un template spécifique.
   */
  static async getTemplate(key: string): Promise<NotificationTemplate> {
    const template = await db.notificationTemplate.findUnique({
      where: { key },
    });

    if (!template) throw new ApiError(404, `Template ${key} non trouvé`);
    return this.formatTemplate(template);
  }

  /**
   * Envoyer une notification à un driver.
   */
  static async sendNotification(data: {
    recipientId: string;
    recipientType: "CHAUFFEUR" | "PASSAGER" | "ADMIN";
    templateKey: string;
    type: "EMAIL" | "SMS" | "PUSH";
    recipient: string; // email, phone, or push token
    variables?: Record<string, string>;
  }): Promise<NotificationLog> {
    const template = await db.notificationTemplate.findUnique({
      where: { key: data.templateKey },
    });

    if (!template || !template.active) {
      throw new ApiError(400, `Template ${data.templateKey} non trouvé ou inactif`);
    }

    // Interpoler les variables dans le template
    let body = template.body;
    let subject = template.subject || "";
    const variables = data.variables || {};

    Object.entries(variables).forEach(([key, value]) => {
      body = body.replace(`{{${key}}}`, value);
      if (subject) subject = subject.replace(`{{${key}}}`, value);
    });

    const notificationLog = await db.notificationLog.create({
      data: {
        recipientId: data.recipientId,
        recipientType: data.recipientType,
        type: data.type,
        templateKey: data.templateKey,
        status: "PENDING",
        recipient: data.recipient,
        subject,
        body,
        variables: JSON.stringify(variables),
      },
    });

    // TODO: Intégrer avec service d'email/SMS/push réel
    // await this.sendViaProvider(data.type, data.recipient, subject, body);

    // Marquer comme envoyé (simulé)
    await db.notificationLog.update({
      where: { id: notificationLog.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });

    logger.info(`Notification sent to ${data.recipientId} (${data.type})`);
    return this.formatNotificationLog(notificationLog);
  }

  /**
   * Envoyer une notification basée sur un événement métier.
   */
  static async triggerEventNotification(event: {
    type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE";
    driverId: string;
    variables: Record<string, string>;
  }): Promise<void> {
    const driver = await db.chauffeurDrive.findUnique({
      where: { id: event.driverId },
      select: { email: true, phone: true },
    });

    if (!driver) throw new ApiError(404, "Chauffeur non trouvé");

    // Mapper l'événement à un template
    const templateMap: Record<string, string> = {
      DOCUMENT_EXPIRY: "DOCUMENT_EXPIRED",
      INFRACTION_REPORTED: "INFRACTION_REPORTED",
      SUSPENSION: "SUSPENSION_NOTICE",
      PAYMENT_ISSUE: "PAYMENT_ISSUE_ALERT",
    };

    const templateKey = templateMap[event.type];
    if (!templateKey) return;

    // Envoyer email
    if (driver.email) {
      await this.sendNotification({
        recipientId: event.driverId,
        recipientType: "CHAUFFEUR",
        templateKey,
        type: "EMAIL",
        recipient: driver.email,
        variables: event.variables,
      });
    }

    // TODO: Envoyer SMS si numéro disponible
  }

  /**
   * Créer une alerte pour un driver.
   */
  static async createAlert(data: {
    driverId: string;
    type: "DOCUMENT_EXPIRY" | "INFRACTION_REPORTED" | "SUSPENSION" | "PAYMENT_ISSUE" | "RATING_LOW" | "CUSTOM";
    severity: "INFO" | "WARNING" | "CRITICAL";
    title: string;
    message: string;
    triggerAction?: string;
  }): Promise<NotificationAlert> {
    const alert = await db.notificationAlert.create({
      data: {
        driverId: data.driverId,
        type: data.type,
        severity: data.severity,
        title: data.title,
        message: data.message,
        triggerAction: data.triggerAction,
        read: false,
      },
    });

    logger.info(`Alert created for driver ${data.driverId}: ${data.type}`);
    return this.formatAlert(alert);
  }

  /**
   * Récupérer les alertes non lues d'un driver.
   */
  static async getUnreadAlerts(driverId: string): Promise<NotificationAlert[]> {
    const alerts = await db.notificationAlert.findMany({
      where: {
        driverId,
        read: false,
      },
      orderBy: { createdAt: "desc" },
    });

    return alerts.map((a) => this.formatAlert(a));
  }

  /**
   * Marquer une alerte comme lue.
   */
  static async markAlertAsRead(alertId: string): Promise<void> {
    await db.notificationAlert.update({
      where: { id: alertId },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    logger.info(`Alert ${alertId} marked as read`);
  }

  /**
   * Marquer toutes les alertes d'un driver comme lues.
   */
  static async markAllAlertsAsRead(driverId: string): Promise<void> {
    await db.notificationAlert.updateMany({
      where: {
        driverId,
        read: false,
      },
      data: {
        read: true,
        readAt: new Date(),
      },
    });

    logger.info(`All alerts for driver ${driverId} marked as read`);
  }

  /**
   * Récupérer l'historique des notifications.
   */
  static async getNotificationHistory(filters: {
    recipientId?: string;
    type?: "EMAIL" | "SMS" | "PUSH";
    status?: "PENDING" | "SENT" | "FAILED" | "BOUNCED";
    limit?: number;
    offset?: number;
  } = {}): Promise<{ logs: NotificationLog[]; total: number }> {
    const limit = Math.min(filters.limit || 50, 100);
    const offset = filters.offset || 0;

    const where: any = {};
    if (filters.recipientId) where.recipientId = filters.recipientId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    const [logs, total] = await Promise.all([
      db.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.notificationLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => this.formatNotificationLog(l)),
      total,
    };
  }

  /**
   * Obtenir les statistiques de notifications.
   */
  static async getNotificationStats(): Promise<{
    totalSent: number;
    totalFailed: number;
    successRate: number;
    byType: Record<string, number>;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const allLogs = await db.notificationLog.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const sentLogs = allLogs.filter((l) => l.status === "SENT");
    const failedLogs = allLogs.filter((l) => l.status === "FAILED");

    const byType: Record<string, number> = {};
    allLogs.forEach((l) => {
      byType[l.type] = (byType[l.type] || 0) + 1;
    });

    return {
      totalSent: sentLogs.length,
      totalFailed: failedLogs.length,
      successRate: allLogs.length > 0 ? (sentLogs.length / allLogs.length) * 100 : 0,
      byType,
    };
  }

  /**
   * Mettre à jour le statut d'une notification (pour webhooks de providers).
   */
  static async updateNotificationStatus(
    notificationLogId: string,
    status: "SENT" | "FAILED" | "BOUNCED",
    errorMessage?: string
  ): Promise<void> {
    const data: any = { status };
    if (status === "FAILED" || status === "BOUNCED") {
      data.failedAt = new Date();
      data.errorMessage = errorMessage;
    } else if (status === "SENT") {
      data.sentAt = new Date();
    }

    await db.notificationLog.update({
      where: { id: notificationLogId },
      data,
    });

    logger.info(`Notification ${notificationLogId} status updated to ${status}`);
  }

  // Formatters

  private static formatTemplate(template: any): NotificationTemplate {
    return {
      id: template.id,
      key: template.key,
      name: template.name,
      type: template.type,
      subject: template.subject || undefined,
      body: template.body,
      variables: JSON.parse(template.variables || "[]"),
      active: template.active,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private static formatNotificationLog(log: any): NotificationLog {
    return {
      id: log.id,
      recipientId: log.recipientId,
      recipientType: log.recipientType,
      type: log.type,
      templateKey: log.templateKey,
      status: log.status,
      recipient: log.recipient,
      subject: log.subject || undefined,
      body: log.body,
      variables: JSON.parse(log.variables || "{}"),
      errorMessage: log.errorMessage || undefined,
      sentAt: log.sentAt || undefined,
      failedAt: log.failedAt || undefined,
      createdAt: log.createdAt,
    };
  }

  private static formatAlert(alert: any): NotificationAlert {
    return {
      id: alert.id,
      driverId: alert.driverId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      triggerAction: alert.triggerAction || undefined,
      read: alert.read,
      readAt: alert.readAt || undefined,
      createdAt: alert.createdAt,
    };
  }
}
